import axios from 'axios';
import { logger } from '../logger.js';
import { procesarMensaje } from './conversacion.js';

const ZAVU_API_KEY = process.env.ZAVU_API_KEY;
const ZAVU_API_BASE = 'https://api.zavu.dev/v1';

export async function handleZavuWebhook(req, res) {
  try {
    logger.info('📨 Webhook Zavu recibido');
    logger.debug(`Payload: ${JSON.stringify(req.body).substring(0, 200)}`);

    const event = req.body;

    // Zavu envía eventos de tipo message.incoming para mensajes recibidos
    if (event.type !== 'message.incoming') {
      logger.debug(`Evento ignorado: ${event.type}`);
      return res.json({ success: true });
    }

    const { message, from, channel } = event;

    if (!message || !from) {
      logger.warn('Sin message o from en payload');
      return res.json({ success: true });
    }

    const numeroWhatsapp = from;
    const messageId = event.id;

    logger.info(`✅ Mensaje de ${numeroWhatsapp} via ${channel}: ${message.substring(0, 50)}`);

    // Procesar mensaje (mismo flujo que Evolution)
    await procesarMensaje(numeroWhatsapp, message, 'texto', messageId);

    res.json({ success: true });

  } catch (error) {
    logger.error(`❌ Webhook Zavu error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarPorZavu(numeroWhatsapp, mensaje) {
  try {
    logger.info(`📤 Enviando por Zavu`);

    const url = `${ZAVU_API_BASE}/messages`;

    const payload = {
      to: numeroWhatsapp,
      text: mensaje,
      channel: 'auto', // Zavu elige el mejor canal (WhatsApp, SMS, etc)
      fallbackEnabled: true // Si WhatsApp falla, usa SMS
    };

    logger.info(`📍 Endpoint: ${url}`);
    logger.info(`📱 Número: ${numeroWhatsapp}`);
    logger.info(`💬 Mensaje: ${mensaje.substring(0, 50)}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${ZAVU_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    logger.info(`📊 Status: ${response.status}`);
    logger.info(`📄 Respuesta: ${JSON.stringify(response.data).substring(0, 200)}`);

    if (response.status >= 200 && response.status < 300) {
      logger.info(`✅ Enviado OK via ${response.data.channel || 'auto'}`);
    } else {
      logger.warn(`⚠️ Status ${response.status}`);
    }

    return response.data;

  } catch (error) {
    logger.error(`❌ Error Zavu: ${error.message}`);
    throw error;
  }
}
