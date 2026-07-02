// ==========================================
// INTEGRACIÓN WAPPFLY - Envío de mensajes
// ==========================================
// Funciones para enviar mensajes y descargar media desde Wappfly

import { logger, logearError } from '../logger.js';
import fs from 'fs';
import path from 'path';
import https from 'https';

const WAPPFLY_TOKEN = process.env.WAPPFLY_TOKEN;
const WAPPFLY_API_BASE = 'https://wappfly.com/api';

// Normalizar número a formato JID
function formatearJID(numero) {
  const limpio = numero.replace(/\D/g, '');
  return `${limpio}@s.whatsapp.net`;
}

// ==========================================
// ENVIAR TEXTO
// ==========================================

export async function enviarTexto(numero, texto) {
  try {
    logger.info(`📤 Enviando texto a ${numero} via Wappfly`);

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/send`, {
      method: 'POST',
      headers: {
        'X-API-Token': WAPPFLY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: formatearJID(numero),
        text: texto
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.error || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Mensaje enviado. ID: ${data.msg_id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de texto a ${numero}`);
    throw error;
  }
}

// ==========================================
// ENVIAR DOCUMENTO (PDF)
// ==========================================

export async function enviarDocumento(numero, pdfPath, nombreArchivo) {
  try {
    logger.info(`📄 Enviando documento a ${numero} via Wappfly`);

    // Leer archivo y convertir a base64
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString('base64');

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/document`, {
      method: 'POST',
      headers: {
        'X-API-Token': WAPPFLY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: formatearJID(numero),
        file: base64,
        mimetype: 'application/pdf',
        filename: nombreArchivo
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.error || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Documento enviado. ID: ${data.msg_id}`);
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
    logger.info(`🖼️ Enviando imagen a ${numero} via Wappfly`);

    // Descargar imagen y convertir a base64
    const imageBuffer = await descargarBuffer(urlImagen);
    const base64 = imageBuffer.toString('base64');

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/image`, {
      method: 'POST',
      headers: {
        'X-API-Token': WAPPFLY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: formatearJID(numero),
        file: base64,
        mimetype: 'image/jpeg'
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.error || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Imagen enviada. ID: ${data.msg_id}`);
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
// DESCARGAR MEDIA
// ==========================================

export async function descargarMedia(mediaUrl, nombreArchivo) {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`⬇️ Descargando media de ${mediaUrl}`);

      const dirMedia = path.join(process.cwd(), 'media');
      if (!fs.existsSync(dirMedia)) {
        fs.mkdirSync(dirMedia, { recursive: true });
      }

      const rutaLocal = path.join(dirMedia, nombreArchivo);
      const file = fs.createWriteStream(rutaLocal);

      https.get(mediaUrl, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          logger.info(`✅ Media descargada: ${rutaLocal}`);
          resolve(rutaLocal);
        });
      }).on('error', (err) => {
        fs.unlink(rutaLocal, () => {});
        reject(err);
      });

    } catch (error) {
      logearError(error, `Descarga de media`);
      reject(error);
    }
  });
}
