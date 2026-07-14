// ==========================================
// MERCADO PAGO - Webhook de notificaciones
// ==========================================
// MP notifica cuando una suscripción se autoriza/cancela.
// Matcheamos por external_reference (= id del usuario) y activamos/damos de baja.

import { logger, logearError } from '../logger.js';
import { obtenerUsuarioPorID, actualizarUsuario } from '../db.js';
import { consultarPreapproval } from './suscripcion.js';
import { enviarTexto } from '../whatsapp/mensajes.js';

const TREINTA_DIAS = 30 * 24 * 60 * 60;
const procesados = new Set(); // dedup en memoria

export async function handleMercadoPagoWebhook(req, res) {
  // Responder rápido: MP reintenta si no recibe 200 en pocos segundos.
  res.status(200).json({ received: true });

  try {
    // MP manda el tipo/id por body o por query, según el evento.
    const type = req.body?.type || req.query?.type || req.query?.topic;
    const id = req.body?.data?.id || req.query?.['data.id'] || req.body?.id;

    logger.info(`📍 Webhook MP: type=${type} id=${id}`);
    if (!id) return;

    const dedupKey = `${type}:${id}`;
    if (procesados.has(dedupKey)) return;
    procesados.add(dedupKey);

    if (type === 'subscription_preapproval' || type === 'preapproval') {
      await procesarSuscripcion(id);
    }
  } catch (error) {
    logearError(error, 'Webhook MP');
  }
}

async function procesarSuscripcion(preapprovalId) {
  const info = await consultarPreapproval(preapprovalId);
  if (!info) return;

  const usuarioId = info.external_reference;
  if (!usuarioId) {
    logger.warn(`Webhook MP sin external_reference (preapproval ${preapprovalId})`);
    return;
  }

  const usuario = await obtenerUsuarioPorID(usuarioId);
  if (!usuario) {
    logger.warn(`Webhook MP: usuario ${usuarioId} no encontrado`);
    return;
  }

  const ahora = Math.floor(Date.now() / 1000);

  if (info.status === 'authorized') {
    await actualizarUsuario(usuario.id, {
      activo: 1,
      plan: 'basico',
      estado_registro: 'pago_ok',
      mp_subscription_id: preapprovalId,
      fecha_vencimiento: ahora + TREINTA_DIAS,
    });
    logger.info(`✅ Usuario ${usuario.id} activado por pago MP`);
    await avisar(usuario.numero_telefono, '✅ ¡Tu suscripción a Facturas7 está activa! Ya podés facturar. Mandame los datos de tu próxima factura cuando quieras.');

  } else if (info.status === 'cancelled' || info.status === 'paused') {
    await actualizarUsuario(usuario.id, { activo: 0, estado_registro: 'vencido' });
    logger.info(`⚠️ Usuario ${usuario.id} suscripción ${info.status}`);
  }
}

// Aviso best-effort (si la ventana de 24h está cerrada, Meta rechaza → se ignora).
async function avisar(numero, texto) {
  try {
    await enviarTexto(numero, texto);
  } catch (e) {
    logger.warn(`No pude avisar por WhatsApp (ventana 24h?): ${e.message}`);
  }
}
