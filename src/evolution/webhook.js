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

    const number = numeroWhatsapp.includes('@') ? numeroWhatsapp : `${numeroWhatsapp}@s.whatsapp.net`;

    // Endpoint correcto (retorna 401, no 404)
    const url = `${EVOLUTION_API}/message/sendText/${EVOLUTION_INSTANCE}`;

    // Payload correcto
    const payload = { number, text: mensaje, instance: EVOLUTION_INSTANCE };

    // Headers a probar
    const headerVariants = [
      { 'Authorization': `Bearer ${EVOLUTION_TOKEN}`, 'Content-Type': 'application/json' },
      { 'X-API-Token': EVOLUTION_TOKEN, 'Content-Type': 'application/json' },
      { 'Authorization': EVOLUTION_TOKEN, 'Content-Type': 'application/json' },
      { 'api-key': EVOLUTION_TOKEN, 'Content-Type': 'application/json' }
    ];

    logger.info(`📍 Probando 4 header variants en ${url}`);
    logger.info(`📱 Número: ${number}`);

    let response = null;

    for (let i = 0; i < headerVariants.length && !response; i++) {
      try {
        const headers = headerVariants[i];
        const headerName = Object.keys(headers)[0];

        logger.info(`🔄 Intento ${i+1}: ${headerName}`);
        logger.debug(`Header value: ${headers[headerName].substring(0, 30)}...`);

        response = await axios.post(url, payload, {
          headers,
          timeout: 5000,
          validateStatus: () => true
        });

        logger.info(`📊 Status ${response.status}`);
        logger.debug(`Response headers: ${JSON.stringify(response.headers)}`);
        logger.debug(`Response body: ${JSON.stringify(response.data).substring(0, 500)}`);

        if (response.status >= 200 && response.status < 300) {
          logger.info(`✅ ÉXITO con ${headerName}`);
          return response.data;
        } else if (response.status === 401) {
          logger.warn(`⚠️ 401 Unauthorized - posible: token inválido, permisos faltantes, o token expirado`);
        }

        response = null;
      } catch (err) {
        logger.warn(`Intento ${i+1} error: ${err.message}`);
        if (err.response) {
          logger.warn(`Error status: ${err.response.status}`);
          logger.warn(`Error data: ${JSON.stringify(err.response.data).substring(0, 300)}`);
        }
      }
    }

    logger.error(`❌ Todos los headers fallaron`);
    logger.error(`URL probada: ${url}`);
    logger.error(`Instance: ${EVOLUTION_INSTANCE}`);
    logger.error(`Token (primeros 10): ${EVOLUTION_TOKEN.substring(0, 10)}...`);
    return { error: 'Auth failed with all headers' };

  } catch (error) {
    logger.error(`❌ Error fatal: ${error.message}`);
    throw error;
  }
}
