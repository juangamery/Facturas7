// ==========================================
// FLUJO DE REGISTRO AUTOMÁTICO + PAGO
// ==========================================
// El bot registra a desconocidos conversando: nombre → email → prueba 7 días
// + link de pago MercadoPago. El webhook activa la suscripción al pagar.

import {
  obtenerEstado,
  siguientePaso,
  limpiarConversacion,
  PASOS,
} from '../bot/conversacion.js';
import { obtenerUsuario, crearUsuario, actualizarUsuario } from '../db.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { crearSuscripcion } from '../mercadopago/suscripcion.js';
import { logger } from '../logger.js';

const SIETE_DIAS = 7 * 24 * 60 * 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Punto de entrada. Se llama cuando el acceso fue denegado
// (desconocido, inactivo o vencido).
export async function manejarRegistro(numeroDeTelefono, texto, usuarioAcceso) {
  let usuario = usuarioAcceso || await obtenerUsuario(numeroDeTelefono);
  const conv = await obtenerEstado(numeroDeTelefono);
  const paso = conv?.paso;

  // Desconocido total: crear y pedir nombre.
  if (!usuario) {
    usuario = await crearUsuario(numeroDeTelefono, {});
    await siguientePaso(numeroDeTelefono, PASOS.REG_NOMBRE, {});
    await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
    return;
  }

  if (paso === PASOS.REG_NOMBRE) {
    const nombre = texto.trim();
    if (nombre.length < 2) {
      await enviarTexto(numeroDeTelefono, 'Decime tu nombre o razón social 🙂');
      return;
    }
    await actualizarUsuario(usuario.id, { nombre });
    await siguientePaso(numeroDeTelefono, PASOS.REG_EMAIL);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_EMAIL(nombre));
    return;
  }

  if (paso === PASOS.REG_EMAIL) {
    const email = texto.trim();
    if (!EMAIL_RE.test(email)) {
      await enviarTexto(numeroDeTelefono, 'Ese email no parece válido. Escribí uno correcto (ej: nombre@mail.com).');
      return;
    }
    const ahora = Math.floor(Date.now() / 1000);
    await actualizarUsuario(usuario.id, {
      email,
      activo: 1,
      plan: 'trial',
      estado_registro: 'trial',
      fecha_vencimiento: ahora + SIETE_DIAS,
    });
    await limpiarConversacion(numeroDeTelefono);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
    // Mandar también el link de pago para que se suscriba cuando quiera.
    await enviarLinkPago(numeroDeTelefono, { ...usuario, email }, true);
    return;
  }

  // Usuario con datos pero inactivo/vencido, o pide pagar → link de pago.
  if (usuario.nombre && usuario.email) {
    return await enviarLinkPago(numeroDeTelefono, usuario, false);
  }

  // Sin datos y sin paso de registro → arrancar de cero.
  await siguientePaso(numeroDeTelefono, PASOS.REG_NOMBRE, {});
  await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
}

async function enviarLinkPago(numeroDeTelefono, usuario, trial) {
  const sub = await crearSuscripcion(usuario);
  if (!sub) {
    await enviarTexto(numeroDeTelefono, 'No pude generar el link de pago ahora. Reintentá en un rato 🙏');
    return;
  }
  await actualizarUsuario(usuario.id, {
    mp_subscription_id: sub.id,
    estado_registro: trial ? 'trial' : 'esperando_pago',
  });
  logger.info(`💳 Link de pago enviado a usuario ${usuario.id}`);
  await enviarTexto(numeroDeTelefono, PLANTILLAS.avisoVencimiento(sub.init_point, trial));
}
