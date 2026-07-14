// ==========================================
// INTEGRACIÓN AFIP SDK (oficial @afipsdk/afip.js)
// ==========================================
// Emite Factura C de monotributo vía Web Services de ARCA/AFIP.
// Homologación (prueba) o producción según AFIPSDK_ENTORNO.

import Afip from '@afipsdk/afip.js';
import { logger, logearError } from '../logger.js';

const ACCESS_TOKEN = process.env.AFIPSDK_TOKEN;
const PRODUCCION = (process.env.AFIPSDK_ENTORNO || 'homologacion') === 'produccion';
const EMPRESA_CERT = process.env.AFIP_EMPRESA_CERT;
const EMPRESA_KEY = process.env.AFIP_EMPRESA_KEY;

// Tipo de comprobante ARCA: 11 = Factura C, 6 = Factura B, 1 = Factura A
const TIPO_COMPROBANTE = { 'Factura C': 11, 'Factura B': 6, 'Factura A': 1 };

// Crea instancia Afip para emitir en nombre de un CUIT (representado).
// En producción usa el certificado ÚNICO de la empresa (modelo delegación).
function crearAfip(cuitRepresentado, produccion = PRODUCCION) {
  const cuit = parseInt(String(cuitRepresentado).replace(/\D/g, ''), 10);
  if (produccion) {
    return new Afip({
      CUIT: cuit,
      cert: EMPRESA_CERT,
      key: EMPRESA_KEY,
      access_token: ACCESS_TOKEN,
      production: true,
    });
  }
  return new Afip({ CUIT: cuit, access_token: ACCESS_TOKEN, production: false });
}

// Tipo de documento receptor: 80 = CUIT, 96 = DNI, 99 = Consumidor final
// El NLU entrega dígitos puros, así que decidimos por longitud.
function getTipoDocumento(documento) {
  const d = String(documento || '').toUpperCase().trim();
  if (d === 'CF' || d === 'CONSUMIDOR FINAL' || d === '') return 99;
  const digitos = d.replace(/\D/g, '');
  if (digitos.length === 11) return 80; // CUIT
  if (digitos.length === 7 || digitos.length === 8) return 96; // DNI
  if (d.startsWith('DNI')) return 96;
  return 99; // sin doc válido → consumidor final
}

function parsearDocumento(documento) {
  const d = String(documento || '').toUpperCase().trim();
  if (d === 'CF' || d === 'CONSUMIDOR FINAL' || d === '') return 0;
  return parseInt(d.replace(/\D/g, ''), 10) || 0;
}

// Fecha AFIP: YYYYMMDD
function fechaAfip() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// ==========================================
// SOLICITAR CAE — emite el comprobante
// ==========================================
export async function solicitarCAE(datosFactura) {
  try {
    const produccion = datosFactura.entorno === 'produccion';
    const afip = crearAfip(datosFactura.cuit, produccion);
    const ptoVta = parseInt(datosFactura.punto_venta, 10) || 1;
    const cbteTipo = TIPO_COMPROBANTE[datosFactura.tipoComprobante || datosFactura.tipo_comprobante || 'Factura C'];

    // Último comprobante emitido → siguiente número
    const ultimo = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    const numero = (ultimo || 0) + 1;

    const docTipo = getTipoDocumento(datosFactura.documento_cliente);
    const docNro = parsearDocumento(datosFactura.documento_cliente);
    const importe = Math.round(parseFloat(datosFactura.importe) * 100) / 100;
    const concepto = datosFactura.concepto_afip || 1; // 1=Productos, 2=Servicios, 3=Ambos

    // Factura C monotributo: no discrimina IVA (ImpNeto = ImpTotal)
    const data = {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: cbteTipo,
      Concepto: concepto,
      DocTipo: docTipo,
      DocNro: docNro,
      CbteDesde: numero,
      CbteHasta: numero,
      CbteFch: parseInt(fechaAfip(), 10),
      ImpTotal: importe,
      ImpTotConc: 0,
      ImpNeto: importe,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
      CondicionIVAReceptorId: parseInt(datosFactura.condicion_iva_cliente || 5, 10), // 5 = Consumidor Final
    };

    const res = await afip.ElectronicBilling.createNextVoucher(data);

    logger.info(`✅ CAE obtenido: ${res.CAE} (comprobante ${res.voucherNumber})`);
    return {
      cae: res.CAE,
      vencimiento_cae: res.CAEFchVto,
      numero_comprobante: res.voucherNumber || numero,
    };

  } catch (error) {
    logearError(error, 'solicitarCAE');
    throw new Error('No pude obtener el CAE de AFIP. Verificá los datos e intentá de nuevo.');
  }
}

// ==========================================
// PADRÓN — auto-completar datos por CUIT
// ==========================================
// Trae razón social, domicilio y condición IVA desde el padrón de ARCA.
// Requiere que el CUIT consultor tenga autorizado el WS de padrón.
export async function consultarPadron(cuitConsultor, cuitBuscado) {
  try {
    const afip = crearAfip(cuitConsultor);
    const cuit = parseInt(String(cuitBuscado).replace(/\D/g, ''), 10);
    const data = await afip.RegisterScopeFive.getTaxpayerDetails(cuit);
    return data;
  } catch (error) {
    logearError(error, 'consultarPadron');
    return null;
  }
}

// ==========================================
// PUNTOS DE VENTA habilitados del CUIT
// ==========================================
export async function obtenerPuntosVenta(cuitEmisor) {
  try {
    const afip = crearAfip(cuitEmisor);
    const puntos = await afip.ElectronicBilling.getSalesPoints();
    return puntos;
  } catch (error) {
    logearError(error, 'obtenerPuntosVenta');
    return null;
  }
}

// ==========================================
// VALIDACIONES PREVIAS
// ==========================================
export function validarDatosFactura(datos) {
  const errores = [];

  if (!datos.razon_social_cliente) errores.push('Falta nombre del cliente');

  if (!datos.documento_cliente) {
    errores.push('Falta documento del cliente');
  } else if (String(datos.documento_cliente).toUpperCase().trim() !== 'CF') {
    const dig = String(datos.documento_cliente).replace(/\D/g, '');
    if (![7, 8, 11].includes(dig.length)) {
      errores.push('Documento inválido. CUIT 11 dígitos, DNI 7-8 dígitos, o CF');
    }
  }

  if (!datos.concepto) errores.push('Falta concepto/descripción');

  if (!datos.importe || isNaN(datos.importe) || datos.importe <= 0) {
    errores.push('Importe inválido (debe ser número positivo)');
  }

  if (!datos.cuit || !String(datos.cuit).match(/^\d{2}-?\d{8}-?\d$/)) {
    errores.push('CUIT del emisor inválido');
  }

  if (!datos.punto_venta || isNaN(datos.punto_venta)) {
    errores.push('Punto de venta inválido');
  }

  return { valido: errores.length === 0, errores };
}
