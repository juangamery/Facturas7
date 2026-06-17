// ==========================================
// GENERACIÓN DE PDFs - Con pdfkit y QR
// ==========================================
// Genera PDF de factura con datos, QR (RG 4892/2020) y lo guarda

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, logearError } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FACTURAS_DIR = path.join(__dirname, '../../facturas');

// Crear directorio si no existe
if (!fs.existsSync(FACTURAS_DIR)) {
  fs.mkdirSync(FACTURAS_DIR, { recursive: true });
}

// ===== GENERAR PDF DE FACTURA =====

export async function generarPDFFactura(datosFact) {
  try {
    const nombreArchivo = `Factura_${datosFact.numero_factura.replace(/-/g, '_')}_${Date.now()}.pdf`;
    const rutaArchivo = path.join(FACTURAS_DIR, nombreArchivo);

    // Crear documento PDF
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(rutaArchivo);

    doc.pipe(stream);

    // ===== ENCABEZADO =====
    doc.fontSize(14).font('Helvetica-Bold').text('FACTURA ELECTRÓNICA', 50, 50);
    doc.fontSize(10).font('Helvetica').text(`Tipo: ${datosFact.tipo_comprobante}`, 50, 70);
    doc.fontSize(10).text(`Número: ${datosFact.numero_factura}`, 50, 85);
    doc.fontSize(10).text(`Fecha: ${datosFact.fecha_emision}`, 50, 100);

    // ===== DATOS DEL EMISOR =====
    doc.fontSize(11).font('Helvetica-Bold').text('EMISOR', 50, 130);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Razón Social: ${datosFact.razon_social_emisor || 'N/A'}`, 50, 150);
    doc.text(`CUIT: ${datosFact.cuit_emisor || 'N/A'}`, 50, 165);
    doc.text(`Domicilio: ${datosFact.domicilio_emisor || 'N/A'}`, 50, 180);
    doc.text(`Condición IVA: ${datosFact.condicion_iva_emisor || 'N/A'}`, 50, 195);
    doc.text(`Punto de Venta: ${datosFact.punto_venta || 'N/A'}`, 50, 210);

    // ===== DATOS DEL RECEPTOR =====
    doc.fontSize(11).font('Helvetica-Bold').text('RECEPTOR', 350, 130);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Razón Social: ${datosFact.razon_social_cliente}`, 350, 150);
    doc.text(`Documento: ${datosFact.documento_cliente}`, 350, 165);

    // ===== CONCEPTO E IMPORTE =====
    doc.fontSize(11).font('Helvetica-Bold').text('CONCEPTO', 50, 250);
    doc.fontSize(9).font('Helvetica');
    doc.text(datosFact.concepto, 50, 270, { width: 400 });

    doc.fontSize(11).font('Helvetica-Bold').text('IMPORTE', 50, 330);
    doc.fontSize(14).font('Helvetica-Bold').text(`$${datosFact.importe.toLocaleString('es-AR')}`, 50, 350);

    // ===== CAE =====
    doc.fontSize(10).font('Helvetica-Bold').text('CAE:', 50, 400);
    doc.fontSize(10).font('Helvetica').text(datosFact.cae || 'PENDIENTE', 50, 420);

    doc.fontSize(9).font('Helvetica').text(`Vencimiento CAE: ${datosFact.vencimiento_cae || 'N/A'}`, 50, 440);

    // ===== QR CODE (RG 4892/2020) =====
    try {
      const qrData = generarQRData(datosFact);
      const qrImageBase64 = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H' });

      // Insertar QR en PDF
      doc.image(qrImageBase64, 350, 380, { width: 150 });

    } catch (error) {
      logger.warn(`Error generando QR: ${error.message}`);
    }

    // ===== PIE DE PÁGINA =====
    doc.fontSize(8).font('Helvetica').text(
      'Este documento es una representación impresa de una factura electrónica. Verificar autenticidad en www.arca.gob.ar',
      50,
      700,
      { width: 500, align: 'center' }
    );

    // Finalizar PDF
    doc.end();

    // Retornar path cuando se termine de escribir
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`PDF generado: ${rutaArchivo}`);
        resolve(rutaArchivo);
      });

      stream.on('error', reject);
    });

  } catch (error) {
    logearError(error, 'generarPDFFactura');
    throw new Error('Error generando PDF');
  }
}

// ===== GENERAR DATOS PARA QR (RG 4892/2020) =====

function generarQRData(datosFact) {
  const qrObject = {
    ver: 1,
    fecha: datosFact.fecha_emision.replace(/\//g, '-'),
    cuit: parseInt(datosFact.cuit_emisor.replace(/-/g, '')),
    ptoVta: datosFact.punto_venta,
    tipoCmp: getTipoComprobante(datosFact.tipo_comprobante),
    nroCmp: parseInt(datosFact.numero_factura.split('-')[1]),
    importe: datosFact.importe,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: getTipoDocumento(datosFact.documento_cliente),
    nroDocRec: parseInt(datosFact.documento_cliente.replace(/\D/g, '')),
    tipoCodAut: 'E',
    codAut: parseInt(datosFact.cae)
  };

  // Convertir a JSON y luego a Base64
  const jsonString = JSON.stringify(qrObject);
  return Buffer.from(jsonString).toString('base64');
}

// Obtener tipo de comprobante (para QR)
function getTipoComprobante(tipoComprobante) {
  const mapeo = {
    'Factura A': 1,
    'Factura B': 6,
    'Factura C': 11
  };
  return mapeo[tipoComprobante] || 11;
}

// Obtener tipo de documento (para QR)
function getTipoDocumento(documento) {
  const doc = documento.replace(/\s/g, '').toUpperCase();

  if (doc === 'CF' || doc === 'CONSUMIDORFINAL') return 99;
  if (doc.startsWith('DNI')) return 96;
  return 80; // CUIT
}
