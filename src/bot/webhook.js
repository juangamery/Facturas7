// ==========================================
// WEBHOOK DE WHATSAPP - Meta Cloud API
// ==========================================
// GET  → verificación del webhook (hub.challenge)
// POST → mensajes entrantes de Meta (entry[].changes[].value.messages[])

import { logger, logearError } from '../logger.js';
import { marcarComoProcesado, yaProcesado } from '../db.js';
import procesarMensaje from './bot.js';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Dedup en memoria (inmune a fallos de DB). Se limpia al reiniciar.
const procesadosMem = new Set();

// ==========================================
// HANDLER PRINCIPAL
// ==========================================

export default async function webhookHandler(req, res) {
  // GET: verificación del webhook por Meta
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      logger.info('✅ Webhook Meta verificado');
      return res.status(200).send(challenge);
    }
    logger.warn(`❌ Verificación webhook fallida (mode=${mode})`);
    return res.sendStatus(403);
  }

  // POST: mensajes entrantes. Responder 200 rápido SIEMPRE (Meta reintenta si no).
  if (req.method === 'POST') {
    res.status(200).json({ received: true });
    procesarWebhookMeta(req.body).catch(error => {
      logearError(error, 'Webhook POST Meta');
    });
    return;
  }

  res.status(405).json({ error: 'Método no permitido' });
}

// ==========================================
// PARSEO PAYLOAD META
// ==========================================

async function procesarWebhookMeta(body) {
  try {
    if (body?.object !== 'whatsapp_business_account') {
      logger.debug(`Webhook objeto ignorado: ${body?.object}`);
      return;
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Ignorar actualizaciones de estado (sent/delivered/read)
        if (!value.messages) continue;

        for (const msg of value.messages) {
          const messageId = msg.id;
          if (!messageId) continue;

          // Dedup memoria + DB
          if (procesadosMem.has(messageId)) continue;
          procesadosMem.add(messageId);
          if (await yaProcesado(messageId)) continue;
          await marcarComoProcesado(messageId);

          const from = msg.from; // número E.164 solo dígitos (ej: 5493764217673)
          const tipo = msg.type;

          logger.info(`📨 Meta mensaje: de ${from} tipo=${tipo} id=${messageId}`);

          // Normalizar a la forma que espera bot.js
          const mensaje = {
            from,
            id: messageId,
            type: tipo,
            timestamp: parseInt(msg.timestamp) || Math.floor(Date.now() / 1000)
          };

          if (tipo === 'text') {
            mensaje.text = { body: msg.text?.body || '' };
          } else if (tipo === 'image') {
            mensaje.image = { id: msg.image?.id, caption: msg.image?.caption || '' };
          } else if (tipo === 'document') {
            mensaje.document = { id: msg.document?.id, filename: msg.document?.filename };
          } else if (tipo === 'audio') {
            mensaje.audio = { id: msg.audio?.id };
          } else {
            logger.warn(`Tipo ${tipo} no soportado, ignorando`);
            continue;
          }

          await procesarMensaje(mensaje);
        }
      }
    }
  } catch (error) {
    logearError(error, 'procesarWebhookMeta');
  }
}

// ==========================================
// COMPAT: iniciarPolling (Meta no usa polling)
// ==========================================
// index.js importa este símbolo. Meta es push-only vía webhook → no-op.

export function iniciarPolling() {
  logger.info('ℹ️ Meta Cloud API usa webhook push — polling no necesario');
}
