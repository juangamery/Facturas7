// ==========================================
// WEBHOOK DE WHATSAPP - Recibe mensajes de Wappfly
// ==========================================
// Este archivo:
// 1. Recibe webhooks de Wappfly (POST solamente)
// 2. Deduplica mensajes (para no procesar dos veces el mismo)
// 3. Detecta tipo de mensaje (text, image, audio)
// 4. Llama al handler correspondiente

import { logger, logearError } from '../logger.js';
import { marcarComoProcesado, yaProcesado } from '../db.js';
import procesarMensaje from './bot.js';

// ==========================================
// WEBHOOK DE WAPPFLY
// ==========================================
// Wappfly hace POST con este formato:
// {
//   "event": "message",
//   "data": {
//     "from": "5493764XXXXXX",
//     "type": "text|image|audio",
//     "text": "contenido" (solo para text),
//     "mediaUrl": "https://..." (para image/audio),
//     "messageId": "XXXXX",
//     "timestamp": 1234567890
//   }
// }

export default async function webhookHandler(req, res) {
  // Wappfly solo usa POST, no GET
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST permitido' });
  }

  try {
    // Responder rápido a Wappfly (< 100ms)
    res.status(200).json({ received: true });

    const { event, data } = req.body;

    // Solo procesar eventos de mensaje
    if (event !== 'message' || !data) {
      logger.debug(`Evento ignorado: ${event}`);
      return;
    }

    const { from, type, messageId } = data;

    // Deduplicar: verificar si ya procesamos este mensaje
    if (yaProcesado(messageId)) {
      logger.debug(`Mensaje duplicado ignorado: ${messageId}`);
      return;
    }

    // Marcar como procesado para evitar duplicados
    marcarComoProcesado(messageId);

    logger.info(`📨 Mensaje Wappfly: de ${from} tipo=${type} id=${messageId}`);

    // Procesar en background (no esperar respuesta)
    procesarMensajeWappfly(from, type, data).catch(error => {
      logearError(error, `Procesamiento mensaje ${messageId}`);
    });

  } catch (error) {
    logearError(error, 'Webhook Wappfly');
    // Ya respondimos 200, solo loguear
  }
}

// ==========================================
// PROCESAR MENSAJE SEGÚN TIPO
// ==========================================

async function procesarMensajeWappfly(numero, tipo, data) {
  try {
    let contenido = '';
    let tipoContenido = 'texto';

    // Extraer contenido según tipo de mensaje
    if (tipo === 'text') {
      contenido = data.text || '';
      tipoContenido = 'texto';
    } else if (tipo === 'image') {
      contenido = data.mediaUrl || '';
      tipoContenido = 'imagen';
    } else if (tipo === 'audio') {
      contenido = data.mediaUrl || '';
      tipoContenido = 'audio';
    } else {
      logger.warn(`Tipo de mensaje desconocido: ${tipo}`);
      return;
    }

    logger.info(`✅ Procesando mensaje [${tipoContenido}] de ${numero}`);

    // Llamar al procesador general (mismo que Meta)
    // Estructura compatible: { from, type, content }
    await procesarMensaje({
      from: numero,
      type: tipo,
      content: contenido,
      mediaUrl: data.mediaUrl,
      messageId: data.messageId,
      timestamp: data.timestamp
    });

  } catch (error) {
    logearError(error, `Procesamiento mensaje Wappfly`);
  }
}
