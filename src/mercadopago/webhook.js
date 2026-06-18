import { logger } from '../logger.js';
import { getDB } from '../db.js';

const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || '';

export async function handleMercadoPagoWebhook(req, res) {
  try {
    const { id, type, data } = req.body;

    logger.info(`📍 Webhook MP: ${type} | ID: ${id}`);

    if (type === 'payment') {
      await procesarPagoMP(data);
    } else if (type === 'subscription') {
      await procesarSuscripcionMP(data);
    }

    res.json({ success: true, received: true });

  } catch (error) {
    logger.error(`Error webhook MP: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

async function procesarPagoMP(data) {
  const db = getDB();
  const status = data.status; // approved, pending, rejected

  try {
    logger.info(`💳 Pago: ${status}`);

    if (status === 'approved') {
      logger.info(`✅ Pago aprobado`);
    }

  } catch (error) {
    logger.error(`Error procesando pago: ${error.message}`);
  }
}

async function procesarSuscripcionMP(data) {
  logger.info(`🔄 Suscripción: ${data.status}`);
}
