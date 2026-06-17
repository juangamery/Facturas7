// ==========================================
// MERCADO PAGO - Crear links de suscripción
// ==========================================
// Generar links de pago para clientes nuevos

import axios from 'axios';
import { logger, logearError } from '../logger.js';

const MP_BASE_URL = 'https://api.mercadopago.com';
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// ===== CREAR LINK DE SUSCRIPCIÓN =====

export async function crearLinkSuscripcion(usuarioID, planID, clienteNombre) {
  try {
    const response = await axios.post(
      `${MP_BASE_URL}/v1/customers/${usuarioID}/subscriptions`,
      {
        plan_id: planID,
        card_token: null, // Se pedirá cuando el cliente haga clic
        back_url: `${process.env.BASE_URL}/admin/dashboard`
      },
      {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
      }
    );

    const linkPago = response.data.init_point || response.data.checkout_url;

    logger.info(`Link de suscripción creado para usuario ${usuarioID}`);
    return linkPago;

  } catch (error) {
    logearError(error, 'crearLinkSuscripcion');
    throw new Error('Error creando link de pago');
  }
}

// ===== OBTENER INFORMACIÓN DE PLAN =====

export async function obtenerPlan(planID) {
  try {
    const response = await axios.get(
      `${MP_BASE_URL}/v1/plans/${planID}`,
      { headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    return response.data;

  } catch (error) {
    logearError(error, 'obtenerPlan');
    throw new Error('Error obteniendo información del plan');
  }
}

// ===== CREAR SUSCRIPCIÓN CON TARJETA =====

export async function crearSuscripcionConTarjeta(usuarioID, planID, tokenTarjeta) {
  try {
    const response = await axios.post(
      `${MP_BASE_URL}/v1/customers/${usuarioID}/subscriptions`,
      {
        plan_id: planID,
        card_token: tokenTarjeta
      },
      {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
      }
    );

    logger.info(`Suscripción creada para usuario ${usuarioID}`);
    return response.data;

  } catch (error) {
    logearError(error, 'crearSuscripcionConTarjeta');
    throw new Error('Error creando suscripción');
  }
}

// ===== OBTENER SUSCRIPCIÓN =====

export async function obtenerSuscripcion(subscriptionID) {
  try {
    const response = await axios.get(
      `${MP_BASE_URL}/v1/subscriptions/${subscriptionID}`,
      { headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    return response.data;

  } catch (error) {
    logearError(error, 'obtenerSuscripcion');
    throw new Error('Error obteniendo suscripción');
  }
}

// ===== CANCELAR SUSCRIPCIÓN =====

export async function cancelarSuscripcion(subscriptionID) {
  try {
    const response = await axios.put(
      `${MP_BASE_URL}/v1/subscriptions/${subscriptionID}`,
      { status: 'cancelled' },
      { headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    logger.info(`Suscripción ${subscriptionID} cancelada`);
    return response.data;

  } catch (error) {
    logearError(error, 'cancelarSuscripcion');
    throw new Error('Error cancelando suscripción');
  }
}
