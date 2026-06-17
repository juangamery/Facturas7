import axios from 'axios';
import { logger } from '../logger.js';

const MP_API = 'https://api.mercadopago.com/v1';
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;

export async function crearPlan() {
  try {
    // TODO: Crear plan de suscripción en Mercado Pago
    // Precio: $500/mes
    // Frecuencia: mensual

    const response = await axios.post(
      `${MP_API}/billing/plans`,
      {
        back_url: process.env.BASE_URL,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 500,
          currency_id: 'ARS'
        },
        description: 'Plan Facturas7 - Facturación Electrónica'
      },
      {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      }
    );

    logger.info(`Plan MP creado: ${response.data.id}`);
    return response.data;

  } catch (error) {
    logger.error(`Error creando plan MP: ${error.message}`);
    throw error;
  }
}

export async function crearSuscripcion(numeroWhatsapp, planId) {
  try {
    // TODO: Crear suscripción del usuario
    // Retorna link de pago

    logger.info(`Creando suscripción para ${numeroWhatsapp}`);

    return {
      id: `sub_${Math.random().toString().substring(2, 10)}`,
      plan_id: planId,
      numero_whatsapp: numeroWhatsapp,
      estado: 'PENDIENTE'
    };

  } catch (error) {
    logger.error(`Error creando suscripción: ${error.message}`);
    throw error;
  }
}

export async function obtenerLinkPago(suscripcionId) {
  try {
    // TODO: Generar link de pago para suscripción
    return `https://www.mercadopago.com.ar/checkout/pay/${suscripcionId}`;
  } catch (error) {
    logger.error(`Error obteniendo link pago: ${error.message}`);
    throw error;
  }
}
