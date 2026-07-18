// ==========================================
// ONBOARDING AFIP — delegación con certificado único de empresa
// ==========================================
// Habilita a un cliente para facturar en producción sin que genere
// certificados propios. El cliente delega el web service wsfe a nuestro CUIT
// (rápido con su clave, o manual por ARCA) y nosotros emitimos en su nombre.

import Afip from '@afipsdk/afip.js';
import { logger, logearError } from '../logger.js';
import { sinClave } from '../util/redaccion.js';

const ACCESS_TOKEN = process.env.AFIPSDK_TOKEN;
const EMPRESA_CUIT = process.env.AFIP_EMPRESA_CUIT;
const EMPRESA_CLAVE = process.env.AFIP_EMPRESA_CLAVE_FISCAL;
const EMPRESA_CERT_ALIAS = process.env.AFIP_EMPRESA_CERT_ALIAS;

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

// El cliente (cuit) delega wsfe a la empresa (delegate_to).
export function paramsDelegar(cuitCliente, claveCliente, cuitEmpresa) {
  const cuit = soloDigitos(cuitCliente);
  return {
    cuit,
    username: cuit,
    password: claveCliente,
    delegate_to: soloDigitos(cuitEmpresa),
    service: 'wsfe',
  };
}

// La empresa acepta la delegación que le hizo el cliente (delegated_cuit).
export function paramsAceptar(cuitEmpresa, claveEmpresa, cuitCliente) {
  const cuit = soloDigitos(cuitEmpresa);
  return {
    cuit,
    username: cuit,
    password: claveEmpresa,
    delegated_cuit: soloDigitos(cuitCliente),
    service: 'wsfe',
  };
}

// Vincula el servicio delegado al certificado de producción de la empresa.
// Sin este paso la delegación queda aceptada pero no operativa contra WSFE.
export function paramsAutorizarProd(cuitEmpresa, claveEmpresa, cuitCliente) {
  const cuit = soloDigitos(cuitEmpresa);
  return {
    cuit,
    username: cuit,
    password: claveEmpresa,
    alias: EMPRESA_CERT_ALIAS,
    service: 'wsfe',
    delegated_from: soloDigitos(cuitCliente),
  };
}

// Crea el punto de venta webservice de monotributo del cliente.
export function paramsPuntoVenta(cuitCliente, claveCliente, numero) {
  const cuit = soloDigitos(cuitCliente);
  return {
    cuit,
    username: cuit,
    password: claveCliente,
    numero,
    sistema: 'MAW', // Monotributo - Webservice
    nombreFantasia: `Facturas7 - ${cuit}`,
  };
}

function crearAfipAutomation() {
  return new Afip({ access_token: ACCESS_TOKEN });
}

// Ejecuta una automatización y loguea SIN la clave.
async function correr(afip, nombre, params) {
  logger.info(`⚙️ Automatización ${nombre} params=${JSON.stringify(sinClave(params))}`);
  const res = await afip.CreateAutomation(nombre, params, true);
  if (res?.status && res.status !== 'complete') {
    throw new Error(`Automatización ${nombre} estado=${res.status}`);
  }
  return res;
}

// Camino RÁPIDO: el cliente da su clave. Delegamos, aceptamos y creamos PV.
// La clave del cliente se usa acá y NO se retorna ni se persiste.
export async function activarClienteRapido(cuitCliente, claveCliente, numeroPuntoVenta = 1) {
  const afip = crearAfipAutomation();
  try {
    await correr(afip, 'delegate-web-service', paramsDelegar(cuitCliente, claveCliente, EMPRESA_CUIT));
    await correr(afip, 'accept-web-service-delegation', paramsAceptar(EMPRESA_CUIT, EMPRESA_CLAVE, cuitCliente));
    await correr(afip, 'auth-web-service-prod', paramsAutorizarProd(EMPRESA_CUIT, EMPRESA_CLAVE, cuitCliente));
    await correr(afip, 'create-sales-point', paramsPuntoVenta(cuitCliente, claveCliente, numeroPuntoVenta));
    logger.info(`✅ Cliente ${soloDigitos(cuitCliente)} activado (rápido)`);
    return { ok: true, punto_venta: numeroPuntoVenta };
  } catch (error) {
    logearError(error, 'activarClienteRapido');
    return { ok: false, error: error.message };
  }
}

// Camino MANUAL: el cliente ya delegó y creó su PV en ARCA. Solo aceptamos.
export async function activarClienteManual(cuitCliente, numeroPuntoVenta) {
  const afip = crearAfipAutomation();
  try {
    await correr(afip, 'accept-web-service-delegation', paramsAceptar(EMPRESA_CUIT, EMPRESA_CLAVE, cuitCliente));
    await correr(afip, 'auth-web-service-prod', paramsAutorizarProd(EMPRESA_CUIT, EMPRESA_CLAVE, cuitCliente));
    logger.info(`✅ Cliente ${soloDigitos(cuitCliente)} activado (manual)`);
    return { ok: true, punto_venta: numeroPuntoVenta };
  } catch (error) {
    logearError(error, 'activarClienteManual');
    return { ok: false, error: error.message };
  }
}
