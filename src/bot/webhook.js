// ==========================================
// WEBHOOK DE WHATSAPP - Arquitectura Robusta
// ==========================================
// Polling worker + health checks + retry logic

import { logger, logearError } from '../logger.js';
import { marcarComoProcesado, yaProcesado } from '../db.js';
import procesarMensaje from './bot.js';

const WAPPFLY_TOKEN = process.env.WAPPFLY_TOKEN;
const WAPPFLY_BASE_URL = 'https://wappfly.com/api';
const POLL_INTERVAL = 5000;

// ==========================================
// VERIFICAR CONFIGURACIÓN AL ARRANCAR
// ==========================================

if (!WAPPFLY_TOKEN || WAPPFLY_TOKEN === 'tu-token-de-wappfly') {
  logger.error('❌ WAPPFLY_TOKEN no configurado o es placeholder');
} else {
  logger.info(`✅ WAPPFLY_TOKEN disponible (${WAPPFLY_TOKEN.substring(0, 8)}...)`);
}

// Estado del polling worker
let pollState = {
  running: false,
  lastError: null,
  lastSuccess: null,
  errorCount: 0,
  missedPings: 0
};

// ==========================================
// WEBHOOK HANDLER (compatibilidad + health)
// ==========================================

export default async function webhookHandler(req, res) {
  // GET: health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      polling: pollState.running,
      lastError: pollState.lastError,
      errorCount: pollState.errorCount
    });
  }

  // POST: webhooks de Wappfly
  if (req.method === 'POST') {
    res.status(200).json({ received: true });
    const { event, data } = req.body;
    if (event === 'message' && data) {
      procesarMensajeWappfly(data.from, data.type, data).catch(error => {
        logearError(error, 'Webhook POST');
      });
    }
    return;
  }

  res.status(405).json({ error: 'Método no permitido' });
}

// ==========================================
// POLLING WORKER - Robusta con reintentos
// ==========================================

export function iniciarPolling() {
  logger.info('🔄 Iniciando polling worker de Wappfly...');

  if (pollState.running) {
    logger.warn('⚠️ Polling ya está corriendo');
    return;
  }

  pollState.running = true;

  // Primera ejecución inmediata
  ejecutarPoll().catch(error => {
    logger.error(`Error en poll inicial: ${error.message}`);
  });

  // Luego cada POLL_INTERVAL
  setInterval(ejecutarPoll, POLL_INTERVAL);
  logger.info(`✅ Polling configurado cada ${POLL_INTERVAL / 1000}s`);
}

async function ejecutarPoll() {
  try {
    // Log de ping para verificar que se ejecuta
    logger.debug(`🔵 Polling... (${new Date().toISOString()})`);

    if (!WAPPFLY_TOKEN) {
      logger.error('❌ WAPPFLY_TOKEN no definido, omitiendo poll');
      pollState.lastError = 'TOKEN_NOT_CONFIGURED';
      pollState.errorCount++;
      return;
    }

    const response = await fetch(`${WAPPFLY_BASE_URL}/messages/recent`, {
      method: 'GET',
      headers: {
        'X-API-Token': WAPPFLY_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      logger.warn(`❌ Wappfly API error: ${error}`);
      pollState.lastError = error;
      pollState.errorCount++;
      return;
    }

    const mensajes = await response.json();
    const count = Array.isArray(mensajes) ? mensajes.length : 0;

    logger.debug(`✅ Poll exitoso: ${count} mensajes`);
    pollState.lastSuccess = new Date().toISOString();
    pollState.errorCount = 0;

    if (!Array.isArray(mensajes) || count === 0) {
      logger.debug(`⏳ Sin mensajes nuevos`);
      return;
    }

    // Procesar mensajes
    for (const msg of mensajes) {
      if (msg.from_me === 1) continue;  // Skip outbound
      if (!msg.msg_id) continue;

      if (yaProcesado(msg.msg_id)) continue;
      marcarComoProcesado(msg.msg_id);

      // Solo chats directos, no grupos
      const numeroCompleto = msg.sender_jid || msg.chat_jid || '';
      if (!numeroCompleto.endsWith('@s.whatsapp.net')) {
        logger.debug(`Ignorado (grupo): ${numeroCompleto}`);
        continue;
      }

      const numero = numeroCompleto.split('@')[0];
      if (!numero) continue;

      logger.info(`📨 Mensaje: de ${numero} tipo=${msg.type} id=${msg.msg_id}`);

      procesarMensajeWappfly(numero, msg.type, msg).catch(error => {
        logearError(error, `Poll procesamiento ${msg.msg_id}`);
      });
    }

  } catch (error) {
    logger.error(`💥 Error en poll: ${error.message}`);
    pollState.lastError = error.message;
    pollState.errorCount++;
  }
}

// ==========================================
// PROCESAR MENSAJE
// ==========================================

async function procesarMensajeWappfly(numero, tipo, data) {
  try {
    let mensaje = {
      from: numero,
      id: data.msg_id,
      type: tipo,
      timestamp: Math.floor(new Date(data.timestamp).getTime() / 1000)
    };

    if (tipo === 'text') {
      mensaje.text = { body: data.body || '' };
      logger.info(`✅ Procesando texto de ${numero}`);
    } else {
      logger.warn(`Tipo ${tipo} no soportado en polling`);
      return;
    }

    await procesarMensaje(mensaje);

  } catch (error) {
    logearError(error, `Procesamiento mensaje Wappfly`);
  }
}
