// ==========================================
// AUTOMATIZACIÓN ARCA — delegación real vía AFIPSDK (afip.CreateAutomation)
// ==========================================
// Reemplaza el certificado autofirmado con openssl (que AFIP nunca reconocía)
// por el modelo de delegación real: el cliente delega el WS wsfe a nuestro
// CUIT usando su clave fiscal (se usa una vez acá y se descarta), nosotros
// aceptamos la delegación con NUESTRA clave, y vinculamos el servicio
// delegado a nuestro certificado único de producción (AFIP_EMPRESA_CERT/KEY,
// generado una única vez con create-cert-prod, ver scripts/setup_afip_empresa.js).
//
// Con esto factura.js emite usando siempre el mismo certificado de empresa,
// representando al CUIT del cliente (ver crearAfip() en factura.js).
//
// Docs: https://afipsdk.com/docs/automations/introduction/

import Afip from '@afipsdk/afip.js';
import { logger, logearError } from '../logger.js';
import { actualizarUsuario } from '../db.js';
import { sinClave } from '../util/redaccion.js';

const ACCESS_TOKEN = process.env.AFIPSDK_TOKEN;
const EMPRESA_CUIT = soloDigitos(process.env.AFIP_EMPRESA_CUIT);
const EMPRESA_CLAVE = process.env.AFIP_EMPRESA_CLAVE_FISCAL;
const EMPRESA_CERT_ALIAS = process.env.AFIP_EMPRESA_CERT_ALIAS;

// Sistema a registrar en el punto de venta del cliente. Monotributo por
// defecto porque hoy factura.js solo emite Factura C de monotributo.
// ASUNCIÓN SIN CONFIRMAR CONTRA ARCA REAL: si en algún momento se factura
// para Responsable Inscripto (Factura A/B), este valor probablemente deba
// ser 'RAW' (RECE para aplicativo y web services) en vez de 'MAW'. Falta
// verificar contra una cuenta real antes de dar por buena una u otra.
const SISTEMA_PUNTO_VENTA = 'MAW';

function soloDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

function crearAfipAutomation() {
  return new Afip({ access_token: ACCESS_TOKEN });
}

// Ejecuta una automatización, loguea sin exponer la clave, y tira si no
// terminó en 'complete' (CreateAutomation con wait=true ya espera el resultado).
async function correr(afip, nombre, params) {
  logger.info(`⚙️ Automatización ${nombre} params=${JSON.stringify(sinClave(params))}`);
  try {
    const res = await afip.CreateAutomation(nombre, params, true);
    if (res?.status !== 'complete') {
      throw new Error(`Automatización ${nombre} no completó (status=${res?.status})`);
    }
    return res.data;
  } catch (error) {
    // axios no expone el body real del error en error.message — sin esto
    // solo se ve "Request failed with status code 400" sin saber por qué.
    const detalle = error.response?.data ? JSON.stringify(error.response.data) : null;
    logger.error(`⚙️ Automatización ${nombre} falló. HTTP status=${error.response?.status}. Respuesta AFIPSDK: ${detalle}`);
    throw error;
  }
}

// Busca el primer número de punto de venta libre (1, 2, 3...) consultando
// los puntos ya configurados en ARCA para ese CUIT.
async function buscarNumeroPuntoVentaLibre(afip, cuit, claveFiscal) {
  const existentes = await correr(afip, 'list-sales-points', {
    cuit,
    username: cuit,
    password: claveFiscal,
  });
  const usados = new Set((existentes || []).map((p) => parseInt(p.number, 10)));
  let numero = 1;
  while (usados.has(numero)) numero++;
  return numero;
}

// FLUJO COMPLETO: delega, acepta, vincula al certificado de empresa y crea
// el punto de venta del cliente. La clave fiscal del cliente se usa acá
// mismo y nunca se persiste ni se loguea.
export async function configurarARCAAutomatico(usuarioId, cuit, claveFiscal) {
  const cuitCliente = soloDigitos(cuit);
  const afip = crearAfipAutomation();

  try {
    if (!EMPRESA_CUIT || !EMPRESA_CLAVE || !EMPRESA_CERT_ALIAS) {
      throw new Error('Falta AFIP_EMPRESA_CUIT / AFIP_EMPRESA_CLAVE_FISCAL / AFIP_EMPRESA_CERT_ALIAS en el entorno');
    }

    logger.info(`📝 Iniciando configuración ARCA (delegación real) para ${cuitCliente}...`);

    // 1. El cliente delega wsfe a nuestro CUIT (con su clave, una sola vez).
    await correr(afip, 'delegate-web-service', {
      cuit: cuitCliente,
      username: cuitCliente,
      password: claveFiscal,
      service: 'wsfe',
      delegate_to: EMPRESA_CUIT,
    });

    // 2. Aceptamos la delegación con nuestra propia clave.
    await correr(afip, 'accept-web-service-delegation', {
      cuit: EMPRESA_CUIT,
      username: EMPRESA_CUIT,
      password: EMPRESA_CLAVE,
      service: 'wsfe',
      delegated_cuit: cuitCliente,
    });

    // 3. Vinculamos el servicio delegado a nuestro certificado de producción.
    // Sin este paso la delegación queda aceptada pero no operativa contra WSFE.
    await correr(afip, 'auth-web-service-prod', {
      cuit: EMPRESA_CUIT,
      username: EMPRESA_CUIT,
      password: EMPRESA_CLAVE,
      alias: EMPRESA_CERT_ALIAS,
      service: 'wsfe',
      delegated_from: cuitCliente,
    });

    // 4. Punto de venta del cliente (con su clave, antes de descartarla).
    const numeroPuntoVenta = await buscarNumeroPuntoVentaLibre(afip, cuitCliente, claveFiscal);
    await correr(afip, 'create-sales-point', {
      cuit: cuitCliente,
      username: cuitCliente,
      password: claveFiscal,
      numero: numeroPuntoVenta,
      sistema: SISTEMA_PUNTO_VENTA,
      nombreFantasia: `Facturas7 - ${cuitCliente}`,
    });

    // 5. Persistir estado. Sin cert/key por cliente: se emite con el
    // certificado único de empresa (ver factura.js crearAfip()).
    await actualizarUsuario(usuarioId, {
      cuit: cuitCliente,
      punto_venta: numeroPuntoVenta,
      afipsdk_cert: null,
      afipsdk_key: null,
      entorno: 'produccion',
      delegacion_estado: 'activa',
      actualizado_en: Math.floor(Date.now() / 1000),
    });

    logger.info(`✅ Configuración ARCA completa para ${cuitCliente} (punto de venta ${numeroPuntoVenta})`);

    return {
      exito: true,
      cuit: cuitCliente,
      punto_venta: numeroPuntoVenta,
      mensaje: `✅ ¡Cuenta configurada! Punto de venta: ${numeroPuntoVenta}`,
    };
  } catch (error) {
    logearError(error, 'configurarARCAAutomatico');
    return {
      exito: false,
      error: error.message,
      mensaje: `❌ Error: ${error.message}`,
    };
  }
}

// Descarta clave privada después de usar (documental: nunca se persiste ni loguea).
export function descartarClavePrivada() {
  logger.info('🔐 Clave privada descartada.');
}
