import axios from 'axios';
import { logger } from '../logger.js';
import { procesarMensaje } from './conversacion.js';

const EVOLUTION_API = process.env.EVOLUTION_API_URL;
const EVOLUTION_TOKEN = process.env.EVOLUTION_API_TOKEN;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

export async function handleEvolutionWebhook(req, res) {
  try {
    logger.info('📨 Webhook Evolution recibido');
    logger.debug(`Payload: ${JSON.stringify(req.body).substring(0, 200)}`);

    const { data } = req.body;

    if (!data || !data.message) {
      logger.debug('Sin data.message, ignorar');
      return res.json({ success: true });
    }

    const message = data.message;
    logger.debug(`Message keys: ${Object.keys(message).join(', ')}`);
    logger.debug(`Message.key: ${JSON.stringify(message.key)}`);

    // Intentar extraer número - múltiples formatos
    let numeroWhatsapp = message.key?.remoteJid?.replace('@s.whatsapp.net', '')
                       || message.remoteJid?.replace('@s.whatsapp.net', '')
                       || data.remoteJid?.replace('@s.whatsapp.net', '')
                       || message.from?.replace('@s.whatsapp.net', '');

    const messageId = message.key?.id || data.id;
    const messageType = Object.keys(message)[Object.keys(message).length - 1];

    logger.info(`Extrayendo: remoteJid=${numeroWhatsapp}, type=${messageType}`);

    if (!numeroWhatsapp) {
      logger.warn('Sin número WhatsApp - payload completo:');
      logger.warn(JSON.stringify(req.body).substring(0, 500));
      return res.json({ success: true });
    }

    let contenido = '';
    let tipo = 'texto';

    if (messageType === 'conversation') {
      contenido = message.conversation;
    } else if (messageType === 'extendedTextMessage') {
      contenido = message.extendedTextMessage?.text || '';
    } else if (messageType === 'audioMessage') {
      tipo = 'audio';
      contenido = 'audio_received';
    } else if (messageType === 'imageMessage') {
      tipo = 'imagen';
      contenido = message.imageMessage?.caption || 'imagen_recibida';
    }

    logger.info(`📨 Mensaje de ${numeroWhatsapp}: [${tipo}] ${contenido.substring(0, 50)}`);

    await procesarMensaje(numeroWhatsapp, contenido, tipo, messageId);

    res.json({ success: true });

  } catch (error) {
    logger.error(`❌ Webhook Evolution error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarPorEvolution(numeroWhatsapp, mensaje) {
  try {
    const url = `${EVOLUTION_API}/message/sendText/${EVOLUTION_INSTANCE}`;

    const response = await axios.post(
      url,
      {
        number: numeroWhatsapp,
        text: mensaje
      },
      {
        headers: {
          Authorization: `Bearer ${EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`✉️ Mensaje enviado a ${numeroWhatsapp}`);
    return response.data;

  } catch (error) {
    logger.error(`Error enviando por Evolution: ${error.message}`);
    throw error;
  }
}
