// ==========================================
// CONTROL DE ACCESO - Valida si usuario puede usar el bot
// ==========================================
// Verifica:
// 1. Usuario existe y está activo
// 2. Suscripción no está vencida
// 3. No superó límite de facturas del mes

import { obtenerUsuario } from '../db.js';
import { logger } from '../logger.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { MENSAJES } from './plantillas.js';

export async function verificarAcceso(numeroDeTelefono) {
  // Resultado: { permitido: boolean, razon: string, usuario?: object }

  const usuario = await obtenerUsuario(numeroDeTelefono);

  // Usuario no registrado
  if (!usuario) {
    return {
      permitido: false,
      razon: 'no_registrado',
      mensaje: MENSAJES.NO_REGISTRADO
    };
  }

  // Usuario no está activo
  if (!usuario.activo) {
    return {
      permitido: false,
      razon: 'no_activo',
      mensaje: MENSAJES.NO_ACTIVO,
      usuario
    };
  }

  // Suscripción vencida
  const ahora = Math.floor(Date.now() / 1000);
  if (usuario.fecha_vencimiento && usuario.fecha_vencimiento < ahora) {
    return {
      permitido: false,
      razon: 'vencido',
      mensaje: MENSAJES.SUSCRIPCION_VENCIDA(new Date(usuario.fecha_vencimiento * 1000)),
      usuario
    };
  }

  // Superó límite de facturas del mes
  // -1 significa ilimitado (planes premium)
  if (usuario.limite_facturas_mes > 0 && usuario.facturas_mes_actual >= usuario.limite_facturas_mes) {
    return {
      permitido: false,
      razon: 'limite_alcanzado',
      mensaje: MENSAJES.LIMITE_ALCANZADO(usuario.limite_facturas_mes),
      usuario
    };
  }

  // TODO: Validar también que tiene CUIT y punto de venta configurados
  // Si no, retornar permitido pero avisar que debe completar onboarding

  return {
    permitido: true,
    usuario
  };
}

export async function enviarMensajeDeAccesoDenegado(numeroDeTelefono, razon, mensaje) {
  try {
    await enviarTexto(numeroDeTelefono, mensaje);
    logger.info(`Acceso denegado a ${numeroDeTelefono}: ${razon}`);
  } catch (error) {
    logger.error(`Error enviando mensaje de acceso denegado: ${error.message}`);
  }
}
