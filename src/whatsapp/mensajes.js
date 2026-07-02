// ==========================================
// INTEGRACIÓN WAPPFLY - Envío de mensajes
// ==========================================
// Funciones para enviar mensajes y descargar media desde Wappfly

import { logger, logearError } from '../logger.js';
import fs from 'fs';
import path from 'path';
import https from 'https';

const WAPPFLY_TOKEN = process.env.WAPPFLY_TOKEN;
const WAPPFLY_API_BASE = 'https://api.wappfly.com/v1';

// ==========================================
// ENVIAR TEXTO
// ==========================================
// Endpoint: POST /messages/text
// Envía un mensaje de texto a un número WhatsApp

export async function enviarTexto(numero, texto) {
  try {
    logger.info(`📤 Enviando texto a ${numero} via Wappfly`);

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAPPFLY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: numero,
        text: texto
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Mensaje enviado. ID: ${data.messageId || data.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de texto a ${numero}`);
    throw error;
  }
}

// ==========================================
// ENVIAR DOCUMENTO (PDF)
// ==========================================
// Endpoint: POST /messages/document
// Envía un PDF a un número WhatsApp
// Soporta tanto base64 como URL

export async function enviarDocumento(numero, pdfPath, nombreArchivo) {
  try {
    logger.info(`📄 Enviando documento a ${numero} via Wappfly`);

    // Leer archivo y convertir a base64
    const pdfBuffer = fs.readFileSync(pdfPath);
    const base64 = pdfBuffer.toString('base64');

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/document`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAPPFLY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: numero,
        document: base64,
        filename: nombreArchivo
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Documento enviado. ID: ${data.messageId || data.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de documento a ${numero}`);
    throw error;
  }
}

// ==========================================
// ENVIAR DOCUMENTO POR URL
// ==========================================
// Alternativa: enviar documento desde URL

export async function enviarDocumentoURL(numero, urlDocumento, nombreArchivo) {
  try {
    logger.info(`📄 Enviando documento desde URL a ${numero} via Wappfly`);

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/document`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAPPFLY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: numero,
        url: urlDocumento,
        filename: nombreArchivo
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Documento enviado. ID: ${data.messageId || data.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de documento URL a ${numero}`);
    throw error;
  }
}

// ==========================================
// DESCARGAR MEDIA
// ==========================================
// Descarga imágenes y audios que llegan via webhook
// Wappfly proporciona mediaUrl en el payload del webhook

export async function descargarMedia(mediaUrl, nombreArchivo) {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`⬇️ Descargando media de ${mediaUrl}`);

      // Asegurar que existe el directorio
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
        fs.unlink(rutaLocal, () => {}); // Eliminar archivo en caso de error
        reject(err);
      });

    } catch (error) {
      logearError(error, `Descarga de media`);
      reject(error);
    }
  });
}

// ==========================================
// ENVIAR IMAGEN
// ==========================================
// Endpoint: POST /messages/image
// Envía una imagen a un número WhatsApp

export async function enviarImagen(numero, urlImagen) {
  try {
    logger.info(`🖼️ Enviando imagen a ${numero} via Wappfly`);

    const respuesta = await fetch(`${WAPPFLY_API_BASE}/messages/image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAPPFLY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: numero,
        image: urlImagen
      })
    });

    if (!respuesta.ok) {
      const error = await respuesta.json();
      throw new Error(`Wappfly error: ${error.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.info(`✅ Imagen enviada. ID: ${data.messageId || data.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío de imagen a ${numero}`);
    throw error;
  }
}
