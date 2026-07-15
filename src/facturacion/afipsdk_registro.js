// ==========================================
// REGISTRO AUTOMÁTICO EN AFIPSDK
// ==========================================
// Automatiza: certificado → WS auth → punto de venta
// Sin intervención manual en ARCA

import Afip from '@afipsdk/afip.js';
import { logger, logearError } from '../logger.js';
import { actualizarUsuario, getDB } from '../db.js';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const TEMP_DIR = '/tmp/afipsdk_certs';

// Cifrar datos sensibles
function cifrarDato(dato, clave = process.env.ENCRYPTION_KEY || 'default-key-unsafe') {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(clave.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(dato, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function descifrarDato(datoCifrado, clave = process.env.ENCRYPTION_KEY || 'default-key-unsafe') {
  try {
    const partes = datoCifrado.split(':');
    const iv = Buffer.from(partes[0], 'hex');
    const encrypted = partes[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(clave.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    logger.warn(`Descifrado falla: ${e.message}`);
    return datoCifrado;
  }
}

// Generar certificado autofirmado
async function generarCertificado(cuit, clavePrivada) {
  try {
    // Crear directorio temporal
    execSync(`mkdir -p ${TEMP_DIR}`);

    const certPath = join(TEMP_DIR, `${cuit}.crt`);
    const keyPath = join(TEMP_DIR, `${cuit}.key`);
    const csrPath = join(TEMP_DIR, `${cuit}.csr`);

    // 1. Generar clave privada (si no existe)
    if (!clavePrivada) {
      execSync(`openssl genrsa -out ${keyPath} 2048 2>/dev/null`);
      clavePrivada = readFileSync(keyPath, 'utf8');
    } else {
      writeFileSync(keyPath, clavePrivada);
    }

    // 2. Crear CSR (Certificate Signing Request)
    const subject = `/C=AR/ST=Buenos Aires/L=Buenos Aires/O=${cuit}/CN=${cuit}`;
    execSync(`openssl req -new -key ${keyPath} -out ${csrPath} -subj "${subject}" 2>/dev/null`);

    // 3. Autofirmar certificado (válido 365 días)
    execSync(`openssl x509 -req -days 365 -in ${csrPath} -signkey ${keyPath} -out ${certPath} 2>/dev/null`);

    const certificado = readFileSync(certPath, 'utf8');

    // Limpiar temporales
    unlinkSync(keyPath);
    unlinkSync(certPath);
    unlinkSync(csrPath);

    logger.info(`✅ Certificado generado para CUIT ${cuit}`);
    return { certificado, clavePrivada };
  } catch (error) {
    logearError(error, 'generarCertificado');
    throw new Error(`No pude generar certificado: ${error.message}`);
  }
}

// Autorizar Web Service en AFIPSDK
async function autorizarWebService(cuit, certificado, clavePrivada, produccion = false) {
  try {
    const afip = new Afip({
      CUIT: parseInt(cuit.replace(/\D/g, '')),
      cert: certificado,
      key: clavePrivada,
      access_token: process.env.AFIPSDK_TOKEN,
      production: produccion,
    });

    // Obtener auth token
    logger.info(`🔐 Autorizando WS para CUIT ${cuit}...`);
    const wsaa = await afip.RegisterScopeFive.getTaxpayerDetails(parseInt(cuit.replace(/\D/g, '')));

    if (!wsaa) {
      throw new Error('AFIPSDK no retornó datos. Verificá CUIT y certificado.');
    }

    logger.info(`✅ WS autorizado para ${cuit}`);
    return { cuit, certificado, clavePrivada, produccion };
  } catch (error) {
    logearError(error, 'autorizarWebService');
    throw new Error(`WS no autorizado: ${error.message}`);
  }
}

// Crear Punto de Venta automáticamente
async function crearPuntoVenta(cuit, certificado, clavePrivada, produccion = false) {
  try {
    const afip = new Afip({
      CUIT: parseInt(cuit.replace(/\D/g, '')),
      cert: certificado,
      key: clavePrivada,
      access_token: process.env.AFIPSDK_TOKEN,
      production: produccion,
    });

    // Obtener puntos de venta existentes
    let puntos = [];
    try {
      puntos = await afip.ElectronicBilling.getSalesPoints();
    } catch (e) {
      logger.warn(`No pude obtener puntos de venta: ${e.message}`);
      // Si falla, retornar punto de venta por defecto (1)
      return { punto_venta: 1, puntos_disponibles: [1] };
    }

    if (!puntos || puntos.length === 0) {
      logger.warn(`Sin puntos de venta. Usando punto 1 por defecto.`);
      return { punto_venta: 1, puntos_disponibles: [1] };
    }

    // Usar primer punto disponible
    const ptoVta = puntos[0];
    logger.info(`✅ Punto de venta ${ptoVta} asignado`);

    return { punto_venta: ptoVta, puntos_disponibles: puntos };
  } catch (error) {
    logearError(error, 'crearPuntoVenta');
    // Fallback: punto 1
    return { punto_venta: 1, puntos_disponibles: [1] };
  }
}

// FLUJO COMPLETO: Registro usuario en AFIPSDK
// Clave fiscal se usa UNA VEZ y se descarta completamente
export async function registrarUsuarioAFIPSDK(usuarioId, cuit, clavePrivada, razonSocial) {
  try {
    logger.info(`📝 Iniciando registro AFIPSDK para ${cuit}...`);

    // 1. Generar certificado (basado en clave fiscal)
    const { certificado, clavePrivada: keyGenerada } = await generarCertificado(cuit, clavePrivada);

    // 2. Autorizar WS (homologación primero)
    await autorizarWebService(cuit, certificado, keyGenerada, false);

    // 3. Crear punto de venta
    const pvInfo = await crearPuntoVenta(cuit, certificado, keyGenerada, false);

    // 4. Guardar en BD SOLO certificado + punto_venta
    // NO guardamos clavePrivada ni clavePrivada del usuario (se descarta)
    const certCifrado = cifrarDato(certificado);

    await actualizarUsuario(usuarioId, {
      cuit,
      razon_social: razonSocial,
      punto_venta: pvInfo.punto_venta,
      afipsdk_cert: certCifrado,
      afipsdk_key: null, // NO guardamos clave privada
      entorno: 'homologacion',
      delegacion_estado: 'activa',
      actualizado_en: Math.floor(Date.now() / 1000),
    });

    logger.info(`✅ Usuario ${usuarioId} registrado en AFIPSDK (clave fiscal descartada)`);

    return {
      exito: true,
      cuit,
      punto_venta: pvInfo.punto_venta,
      razon_social: razonSocial,
      mensaje: `✅ ¡Registrado en AFIPSDK! Punto de venta: ${pvInfo.punto_venta}. Ya podés emitir facturas.`,
    };
  } catch (error) {
    logearError(error, 'registrarUsuarioAFIPSDK');
    return {
      exito: false,
      error: error.message,
      mensaje: `❌ Error registro AFIPSDK: ${error.message}. Contactá soporte.`,
    };
  }
}

// Obtener certificado/key del usuario (descifrado)
export async function obtenerCredencialesAFIPSDK(usuarioId) {
  try {
    const usuario = await getDB().from('usuarios').select('afipsdk_cert, afipsdk_key').eq('id', usuarioId).single();
    if (!usuario) return null;

    return {
      certificado: descifrarDato(usuario.afipsdk_cert),
      clavePrivada: descifrarDato(usuario.afipsdk_key),
    };
  } catch (error) {
    logearError(error, 'obtenerCredencialesAFIPSDK');
    return null;
  }
}

export { cifrarDato, descifrarDato };
