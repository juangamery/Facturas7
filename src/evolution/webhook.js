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
    const key = data.key;

    // Número está en data.key.remoteJid (estructura Evolution/Baileys)
    let numeroWhatsapp = key?.remoteJid?.replace('@s.whatsapp.net', '')
                      || key?.remoteJidAlt?.replace('@s.whatsapp.net', '');

    const messageId = key?.id;
    const messageType = Object.keys(message)[Object.keys(message).length - 1];

    logger.info(`✅ remoteJid=${numeroWhatsapp}, type=${messageType}`);

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
    logger.info(`📤 Enviando a Evolution`);

    // Formato del número
    const number = numeroWhatsapp.includes('@') ? numeroWhatsapp : `${numeroWhatsapp}@s.whatsapp.net`;

    const url = `${EVOLUTION_API}/send/${EVOLUTION_INSTANCE}`;
    logger.info(`📍 Endpoint: ${url}`);
    logger.info(`📱 Número: ${number}`);
    logger.info(`💬 Mensaje: ${mensaje.substring(0, 50)}`);

    const payload = {
      number,
      text: mensaje,
      instance: EVOLUTION_INSTANCE
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${EVOLUTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true
    });

    logger.info(`📊 Status: ${response.status}`);
    logger.info(`📄 Respuesta: ${JSON.stringify(response.data).substring(0, 200)}`);

    if (response.status >= 200 && response.status < 300) {
      logger.info(`✅ Enviado OK`);
    } else {
      logger.warn(`⚠️ Status ${response.status}, pero sin error crítoco`);
    }

    return response.data;

  } catch (error) {
    logger.error(`❌ Error: ${error.message}`);
    throw error;
  }
}
