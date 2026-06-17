// ==========================================
// WEBHOOK DE MERCADO PAGO - Eventos de pago
// ==========================================
// Recibe: payment.approved, payment.rejected, subscription.cancelled

import { logger, logearError } from '../logger.js';
import { obtenerUsuario, actualizarUsuario, registrarPago } from '../db.js';
import { enviarMensajePorMeta } from '../bot/webhook.js';
import crypto from 'crypto';

export default async function webhookMercadoPago(req, res) {
  try {
    // Verificar firma HMAC-SHA256 de Mercado Pago
    const hmac = req.headers['x-signature'];
    const timestamp = req.headers['x-request-id'];
    const body = JSON.stringify(req.body);

    // TODO: Verificar firma
    // const miasSignatura = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    //   .update(`${timestamp}.${body}`)
    //   .digest('hex');
    // if (hmac !== miasSignatura) {
    //   logger.warn('Webhook MP con firma inválida');
    //   return res.status(403).json({ error: 'Invalid signature' });
    // }

    res.status(200).json({ received: true });

    const evento = req.body;
    const tipo = evento.type;
    const datos = evento.data;

    // Procesar en background
    procesarEventoMP(tipo, datos).catch(e => {
      logearError(e, `Webhook MP: ${tipo}`);
    });

  } catch (error) {
    logearError(error, 'Webhook Mercado Pago');
    res.status(200).json({ received: true }); // Responder igual para no retentar
  }
}

async function procesarEventoMP(tipo, datos) {
  if (tipo === 'payment') {
    await procesarPago(datos);
  } else if (tipo === 'subscription') {
    await procesarSuscripcion(datos);
  } else {
    logger.debug(`Evento MP no manejado: ${tipo}`);
  }
}

// ==========================================
// PROCESAR PAGO
// ==========================================

async function procesarPago(datosPago) {
  const paymentID = datosPago.id;
  const status = datosPago.status;
  const subscriptionID = datosPago.external_reference; // CUIT del usuario
  const monto = datosPago.transaction_amount;

  logger.info(`Pago recibido: ${paymentID} → ${status}`);

  // Buscar usuario por subscription ID
  const usuario = obtenerUsuario(subscriptionID);

  if (!usuario) {
    logger.warn(`Pago sin usuario asociado: ${paymentID}`);
    return;
  }

  // Registrar pago en BD
  registrarPago(usuario.id, paymentID, subscriptionID, monto, status);

  // Procesar según estado
  if (status === 'approved') {
    // Extender suscripción 30 días desde HOY
    const ahora = Math.floor(Date.now() / 1000);
    const nuevaFecha = ahora + (30 * 24 * 60 * 60);

    actualizarUsuario(usuario.id, {
      activo: 1,
      fecha_vencimiento: nuevaFecha
    });

    const fechaFormato = new Date(nuevaFecha * 1000).toLocaleDateString('es-AR');

    await enviarMensajePorMeta(usuario.numero_telefono,
      `✅ ¡Pago confirmado! Tu suscripción está activa hasta ${fechaFormato}.`);

    logger.info(`✅ Pago aprovado para usuario ${usuario.id}`);

  } else if (status === 'rejected') {
    await enviarMensajePorMeta(usuario.numero_telefono,
      `⚠️ No pudimos procesar tu pago. Verificá los datos de tu tarjeta o contactanos.`);

    logger.warn(`Pago rechazado: ${paymentID}`);

  } else if (status === 'pending') {
    await enviarMensajePorMeta(usuario.numero_telefono,
      `⏳ Tu pago está siendo procesado. Te avisaremos cuando se confirme.`);
  }
}

// ==========================================
// PROCESAR SUSCRIPCIÓN
// ==========================================

async function procesarSuscripcion(datosSuscripcion) {
  const subscriptionID = datosSuscripcion.id;
  const status = datosSuscripcion.status;

  logger.info(`Suscripción: ${subscriptionID} → ${status}`);

  // TODO: Manejar cambios de estado de suscripción
  // subscription.status puede ser: active, paused, cancelled, expired

  if (status === 'cancelled') {
    // Buscar usuario y desactivar
    const db = require('../db.js').getDB();
    const usuario = db.prepare(
      'SELECT * FROM usuarios WHERE mp_subscription_id = ?'
    ).get(subscriptionID);

    if (usuario) {
      actualizarUsuario(usuario.id, { activo: 0 });
      await enviarMensajePorMeta(usuario.numero_telefono,
        `Tu suscripción fue cancelada. Si fue un error contactanos.`);
    }
  }
}
