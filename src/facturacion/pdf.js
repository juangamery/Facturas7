// ==========================================
// GENERACIÓN DE PDFs — Layout tipo ARCA/AFIP
// ==========================================
// Replica la estructura del comprobante oficial (RG 4892/2020):
// header con caja de tipo/código, datos emisor/receptor, tabla de
// ítems, totales, y footer con QR + CAE.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, logearError } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FACTURAS_DIR = path.join(__dirname, '../../facturas');

if (!fs.existsSync(FACTURAS_DIR)) {
  fs.mkdirSync(FACTURAS_DIR, { recursive: true });
}

const COD_COMPROBANTE = {
  'Factura A': '001', 'Factura B': '006', 'Factura C': '011',
  'Nota de Crédito A': '003', 'Nota de Crédito B': '008', 'Nota de Crédito C': '013',
};
const LETRA_COMPROBANTE = {
  'Factura A': 'A', 'Factura B': 'B', 'Factura C': 'C',
  'Nota de Crédito A': 'A', 'Nota de Crédito B': 'B', 'Nota de Crédito C': 'C',
};

const MARGEN = 40;
const ANCHO_PAGINA = 595.28; // A4 pt
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

function moneda(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generarPDFFactura(datosFact) {
  try {
    const nombreArchivo = `Factura_${String(datosFact.numero_factura).replace(/[/\\]/g, '_')}_${Date.now()}.pdf`;
    const rutaArchivo = path.join(FACTURAS_DIR, nombreArchivo);

    const doc = new PDFDocument({ size: 'A4', margin: MARGEN });
    const stream = fs.createWriteStream(rutaArchivo);
    doc.pipe(stream);

    const items = (Array.isArray(datosFact.items) && datosFact.items.length > 0)
      ? datosFact.items
      : [{ concepto: datosFact.concepto, importe: datosFact.importe }];
    const subtotal = items.reduce((sum, i) => sum + (parseFloat(i.importe) || 0), 0);

    let y = MARGEN;

    // ===== "ORIGINAL" =====
    doc.rect(MARGEN, y, ANCHO_UTIL, 20).stroke();
    doc.fontSize(10).font('Helvetica-Bold').text('ORIGINAL', MARGEN, y + 5, { width: ANCHO_UTIL, align: 'center' });
    y += 20;

    // ===== HEADER: emisor (izq) + tipo/numeración (der) =====
    const alturaHeader = 130;
    const colIzqAncho = ANCHO_UTIL * 0.58;
    const colDerX = MARGEN + colIzqAncho;
    const colDerAncho = ANCHO_UTIL - colIzqAncho;

    doc.rect(MARGEN, y, ANCHO_UTIL, alturaHeader).stroke();
    doc.moveTo(colDerX, y).lineTo(colDerX, y + alturaHeader).stroke();

    // -- Columna izquierda: emisor
    doc.fontSize(13).font('Helvetica-Bold')
      .text(datosFact.razon_social_emisor || '', MARGEN + 10, y + 15, { width: colIzqAncho - 20 });
    doc.fontSize(9).font('Helvetica')
      .text(`Domicilio Comercial: ${datosFact.domicilio_emisor || ''}`, MARGEN + 10, y + 55, { width: colIzqAncho - 20 });
    doc.text(`Condición frente al IVA: ${datosFact.condicion_iva || ''}`, MARGEN + 10, y + 75, { width: colIzqAncho - 20 });

    // -- Columna derecha: caja tipo + numeración
    const letra = LETRA_COMPROBANTE[datosFact.tipo_comprobante] || 'C';
    const cod = COD_COMPROBANTE[datosFact.tipo_comprobante] || '011';
    const cajaTipoX = colDerX + 10;
    const cajaTipoAncho = 32;
    doc.rect(cajaTipoX, y + 8, cajaTipoAncho, cajaTipoAncho).stroke();
    doc.fontSize(20).font('Helvetica-Bold').text(letra, cajaTipoX, y + 15, { width: cajaTipoAncho, align: 'center' });
    doc.fontSize(6).font('Helvetica').text(`COD. ${cod}`, cajaTipoX - 5, y + 8 + cajaTipoAncho + 2, { width: cajaTipoAncho + 10, align: 'center' });

    const esNotaCredito = String(datosFact.tipo_comprobante || '').startsWith('Nota de Crédito');
    const tituloComprobante = esNotaCredito ? 'NOTA DE CRÉDITO' : 'FACTURA';
    doc.fontSize(esNotaCredito ? 11 : 15).font('Helvetica-Bold')
      .text(tituloComprobante, cajaTipoX + cajaTipoAncho + 10, y + (esNotaCredito ? 18 : 15), { width: colDerAncho - cajaTipoAncho - 30 });

    doc.fontSize(8).font('Helvetica')
      .text(`Punto de Venta: ${String(datosFact.punto_venta || 1).padStart(5, '0')}   Comp. Nro: ${String(datosFact.numero_factura || '').split('-')[1] || ''}`,
        colDerX + 10, y + 50, { width: colDerAncho - 20 });
    doc.text(`Fecha de Emisión: ${datosFact.fecha_emision || ''}`, colDerX + 10, y + 63, { width: colDerAncho - 20 });

    doc.moveTo(colDerX, y + 78).lineTo(colDerX + colDerAncho, y + 78).stroke();
    doc.text(`CUIT: ${datosFact.cuit_emisor || ''}`, colDerX + 10, y + 85, { width: colDerAncho - 20 });
    doc.text(`Ingresos Brutos: ${datosFact.cuit_emisor || ''}`, colDerX + 10, y + 98, { width: colDerAncho - 20 });

    y += alturaHeader;

    // ===== RECEPTOR =====
    const alturaReceptor = 65;
    doc.rect(MARGEN, y, ANCHO_UTIL, alturaReceptor).stroke();
    doc.fontSize(9).font('Helvetica');
    doc.text(`CUIT / Documento: ${datosFact.documento_cliente || 'CF'}`, MARGEN + 10, y + 10, { width: ANCHO_UTIL - 20 });
    doc.text(`Apellido y Nombre / Razón Social: ${datosFact.razon_social_cliente || ''}`, MARGEN + 10, y + 25, { width: ANCHO_UTIL - 20 });
    doc.text(`Condición frente al IVA: Consumidor Final`, MARGEN + 10, y + 40, { width: ANCHO_UTIL / 2 - 15 });
    doc.text(`Condición de venta: Contado`, MARGEN + ANCHO_UTIL / 2, y + 40, { width: ANCHO_UTIL / 2 - 15 });

    y += alturaReceptor;

    // ===== TABLA DE ÍTEMS =====
    const colsTabla = [
      { titulo: 'Producto / Servicio', ancho: 0.42 },
      { titulo: 'Cantidad', ancho: 0.12 },
      { titulo: 'U. Medida', ancho: 0.14 },
      { titulo: 'Precio Unit.', ancho: 0.16 },
      { titulo: 'Subtotal', ancho: 0.16 },
    ];
    const alturaFilaHeader = 20;
    let x = MARGEN;
    doc.rect(MARGEN, y, ANCHO_UTIL, alturaFilaHeader).fillAndStroke('#eeeeee', '#000000');
    doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
    for (const col of colsTabla) {
      const w = ANCHO_UTIL * col.ancho;
      doc.text(col.titulo, x + 4, y + 6, { width: w - 8 });
      x += w;
    }
    y += alturaFilaHeader;

    doc.font('Helvetica').fontSize(8);
    const alturaFila = 18;
    for (const item of items) {
      x = MARGEN;
      const importe = parseFloat(item.importe) || 0;
      const valores = [item.concepto || '', '1,00', 'unidades', moneda(importe), moneda(importe)];
      for (let i = 0; i < colsTabla.length; i++) {
        const w = ANCHO_UTIL * colsTabla[i].ancho;
        doc.text(valores[i], x + 4, y + 5, { width: w - 8 });
        x += w;
      }
      y += alturaFila;
    }
    doc.rect(MARGEN, y - (alturaFila * items.length), ANCHO_UTIL, alturaFila * items.length).stroke();

    y += 10;

    // ===== TOTALES =====
    const anchoTotales = 220;
    const xTotales = MARGEN + ANCHO_UTIL - anchoTotales;
    doc.rect(xTotales, y, anchoTotales, 55).stroke();
    doc.fontSize(9).font('Helvetica');
    doc.text('Subtotal:', xTotales + 10, y + 8, { width: anchoTotales - 100 });
    doc.text(`$ ${moneda(subtotal)}`, xTotales + anchoTotales - 100, y + 8, { width: 90, align: 'right' });
    doc.text('Importe Otros Tributos:', xTotales + 10, y + 22, { width: anchoTotales - 100 });
    doc.text('$ 0,00', xTotales + anchoTotales - 100, y + 22, { width: 90, align: 'right' });
    doc.font('Helvetica-Bold');
    doc.text('Importe Total:', xTotales + 10, y + 38, { width: anchoTotales - 100 });
    doc.text(`$ ${moneda(subtotal)}`, xTotales + anchoTotales - 100, y + 38, { width: 90, align: 'right' });

    y += 75;

    // ===== FOOTER: QR + CAE =====
    try {
      const qrUrl = generarQRUrl({ ...datosFact, importe: subtotal });
      const qrImageBase64 = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', margin: 1 });
      doc.image(qrImageBase64, MARGEN, y, { width: 90 });
    } catch (qrError) {
      logger.warn(`Error generando QR: ${qrError.message}`);
    }

    doc.fontSize(9).font('Helvetica-Bold').text('ARCA', MARGEN + 100, y + 5);
    doc.fontSize(6).font('Helvetica').text('AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO', MARGEN + 100, y + 18, { width: 150 });

    doc.fontSize(8).font('Helvetica-Bold').text(`CAE N°: ${datosFact.cae || 'PENDIENTE'}`, MARGEN + 280, y + 5, { width: ANCHO_UTIL - 280 });
    doc.font('Helvetica').text(`Fecha de Vto. de CAE: ${datosFact.vencimiento_cae || ''}`, MARGEN + 280, y + 18, { width: ANCHO_UTIL - 280 });
    doc.font('Helvetica-Bold').text(datosFact.cae && !String(datosFact.cae).startsWith('TEST') ? 'Comprobante Autorizado' : 'Comprobante de Prueba (Homologación)', MARGEN + 280, y + 32, { width: ANCHO_UTIL - 280 });

    doc.fontSize(6).font('Helvetica').text(
      'Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación',
      MARGEN, y + 60, { width: ANCHO_UTIL, align: 'center' }
    );

    doc.end();

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

// ===== QR (RG 4892/2020) — URL oficial que AFIP espera al escanear =====
function generarQRUrl(datosFact) {
  const numeroComprobante = parseInt(String(datosFact.numero_factura || '').split('-')[1] || '0', 10);
  const tipoDoc = getTipoDocumento(datosFact.documento_cliente);
  const qrObject = {
    ver: 1,
    fecha: (datosFact.fecha_emision || '').replace(/\//g, '-'),
    cuit: parseInt(String(datosFact.cuit_emisor || '').replace(/\D/g, ''), 10),
    ptoVta: parseInt(datosFact.punto_venta, 10) || 1,
    tipoCmp: getTipoComprobante(datosFact.tipo_comprobante),
    nroCmp: numeroComprobante,
    importe: parseFloat(datosFact.importe) || 0,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: tipoDoc,
    nroDocRec: tipoDoc === 99 ? 0 : parseInt(String(datosFact.documento_cliente).replace(/\D/g, ''), 10) || 0,
    tipoCodAut: 'E',
    codAut: parseInt(String(datosFact.cae).replace(/\D/g, ''), 10) || 0,
  };
  const base64 = Buffer.from(JSON.stringify(qrObject)).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

function getTipoComprobante(tipoComprobante) {
  const mapeo = {
    'Factura A': 1, 'Factura B': 6, 'Factura C': 11,
    'Nota de Crédito A': 3, 'Nota de Crédito B': 8, 'Nota de Crédito C': 13,
  };
  return mapeo[tipoComprobante] || 11;
}

function getTipoDocumento(documento) {
  const doc = String(documento || '').replace(/\s/g, '').toUpperCase();
  if (doc === 'CF' || doc === 'CONSUMIDORFINAL' || doc === '') return 99;
  if (doc.startsWith('DNI')) return 96;
  const digitos = doc.replace(/\D/g, '');
  if (digitos.length === 11) return 80; // CUIT
  if (digitos.length === 7 || digitos.length === 8) return 96; // DNI
  return 99;
}
