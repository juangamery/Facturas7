// ==========================================
// MÁQUINA DE ESTADOS - Conversación por WhatsApp
// ==========================================
// Gestiona el flujo de conversación paso a paso
// Estados: menu_principal, onboarding_cuit, onboarding_rs, confirmacion_factura, etc

import {
  obtenerConversacion,
  guardarConversacion,
  borrarConversacion,
  obtenerUsuario
} from '../db.js';
import { logger } from '../logger.js';
import { MENSAJES } from './plantillas.js';
import { enviarMensajePorMeta } from './webhook.js';

// Máquina de estados
export const PASOS = {
  MENU_PRINCIPAL: 'menu_principal',
  ONBOARDING_CUIT: 'onboarding_cuit',
  ONBOARDING_RAZON_SOCIAL: 'onboarding_rs',
  ONBOARDING_DOMICILIO: 'onboarding_domicilio',
  ONBOARDING_CONDICION_IVA: 'onboarding_condicion_iva',
  ONBOARDING_PUNTO_VENTA: 'onboarding_punto_venta',

  FLUJO_CLIENTE: 'flujo_cliente',
  FLUJO_DOCUMENTO: 'flujo_documento',
  FLUJO_CONCEPTO: 'flujo_concepto',
  FLUJO_IMPORTE: 'flujo_importe',
  CONFIRMACION_FACTURA: 'confirmacion_factura',

  ESPERANDO_RESPUESTA: 'esperando_respuesta'
};

// Obtener estado actual de conversación
export function obtenerEstado(numeroDeTelefono) {
  return obtenerConversacion(numeroDeTelefono);
}

// Ir al siguiente paso
export function siguientePaso(numeroDeTelefono, nuevoPaso, datos = {}) {
  guardarConversacion(numeroDeTelefono, nuevoPaso, datos);
  logger.debug(`Paso actualizado: ${numeroDeTelefono} → ${nuevoPaso}`);
}

// Guardar dato en conversación actual
export function guardarDato(numeroDeTelefono, clave, valor) {
  const conversacion = obtenerConversacion(numeroDeTelefono);
  const datos = conversacion?.datos ? JSON.parse(conversacion.datos) : {};

  datos[clave] = valor;
  guardarConversacion(
    numeroDeTelefono,
    conversacion?.paso || PASOS.MENU_PRINCIPAL,
    datos
  );
}

// Obtener dato de conversación
export function obtenerDato(numeroDeTelefono, clave) {
  const conversacion = obtenerConversacion(numeroDeTelefono);
  if (!conversacion) return null;

  const datos = JSON.parse(conversacion.datos);
  return datos[clave] || null;
}

// Limpiar conversación
export function limpiarConversacion(numeroDeTelefono) {
  borrarConversacion(numeroDeTelefono);
  logger.info(`Conversación limpiada: ${numeroDeTelefono}`);
}

// ==========================================
// INICIAR ONBOARDING
// ==========================================

export async function iniciarOnboarding(numeroDeTelefono) {
  try {
    siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CUIT);
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.BIENVENIDA_ONBOARDING);
  } catch (error) {
    logger.error(`Error iniciando onboarding: ${error.message}`);
  }
}

// ==========================================
// INICIAR FLUJO DE FACTURA
// ==========================================

export async function iniciarFlujoFactura(numeroDeTelefono) {
  try {
    siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE, {});
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.PREGUNTA_CLIENTE);
  } catch (error) {
    logger.error(`Error iniciando flujo: ${error.message}`);
  }
}

// ==========================================
// MOSTRAR MENÚ PRINCIPAL
// ==========================================

export async function mostrarMenuPrincipal(numeroDeTelefono, usuario) {
  try {
    const nombreUsuario = usuario.nombre || 'amigo';

    // Si no tiene CUIT, iniciar onboarding
    if (!usuario.cuit || !usuario.punto_venta) {
      await iniciarOnboarding(numeroDeTelefono);
      return;
    }

    // Si tiene datos completos, mostrar menú
    siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL);
    await enviarMensajePorMeta(
      numeroDeTelefono,
      MENSAJES.MENU_PRINCIPAL(nombreUsuario)
    );
  } catch (error) {
    logger.error(`Error mostrando menú: ${error.message}`);
  }
}
