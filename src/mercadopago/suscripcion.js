// ==========================================
// MERCADO PAGO - Suscripciones (preapproval)
// ==========================================
// La creación de preapproval SIN card_token_id ("solo link, pago pendiente")
// da 500 en la API real de MP incluso siguiendo su doc al pie de la letra
// (confirmado probando contra su API, cuenta activada, con y sin plan).
// El único camino que responde con validaciones limpias es el que requiere
// card_token_id — por eso el flujo real es: mandamos un link a nuestra
// propia página de checkout (Checkout Bricks), el cliente tokeniza su
// tarjeta ahí, y RECIÉN con ese token creamos la suscripción acá.
// Usa external_reference = id del usuario, para matchear en el webhook.

import axios from 'axios';
import { logger, logearError } from '../logger.js';

const MP_API = 'https://api.mercadopago.com';
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const PRECIO_BASICO = parseInt(process.env.MP_PRECIO_BASICO || '299', 10);

function headers() {
  return { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' };
}

// Link a nuestra página de checkout propia (no llama a MP todavía).
export function generarLinkCheckout(usuario) {
  const base = process.env.BASE_URL || 'https://facturas7.onrender.com';
  return `${base}/checkout/${usuario.id}`;
}

// Crea la suscripción YA con la tarjeta tokenizada (después de Checkout Bricks).
// Devuelve { id, status } o null.
export async function crearSuscripcionConTarjeta(usuario, cardTokenId, payerEmail) {
  try {
    if (!MP_TOKEN) {
      logger.warn('MP_ACCESS_TOKEN no configurado, no puedo crear suscripción');
      return null;
    }

    const finRecurrencia = new Date();
    finRecurrencia.setFullYear(finRecurrencia.getFullYear() + 5);

    const body = {
      reason: 'Facturas7 - Suscripción mensual',
      external_reference: String(usuario.id),
      payer_email: payerEmail,
      card_token_id: cardTokenId,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        end_date: finRecurrencia.toISOString(),
        transaction_amount: PRECIO_BASICO,
        currency_id: 'ARS',
      },
      back_url: `${process.env.BASE_URL || 'https://facturas7.onrender.com'}/admin/dashboard`,
      status: 'authorized',
    };

    const { data } = await axios.post(`${MP_API}/preapproval`, body, { headers: headers() });
    logger.info(`💳 Suscripción MP creada ${data.id} (${data.status}) para usuario ${usuario.id}`);
    return { id: data.id, status: data.status };
  } catch (error) {
    logearError(error, 'crearSuscripcionConTarjeta MP');
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
