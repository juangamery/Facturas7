// ==========================================
// WEBHOOK DE WHATSAPP - Polling de mensajes Wappfly
// ==========================================
// Este archivo:
// 1. Polling cada 5 segundos a Wappfly API
// 2. Obtiene mensajes nuevos
// 3. Deduplica mensajes (para no procesar dos veces el mismo)
// 4. Detecta tipo de mensaje (text, image, audio)
// 5. Llama al handler correspondiente

import { logger, logearError } from '../logger.js';
import { marcarComoProcesado, yaProcesado } from '../db.js';
import procesarMensaje from './bot.js';

const WAPPFLY_TOKEN = process.env.WAPPFLY_TOKEN;
const WAPPFLY_BASE_URL = 'https://wappfly.com/api';
const POLL_INTERVAL = 5000; // 5 segundos

// Endpoint para recibir webhooks (compatibilidad)
export default async function webhookHandler(req, res) {
  // GET: health check
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'polling', polling: true });
  }

  // POST: podría recibir webhook si Wappfly lo envía
  if (req.method === 'POST') {
    res.status(200).json({ received: true });
    const { event, data } = req.body;
    if (event === 'message' && data) {
      procesarMensajeWappfly(data.from, data.type, data).catch(error => {
        logearError(error, `Procesamiento mensaje POST`);
      });
    }
    return;
  }

  res.status(405).json({ error: 'Método no permitido' });
}

// ==========================================
// POLLING - Obtener mensajes de Wappfly cada 5s
// ==========================================

export function iniciarPolling() {
  logger.info('🔄 Iniciando polling de Wappfly...');
  setInterval(obtenerMensajesWappfly, POLL_INTERVAL);
  // Primera ejecución inmediata
  obtenerMensajesWappfly();
}

async function obtenerMensajesWappfly() {
  try {
    const response = await fetch(`${WAPPFLY_BASE_URL}/messages/recent`, {
      method: 'GET',
      headers: {
        'X-API-Token': WAPPFLY_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      logger.warn(`Wappfly API error: ${response.status}`);
      return;
    }

    const datos = await response.json();
    const mensajes = datos.data || datos.messages || [];

    if (mensajes.length === 0) return;

    logger.debug(`📥 ${mensajes.length} mensajes en Wappfly`);

    for (const msg of mensajes) {
      const messageId = msg.messageId || msg.id || msg.wamid;

      // Deduplicar
      if (yaProcesado(messageId)) continue;
      marcarComoProcesado(messageId);

      logger.info(`📨 Mensaje Wappfly: de ${msg.from} tipo=${msg.type} id=${messageId}`);

      // Procesar en background
      procesarMensajeWappfly(msg.from, msg.type, msg).catch(error => {
        logearError(error, `Procesamiento polling ${messageId}`);
      });
    }

  } catch (error) {
    logger.error(`Error polling Wappfly: ${error.message}`);
  }
}

// ==========================================
// PROCESAR MENSAJE SEGÚN TIPO
// ==========================================

async function procesarMensajeWappfly(numero, tipo, data) {
  try {
    let mensaje = {
      from: numero,
      id: data.messageId,
      type: tipo,
      timestamp: data.timestamp
    };

    // Adaptar estructura según tipo (compatible con bot.js)
    if (tipo === 'text') {
      mensaje.text = { body: data.text || '' };
      logger.info(`✅ Procesando texto de ${numero}`);
    } else if (tipo === 'image') {
      mensaje.image = { id: data.mediaUrl };
      logger.info(`✅ Procesando imagen de ${numero}`);
    } else if (tipo === 'audio') {
      mensaje.audio = { id: data.mediaUrl };
      logger.info(`✅ Procesando audio de ${numero}`);
    } else {
      logger.warn(`Tipo desconocido: ${tipo}`);
      return;
    }

    // Llamar bot.js con estructura compatible Meta
    await procesarMensaje(mensaje);

  } catch (error) {
    logearError(error, `Procesamiento mensaje Wappfly`);
  }
}
