// ==========================================
// MERCADO PAGO - Suscripciones (preapproval)
// ==========================================
// Crea una suscripción mensual por usuario y devuelve el link de pago.
// Usa external_reference = id del usuario, para matchear en el webhook.

import axios from 'axios';
import { logger, logearError } from '../logger.js';

const MP_API = 'https://api.mercadopago.com';
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const PRECIO_BASICO = parseInt(process.env.MP_PRECIO_BASICO || '299', 10);

function headers() {
  return { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' };
}

// Crea la suscripción mensual del usuario. Devuelve { id, init_point } o null.
export async function crearSuscripcion(usuario) {
  try {
    if (!MP_TOKEN) {
      logger.warn('MP_ACCESS_TOKEN no configurado, no puedo crear suscripción');
      return null;
    }

    // end_date es obligatorio para MP en este modelo (suscripción sin plan,
    // pago pendiente). Sin él, MP devuelve 500 genérico en vez de un 400
    // claro — lo confirmé probando contra su API real. 5 años = "sin límite" práctico.
    const finRecurrencia = new Date();
    finRecurrencia.setFullYear(finRecurrencia.getFullYear() + 5);

    const body = {
      reason: 'Facturas7 - Suscripción mensual',
      external_reference: String(usuario.id),
      payer_email: usuario.email || undefined,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        end_date: finRecurrencia.toISOString(),
        transaction_amount: PRECIO_BASICO,
        currency_id: 'ARS',
      },
      back_url: `${process.env.BASE_URL || 'https://facturas7.onrender.com'}/admin/dashboard`,
      status: 'pending',
    };

    const { data } = await axios.post(`${MP_API}/preapproval`, body, { headers: headers() });
    logger.info(`💳 Suscripción MP creada ${data.id} para usuario ${usuario.id}`);
    return { id: data.id, init_point: data.init_point };
  } catch (error) {
    logearError(error, 'crearSuscripcion MP');
    logger.error(`MP respuesta: ${JSON.stringify(error.response?.data || {})}`);
    return null;
  }
}

// Consulta el estado de una preapproval (suscripción).
// Devuelve { status, external_reference, payer_email } o null.
export async function consultarPreapproval(id) {
  try {
    const { data } = await axios.get(`${MP_API}/preapproval/${id}`, { headers: headers() });
    return {
      status: data.status,               // authorized | pending | cancelled | paused
      external_reference: data.external_reference,
      payer_email: data.payer_email,
    };
  } catch (error) {
    logearError(error, 'consultarPreapproval MP');
    return null;
  }
}
