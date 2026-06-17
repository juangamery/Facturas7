// ==========================================
// WEBHOOK DE WHATSAPP - Recibe mensajes de Meta
// ==========================================
// Este archivo:
// 1. Verifica webhook de Meta (se ejecuta una sola vez en setup)
// 2. Recibe todos los mensajes/imágenes/audios que llegan
// 3. Deduplica mensajes (para no procesar dos veces el mismo)
// 4. Detecta tipo de mensaje y llama al handler correspondiente

import { logger, logearError } from '../logger.js';
import { marcarComoProcesado, yaProcesado } from '../db.js';
import procesarMensaje from './bot.js';

// ==========================================
// VERIFICACIÓN DE WEBHOOK (GET request)
// ==========================================

export default function webhookHandler(req, res) {
  const metodo = req.method;

  // Meta hace GET /webhooks/whatsapp?hub.challenge=token
  // Nosotros responder con el challenge para verificar
  if (metodo === 'GET') {
    return manejarVerificacion(req, res);
  }

  // Meta hace POST con los mensajes
  if (metodo === 'POST') {
    return manejarMensaje(req, res);
  }

  res.status(405).json({ error: 'Método no permitido' });
}

// ==========================================
// GET - VERIFICAR WEBHOOK
// ==========================================

function manejarVerificacion(req, res) {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.challenge'];
  const miToken = process.env.WEBHOOK_VERIFY_TOKEN;

  // Token debe coincidir exactamente
  if (modo === 'subscribe' && token === miToken) {
    logger.info('✅ Webhook verificado por Meta');
    // Meta espera que respondamos con el challenge
    return res.status(200).send(token);
  }

  logger.warn(`❌ Intento de verificación fallido (token incorrecto)`);
  res.status(403).json({ error: 'Token inválido' });
}

// ==========================================
// POST - PROCESAR MENSAJE
// ==========================================

async function manejarMensaje(req, res) {
  try {
    // Meta espera respuesta rápida (< 100ms)
    // Por eso respondemos inmediatamente y procesamos en background
    res.status(200).json({ received: true });

    const body = req.body;

    // Verificar que es realmente de Meta
    if (body.object !== 'whatsapp_business_account') {
      logger.warn('Webhook recibido que no es de WhatsApp');
      return;
    }

    // Iterar sobre los cambios (puede haber múltiples en un request)
    const cambios = body.entry[0]?.changes || [];

    for (const cambio of cambios) {
      const metadata = cambio.value?.metadata || {};
      const mensajes = cambio.value?.messages || [];
      const estados = cambio.value?.statuses || [];

      // Procesar mensajes
      for (const mensaje of mensajes) {
        // Deduplicar: verificar si ya procesamos este mensaje
        if (yaProcesado(mensaje.id)) {
          logger.debug(`Mensaje duplicado ignorado: ${mensaje.id}`);
          continue;
        }

        // Marcar como procesado para evitar duplicados
        marcarComoProcesado(mensaje.id);

        // Procesar en background (no esperar)
        procesarMensaje(
          mensaje,
          metadata.phone_number_id,
          metadata.display_phone_number
        ).catch(error => {
          logearError(error, `Procesamiento mensaje ${mensaje.id}`);
        });
      }

      // Procesar actualizaciones de estado (entregado, leído, etc)
      // Estos no requieren respuesta
      for (const estado of estados) {
        logger.debug(`Estado de mensaje: ${estado.id} → ${estado.status}`);
      }
    }

  } catch (error) {
    logearError(error, 'Webhook handler');
    // Ya respondimos 200, así que solo loguear
  }
}

// ==========================================
// ENVÍO DE MENSAJES DE RESPUESTA
// ==========================================

export async function enviarMensajePorMeta(numeroDestino, texto) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneID = process.env.WHATSAPP_PHONE_ID;

    const respuesta = await fetch(
      `https://graph.instagram.com/v18.0/${phoneID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroDestino,
          type: 'text',
          text: { body: texto }
        })
      }
    );

    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(`Meta API error: ${errorData.error?.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.debug(`Mensaje enviado a ${numeroDestino}: ${data.messages?.[0]?.id}`);
    return data;

  } catch (error) {
    logearError(error, `Envío mensaje a ${numeroDestino}`);
    throw error;
  }
}

// Enviar documento (PDF) por WhatsApp
export async function enviarDocumentoPorMeta(numeroDestino, urlDocumento, nombreArchivo) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneID = process.env.WHATSAPP_PHONE_ID;

    const respuesta = await fetch(
      `https://graph.instagram.com/v18.0/${phoneID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroDestino,
          type: 'document',
          document: {
            link: urlDocumento,
            filename: nombreArchivo
          }
        })
      }
    );

    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(`Meta API error: ${errorData.error?.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.debug(`Documento enviado a ${numeroDestino}`);
    return data;

  } catch (error) {
    logearError(error, `Envío documento a ${numeroDestino}`);
    throw error;
  }
}

// Enviar template de mensaje (predefinidos por Meta)
export async function enviarTemplatePorMeta(numeroDestino, nombreTemplate, idioma = 'es') {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneID = process.env.WHATSAPP_PHONE_ID;

    const respuesta = await fetch(
      `https://graph.instagram.com/v18.0/${phoneID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroDestino,
          type: 'template',
          template: {
            name: nombreTemplate,
            language: {
              code: idioma
            }
          }
        })
      }
    );

    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(`Meta API error: ${errorData.error?.message || respuesta.statusText}`);
    }

    const data = await respuesta.json();
    logger.debug(`Template enviado a ${numeroDestino}`);
    return data;

  } catch (error) {
    logearError(error, `Envío template a ${numeroDestino}`);
    throw error;
  }
}
