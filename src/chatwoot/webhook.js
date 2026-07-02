import crypto from 'crypto';
import { logger } from '../logger.js';
import { enviarPorEvolution } from '../evolution/webhook.js';

const CHATWOOT_SECRET = process.env.CHATWOOT_WEBHOOK_SECRET;

function validarSignature(req) {
  const signature = req.headers['x-chatwoot-api-signature'];
  if (!signature) return false;

  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', CHATWOOT_SECRET).update(body).digest('hex');
  return hash === signature;
}

export async function handleChatwootWebhook(req, res) {
  try {
    logger.info('📨 Webhook Chatwoot recibido');

    if (!validarSignature(req)) {
      logger.warn('⚠️ Signature inválida - rechazando webhook');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.debug(`Payload: ${JSON.stringify(req.body).substring(0, 300)}`);

    const { event, data } = req.body;

    // Solo procesar mensajes creados por agentes
    if (event !== 'message_created') {
      logger.debug(`Evento ignorado: ${event}`);
      return res.json({ success: true });
    }

    // Verificar que es mensaje del agente (outgoing)
    if (data.message_type !== 1) { // 0=incoming, 1=outgoing
      logger.debug('Mensaje incoming ignorado (solo procesar outgoing de agentes)');
      return res.json({ success: true });
    }

    const { conversation, message } = data;
    if (!conversation || !message) {
      logger.warn('Sin conversation o message en payload');
      return res.json({ success: true });
    }

    // Extraer número WhatsApp del contacto
    // conversation.contact.phone_number incluye el número
    const numeroWhatsapp = conversation?.contact?.phone_number;
    const contenido = message?.content || '';

    if (!numeroWhatsapp || !contenido) {
      logger.warn('Sin número o contenido');
      logger.debug(`Contact: ${JSON.stringify(conversation?.contact).substring(0, 200)}`);
      return res.json({ success: true });
    }

    logger.info(`✅ Respuesta de agente para ${numeroWhatsapp}: ${contenido.substring(0, 50)}`);

    // Enviar por Evolution
    await enviarPorEvolution(numeroWhatsapp, contenido);

    res.json({ success: true });

  } catch (error) {
    logger.error(`❌ Webhook Chatwoot error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}
