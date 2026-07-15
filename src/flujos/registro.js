// ==========================================
// FLUJO DE REGISTRO AUTOMÁTICO + PAGO
// ==========================================
// El bot registra a desconocidos conversando: nombre → CUIT → email → prueba 7 días
// Luego onboarding: razón social → domicilio → IVA → punto venta
// + link de pago MercadoPago. El webhook activa la suscripción al pagar.

import {
  obtenerEstado,
  siguientePaso,
  limpiarConversacion,
  guardarDato,
  PASOS,
} from '../bot/conversacion.js';
import { obtenerUsuario, crearUsuario, actualizarUsuario } from '../db.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { crearSuscripcion } from '../mercadopago/suscripcion.js';
import { logger } from '../logger.js';

const SIETE_DIAS = 7 * 24 * 60 * 60;
const EMAIL_RE = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Punto de entrada. Se llama cuando el acceso fue denegado
// (desconocido, inactivo o vencido).
export async function manejarRegistro(numeroDeTelefono, texto, usuarioAcceso) {
  let usuario = usuarioAcceso || await obtenerUsuario(numeroDeTelefono);
  const conv = await obtenerEstado(numeroDeTelefono);
  const paso = conv?.paso;

  // Desconocido total: crear y preguntar método registro.
  if (!usuario) {
    usuario = await crearUsuario(numeroDeTelefono, {});
    await siguientePaso(numeroDeTelefono, PASOS.REG_METODO, {});
    await enviarTexto(numeroDeTelefono, PLANTILLAS.METODO_REGISTRO);
    return;
  }

  // Usuario elige método: paso a paso (1) o todo junto (2)
  if (paso === PASOS.REG_METODO) {
    const opcion = texto.trim();
    if (opcion === '1') {
      await siguientePaso(numeroDeTelefono, PASOS.REG_NOMBRE);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.pedir_nombre_registro);
      return;
    } else if (opcion === '2') {
      await siguientePaso(numeroDeTelefono, PASOS.REG_TODO_JUNTO);
      await enviarTexto(numeroDeTelefono, PLANTILLAS.INSTRUCCIONES_TODO_JUNTO);
      return;
    } else {
      await enviarTexto(numeroDeTelefono, '❌ Respondé con 1 o 2.');
      return;
    }
  }

  // Todo de una vez: parsear 6 líneas
  if (paso === PASOS.REG_TODO_JUNTO) {
    const lineas = texto.trim().split('\n').map(l => l.trim());
    if (lineas.length < 6) {
      await enviarTexto(numeroDeTelefono, '❌ Necesito 6 datos (nombre, CUIT, email, domicilio, IVA, punto venta).');
      return;
    }

    const [nombre, cuitRaw, email, domicilio, ivaRaw, puntoRaw] = lineas;

    // Validar CUIT
    const cuit = cuitRaw.replace(/[-.\s]/g, '');
    if (cuit.length !== 11 || isNaN(parseInt(cuit))) {
      await enviarTexto(numeroDeTelefono, '❌ CUIT inválido. Debe tener 11 dígitos sin guiones.');
      return;
    }

    // Validar email
    if (!EMAIL_RE.test(email)) {
      await enviarTexto(numeroDeTelefono, '❌ Email inválido.');
      return;
    }

    // Validar IVA (1 o 2)
    const iva = parseInt(ivaRaw);
    if (![1, 2].includes(iva)) {
      await enviarTexto(numeroDeTelefono, '❌ IVA debe ser 1 (Monotributista) o 2 (Responsable Inscripto).');
      return;
    }

    // Validar punto venta (número)
    const punto = parseInt(puntoRaw);
    if (isNaN(punto) || punto < 1) {
      await enviarTexto(numeroDeTelefono, '❌ Punto de venta debe ser un número válido.');
      return;
    }

    // Guardar todo en BD
    const ahora = Math.floor(Date.now() / 1000);
    await actualizarUsuario(usuario.id, {
      nombre,
      email,
      cuit,
      razon_social: nombre,
      domicilio,
      condicion_iva: iva === 1 ? 'Monotributista' : 'Responsable Inscripto',
      punto_venta: punto,
      activo: 1,
      plan: 'trial',
      estado_registro: 'trial',
      fecha_vencimiento: ahora + SIETE_DIAS,
    });

    await limpiarConversacion(numeroDeTelefono);
    await siguientePaso(numeroDeTelefono, PASOS.MENU_PRINCIPAL, {});
    await enviarTexto(numeroDeTelefono, '✅ Cuenta configurada. Escribí algo para ver el menú.');
    await enviarLinkPago(numeroDeTelefono, { id: usuario.id, email, nombre, cuit }, true);
    return;
  }

  if (paso === PASOS.REG_NOMBRE) {
    const nombre = texto.trim();
    if (nombre.length < 2) {
      await enviarTexto(numeroDeTelefono, 'Decime tu nombre o razón social 🙂');
      return;
    }
    await actualizarUsuario(usuario.id, { nombre });
    await siguientePaso(numeroDeTelefono, PASOS.REG_CUIT);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_CUIT);
    return;
  }

  if (paso === PASOS.REG_CUIT) {
    const cuit = texto.trim().replace(/[-.\s]/g, '');
    if (cuit.length !== 11 || isNaN(parseInt(cuit))) {
      await enviarTexto(numeroDeTelefono, '❌ CUIT debe tener 11 dígitos. Ej: 20123456789');
      return;
    }
    await guardarDato(numeroDeTelefono, 'cuit', cuit);
    await siguientePaso(numeroDeTelefono, PASOS.REG_EMAIL);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.pedir_email_registro(usuario.nombre || 'Usuario'));
    return;
  }

  if (paso === PASOS.REG_EMAIL) {
    const email = texto.trim();
    if (!EMAIL_RE.test(email)) {
      await enviarTexto(numeroDeTelefono, 'Ese email no parece válido. Escribí uno correcto (ej: nombre@mail.com).');
      return;
    }
    const ahora = Math.floor(Date.now() / 1000);
    const conv = await obtenerEstado(numeroDeTelefono);
    const datosReg = conv?.datos ? JSON.parse(conv.datos) : {};

    await actualizarUsuario(usuario.id, {
      email,
      cuit: datosReg.cuit || null,
      activo: 1,
      plan: 'trial',
      estado_registro: 'trial',
      fecha_vencimiento: ahora + SIETE_DIAS,
    });
    await limpiarConversacion(numeroDeTelefono);
    await siguientePaso(numeroDeTelefono, PASOS.ONBOARDING_RAZON_SOCIAL, {});
    await enviarTexto(numeroDeTelefono, PLANTILLAS.BIENVENIDA_NUEVA);
    // Mandar también el link de pago para que se suscriba cuando quiera.
    await enviarLinkPago(numeroDeTelefono, { ...usuario, email, cuit: datosReg.cuit }, true);
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

  // Calcular fecha vencimiento (7 días desde hoy)
  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + SIETE_DIAS * 1000);
  const fechaFormato = `${vencimiento.getDate()}/${vencimiento.getMonth() + 1}/${vencimiento.getFullYear()}`;

  if (trial) {
    await enviarTexto(numeroDeTelefono,
      `🎉 Trial activado por 7 días. Vence el ${fechaFormato}.\n\nLink para renovar cuando quieras:\n${sub.init_point}`);
  } else {
    await enviarTexto(numeroDeTelefono, PLANTILLAS.avisoVencimiento(fechaFormato, sub.init_point));
  }
}
