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
import { enviarTexto } from '../whatsapp/mensajes.js';

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
  RECOPILANDO: 'recopilando',
  CONFIRMACION_FACTURA: 'confirmacion_factura',

  ESPERANDO_RESPUESTA: 'esperando_respuesta'
};

// Obtener estado actual de conversación
// NOTA: obtenerConversacion es async (Supabase) → esta función también.
export async function obtenerEstado(numeroDeTelefono) {
  return await obtenerConversacion(numeroDeTelefono);
}

// Ir al siguiente paso.
// Si no se pasan datos, se PRESERVAN los existentes (no se pisan con {}).
export async function siguientePaso(numeroDeTelefono, nuevoPaso, datos) {
  if (datos === undefined) {
    const conv = await obtenerConversacion(numeroDeTelefono);
    datos = conv?.datos ? JSON.parse(conv.datos) : {};
  }
  await guardarConversacion(numeroDeTelefono, nuevoPaso, datos);
  logger.debug(`Paso actualizado: ${numeroDeTelefono} → ${nuevoPaso}`);
}

// Guardar dato en conversación actual
export async function guardarDato(numeroDeTelefono, clave, valor) {
  const conversacion = await obtenerConversacion(numeroDeTelefono);
  const datos = conversacion?.datos ? JSON.parse(conversacion.datos) : {};

  datos[clave] = valor;
  await guardarConversacion(
    numeroDeTelefono,
    conversacion?.paso || PASOS.MENU_PRINCIPAL,
    datos
  );
}

// Obtener dato de conversación
export async function obtenerDato(numeroDeTelefono, clave) {
  const conversacion = await obtenerConversacion(numeroDeTelefono);
  if (!conversacion) return null;

  const datos = JSON.parse(conversacion.datos);
  return datos[clave] || null;
}

// Limpiar conversación
export async function limpiarConversacion(numeroDeTelefono) {
  await borrarConversacion(numeroDeTelefono);
  logger.info(`Conversación limpiada: ${numeroDeTelefono}`);
}

// ==========================================
// INICIAR ONBOARDING
// ==========================================

export async function iniciarOnboarding(numeroDeTelefono) {
  try {
    await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_CUIT);
    await enviarTexto(numeroDeTelefono, MENSAJES.BIENVENIDA_ONBOARDING);
  } catch (error) {
    logger.error(`Error iniciando onboarding: ${error.message}`);
  }
}

// ==========================================
// INICIAR FLUJO DE FACTURA
// ==========================================

export async function iniciarFlujoFactura(numeroDeTelefono) {
  try {
    await siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE, {});
    await enviarTexto(numeroDeTelefono, MENSAJES.PREGUNTA_CLIENTE);
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
    await siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL);
    await enviarTexto(
      numeroDeTelefono,
      MENSAJES.MENU_PRINCIPAL(nombreUsuario)
    );
  } catch (error) {
    logger.error(`Error mostrando menú: ${error.message}`);
  }
}
