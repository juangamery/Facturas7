// ==========================================
// INTEGRACIÓN META CLOUD API - Envío de mensajes
// ==========================================
// Envío de texto, documentos (PDF) e imágenes vía WhatsApp Cloud API (Meta).
// Reemplaza la capa Wappfly. Mantiene las mismas firmas de export.

import { logger, logearError } from '../logger.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import FormData from 'form-data';

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

// Meta espera el número en E.164 solo dígitos, sin '+', sin @s.whatsapp.net.
// Quirk Argentina: el wa_id viene como 549XXXXXXXXXX (con 9) pero Meta SOLO
// entrega a 54XXXXXXXXXX (sin 9). Normalizamos quitando ese 9.
function formatearNumero(numero) {
  let n = String(numero).replace(/@.*$/, '').replace(/\D/g, '');
  if (/^549\d{10}$/.test(n)) n = '54' + n.slice(3);
  return n;
}

// ==========================================
// ENVIAR TEXTO
// ==========================================

export async function enviarTexto(numero, texto) {
  try {
    const to = formatearNumero(numero);
    logger.info(`📤 Enviando texto a ${to} via Meta`);

    const respuesta = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: texto }
      })
    });

    const data = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(`Meta error: ${data.error?.message || respuesta.statusText}`);
    }

    logger.info(`✅ Mensaje enviado. ID: ${data.messages?.[0]?.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de texto a ${numero}`);
    throw error;
  }
}

// ==========================================
// SUBIR MEDIA (helper) → retorna media_id
// ==========================================

async function subirMedia(buffer, mimetype, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, { filename, contentType: mimetype });
  form.append('type', mimetype);

  const respuesta = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      ...form.getHeaders()
    },
    body: form
  });

  const data = await respuesta.json();
  if (!respuesta.ok || !data.id) {
    throw new Error(`Meta media upload error: ${data.error?.message || respuesta.statusText}`);
  }
  return data.id;
}

// ==========================================
// ENVIAR DOCUMENTO (PDF)
// ==========================================

export async function enviarDocumento(numero, pdfPath, nombreArchivo) {
  try {
    const to = formatearNumero(numero);
    logger.info(`📄 Enviando documento a ${to} via Meta`);

    const pdfBuffer = fs.readFileSync(pdfPath);
    const mediaId = await subirMedia(pdfBuffer, 'application/pdf', nombreArchivo);

    const respuesta = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { id: mediaId, filename: nombreArchivo }
      })
    });

    const data = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(`Meta error: ${data.error?.message || respuesta.statusText}`);
    }

    logger.info(`✅ Documento enviado. ID: ${data.messages?.[0]?.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de documento a ${numero}`);
    throw error;
  }
}

// ==========================================
// ENVIAR IMAGEN
// ==========================================

export async function enviarImagen(numero, urlImagen) {
  try {
    const to = formatearNumero(numero);
    logger.info(`🖼️ Enviando imagen a ${to} via Meta`);

    const imageBuffer = await descargarBuffer(urlImagen);
    const mediaId = await subirMedia(imageBuffer, 'image/jpeg', 'imagen.jpg');

    const respuesta = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { id: mediaId }
      })
    });

    const data = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(`Meta error: ${data.error?.message || respuesta.statusText}`);
    }

    logger.info(`✅ Imagen enviada. ID: ${data.messages?.[0]?.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de imagen a ${numero}`);
    throw error;
  }
}

// ==========================================
// DESCARGAR BUFFER (helper)
// ==========================================

function descargarBuffer(urlMedia) {
  return new Promise((resolve, reject) => {
    https.get(urlMedia, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// ==========================================
// DESCARGAR MEDIA DE META (por media_id)
// ==========================================
// Meta no da URL directa: primero GET /{media_id} para la URL temporal,
// luego descarga con el token. Retorna ruta local.

export async function descargarMedia(mediaId, nombreArchivo) {
  try {
    logger.info(`⬇️ Descargando media Meta id=${mediaId}`);

    // 1. Obtener URL temporal
    const metaResp = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const metaData = await metaResp.json();
    if (!metaData.url) {
      throw new Error(`No se obtuvo URL de media: ${metaData.error?.message || 'sin url'}`);
    }

    // 2. Descargar binario con token
    const binResp = await fetch(metaData.url, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const arrayBuffer = await binResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const dirMedia = path.join(process.cwd(), 'media');
    if (!fs.existsSync(dirMedia)) fs.mkdirSync(dirMedia, { recursive: true });

    const rutaLocal = path.join(dirMedia, nombreArchivo);
    fs.writeFileSync(rutaLocal, buffer);
    logger.info(`✅ Media descargada: ${rutaLocal}`);
    return rutaLocal;

  } catch (error) {
    logearError(error, `Descarga de media Meta`);
    throw error;
  }
}
