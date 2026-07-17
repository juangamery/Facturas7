// ==========================================
// DESCARGA DE MEDIA (Audio, Imágenes) — Meta Cloud API
// ==========================================
// Los media.id vienen del webhook de Meta, no de Wappfly.
// Descarga en 2 pasos (documentado por Meta):
// 1. GET /{media-id} → devuelve una URL temporal + mime_type
// 2. GET esa URL (con el mismo Authorization) → bytes del archivo

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from '../logger.js';

const MEDIA_DIR = './media';
const TOKEN = process.env.WHATSAPP_TOKEN;
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

const EXTENSIONES = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/amr': 'amr',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export async function descargarMediaDeTelefono(mediaID) {
  try {
    if (!TOKEN) {
      logger.warn('WHATSAPP_TOKEN no configurado, no puedo descargar media');
      return null;
    }

    // 1. Obtener URL temporal + mime_type del media
    const meta = await axios.get(`${GRAPH_BASE}/${mediaID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const { url, mime_type } = meta.data || {};
    if (!url) {
      logger.warn(`Media ${mediaID}: Meta no devolvió URL de descarga`);
      return null;
    }

    // 2. Descargar el binario (requiere el mismo Authorization, la URL es temporal)
    const ext = EXTENSIONES[mime_type] || 'bin';
    const filename = path.join(MEDIA_DIR, `${mediaID}.${ext}`);
    const archivo = await axios.get(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      responseType: 'arraybuffer',
    });
    fs.writeFileSync(filename, archivo.data);

    logger.info(`✅ Media descargado: ${mediaID} (${mime_type})`);
    return filename;
  } catch (error) {
    logger.error(`descargarMediaDeTelefono(${mediaID}) falla: ${error.response?.status || ''} ${error.message}`);
    return null;
  }
}
