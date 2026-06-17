import axios from 'axios';
import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { procesarMensaje } from './conversacion.js';

const EVOLUTION_API = process.env.EVOLUTION_API_URL;
const EVOLUTION_TOKEN = process.env.EVOLUTION_API_TOKEN;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

export async function handleEvolutionWebhook(req, res) {
  try {
    const { data } = req.body;

    if (!data || !data.message) {
      return res.json({ success: true });
    }

    const message = data.message;
    const numeroWhatsapp = message.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const messageId = message.key?.id;
    const timestamp = message.messageTimestamp;
    const messageType = Object.keys(message)[Object.keys(message).length - 1];

    if (!numeroWhatsapp) {
      return res.json({ success: true });
    }

    const db = getDB();
    const procesado = db.prepare('SELECT * FROM mensajes_procesados WHERE message_id = ?').get(messageId);

    if (procesado) {
      return res.json({ success: true });
    }

    db.prepare('INSERT INTO mensajes_procesados (message_id, procesado_en) VALUES (?, ?)').run(
      messageId,
      Math.floor(Date.now() / 1000)
    );

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
    logger.error(`Error webhook Evolution: ${error.message}`);
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
