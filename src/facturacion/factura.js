// ==========================================
// INTEGRACIÓN CON AFIP SDK - Generar facturas
// ==========================================
// Comunicación con afipsdk.com para obtener CAE y número de comprobante

import axios from 'axios';
import { logger, logearError } from '../logger.js';

const API_BASE = 'https://api.afipsdk.com';
const TOKEN = process.env.AFIPSDK_TOKEN;
const ENTORNO = process.env.AFIPSDK_ENTORNO || 'homologacion';

// Tipo de comprobante: 11 = Factura C, 1 = Factura A, 6 = Factura B
const TIPO_COMPROBANTE = {
  'Factura C': 11,
  'Factura A': 1,
  'Factura B': 6
};

// Tipo de documento: 80 = CUIT, 96 = DNI, 99 = Consumidor final
function getTipoDocumento(documento) {
  if (documento === 'CF' || documento.toUpperCase() === 'CONSUMIDOR FINAL') {
    return 99;
  } else if (documento.startsWith('DNI')) {
    return 96;
  } else {
    return 80; // CUIT
  }
}

// Parsear documento a número
function parsearDocumento(documento) {
  if (documento === 'CF' || documento.toUpperCase() === 'CONSUMIDOR FINAL') {
    return 0;
  }

  // Remover "DNI " si existe
  let doc = documento.replace('DNI ', '').trim();
  // Remover guiones del CUIT
  doc = doc.replace(/-/g, '');
  return parseInt(doc);
}

// ==========================================
// OBTENER ÚLTIMO NÚMERO DE COMPROBANTE
// ==========================================

export async function obtenerUltimoComprobante(cuit, puntoVenta) {
  try {
    const response = await axios.get(
      `${API_BASE}/${ENTORNO}/comprobante/ultimo`,
      {
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        params: {
          cuit: cuit.replace(/-/g, ''),
          punto_venta: puntoVenta,
          tipo_comprobante: TIPO_COMPROBANTE['Factura C']
        }
      }
    );

    return response.data.numero || 0;

  } catch (error) {
    logearError(error, 'obtenerUltimoComprobante');
    throw new Error('No pude obtener el último número de factura. Intentá de nuevo.');
  }
}

// ==========================================
// SOLICITAR CAE (Código de Autorización Electrónica)
// ==========================================

export async function solicitarCAE(datosFact
ura) {
  try {
    // Reintentar 2 veces si falla (red inestable)
    let intento = 0;
    let ultError;

    while (intento < 3) {
      try {
        const cuitNumerico = datosFact
ura.cuit.replace(/-/g, '');
        const tipoComp = TIPO_COMPROBANTE[datosFact
ura.tipoComprobante || 'Factura C'];
        const tipoDocRec = getTipoDocumento(datosFact
ura.documento_cliente);
        const nroDocRec = parsearDocumento(datosFact
ura.documento_cliente);

        const payload = {
          punto_venta: datosFact
ura.punto_venta,
          tipo_comprobante: tipoComp,
          fecha_emision: datosFact
ura.fecha_emision,
          razon_social_receptor: datosFact
ura.razon_social_cliente,
          tipo_documento_receptor: tipoDocRec,
          numero_documento_receptor: nroDocRec,
          concepto: datosFact
ura.concepto,
          importe_total: datosFact
ura.importe,
          condicion_iva_receptor: datosFact
ura.condicion_iva_cliente || '5' // 5 = Consumidor final
        };

        const response = await axios.post(
          `${API_BASE}/${ENTORNO}/comprobante/solicitar-cae`,
          payload,
          {
            headers: { 'Authorization': `Bearer ${TOKEN}` },
            timeout: 10000
          }
        );

        if (response.data.cae && response.data.vencimiento_cae) {
          logger.info(`✅ CAE obtenido: ${response.data.cae}`);
          return {
            cae: response.data.cae,
            vencimiento_cae: response.data.vencimiento_cae,
            numero_comprobante: response.data.numero_comprobante
          };
        } else {
          throw new Error('Respuesta inválida de AFIP SDK');
        }

      } catch (e) {
        ultError = e;
        intento++;
        if (intento < 3) {
          logger.warn(`Intento ${intento} fallido, reintentando...`);
          await new Promise(r => setTimeout(r, 3000)); // Esperar 3 segundos
        }
      }
    }

    throw ultError;

  } catch (error) {
    logearError(error, 'solicitarCAE');
    throw new Error('No pude obtener el CAE. Verificá los datos e intentá de nuevo.');
  }
}

// ==========================================
// VALIDACIONES PREVIAS
// ==========================================

export function validarDatosFactura(datos) {
  const errores = [];

  if (!datos.razon_social_cliente) {
    errores.push('Falta nombre del cliente');
  }

  if (!datos.documento_cliente) {
    errores.push('Falta documento del cliente');
  } else if (datos.documento_cliente !== 'CF' &&
    !datos.documento_cliente.match(/^(\d{2}-\d{8}-\d|DNI\s*\d{7,8})$/)) {
    errores.push('Documento inválido. Formatos: 20-12345678-9, DNI 12345678, CF');
  }

  if (!datos.concepto) {
    errores.push('Falta concepto/descripción');
  }

  if (!datos.importe || isNaN(datos.importe) || datos.importe <= 0) {
    errores.push('Importe inválido (debe ser número positivo)');
  }

  if (!datos.cuit || !datos.cuit.match(/^\d{2}-\d{8}-\d$/)) {
    errores.push('CUIT del emisor inválido');
  }

  if (!datos.punto_venta || isNaN(datos.punto_venta)) {
    errores.push('Punto de venta inválido');
  }

  return {
    valido: errores.length === 0,
    errores
  };
}
