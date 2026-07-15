// ==========================================
// ORQUESTADOR DEL BOT - Detecta tipo de mensaje
// ==========================================
// 1. Verifica acceso del usuario
// 2. Detecta si es texto, imagen o audio
// 3. Llama al handler correspondiente
// 4. Maneja la máquina de estados de conversación

import { verificarAcceso, enviarMensajeDeAccesoDenegado } from './acceso.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import * as PLANTILLAS from '../whatsapp/plantillas.js';
import { logger, logearError } from '../logger.js';
import {
  obtenerEstado,
  mostrarMenuPrincipal,
  limpiarConversacion,
  detectarIntencion,
  esConfirmacionSI,
  esConfirmacionNO,
  procesarOnboarding,
  procesarFacturaTexto,
  verUltimaFactura,
  verMisDatos,
  cancelarOperacion,
  procesarAudioConversacional,
  siguientePaso,
  PASOS,
} from './conversacion.js';
import procesarImagen from '../flujos/imagen.js';

export default async function procesarMensaje(mensaje, phoneID, displayPhoneNumber) {
  const numeroDeTelefono = mensaje.from;
  const messageID = mensaje.id;
  const timestamp = mensaje.timestamp;

  try {
    logger.info(`📨 Mensaje recibido de ${numeroDeTelefono}`, 'Bot');

    // PASO 1: Verificar acceso
    const acceso = await verificarAcceso(numeroDeTelefono);

    if (!acceso.permitido) {
      // Límite de facturas del mes: sí es un bloqueo real.
      if (acceso.razon === 'limite_alcanzado') {
        await enviarMensajeDeAccesoDenegado(numeroDeTelefono, acceso.razon, acceso.mensaje);
        return;
      }
      // Desconocido / inactivo / vencido → flujo de registro + pago autónomo.
      const { manejarRegistro } = await import('../flujos/registro.js');
      const textoReg = mensaje.type === 'text' ? mensaje.text.body : '';
      await manejarRegistro(numeroDeTelefono, textoReg, acceso.usuario);
      return;
    }

    const usuario = acceso.usuario;
    logger.info(`✅ Usuario autorizado: ${usuario.nombre || numeroDeTelefono}`);

    // PASO 2: Detectar tipo de mensaje
    if (mensaje.type === 'text') {
      // Mensaje de texto plano
      await procesarTextoGenerico(numeroDeTelefono, mensaje.text.body, usuario);

    } else if (mensaje.type === 'image') {
      // Mensaje con imagen (factura escaneada, recibo, etc)
      const imagenID = mensaje.image.id;
      await procesarImagenGenerico(numeroDeTelefono, imagenID, usuario);

    } else if (mensaje.type === 'audio') {
      // Mensaje con audio (voz dictada)
      const audioID = mensaje.audio.id;
      await procesarAudioGenerico(numeroDeTelefono, audioID, usuario);

    } else if (mensaje.type === 'button') {
      // Botón clickeado (respuesta a una plantilla)
      const buttonPayload = mensaje.button?.payload;
      logger.debug(`Botón clickeado: ${buttonPayload}`);

    } else if (mensaje.type === 'interactive') {
      // Menú interactivo
      const seleccion = mensaje.interactive?.button_reply?.id;
      await procesarTextoGenerico(numeroDeTelefono, seleccion, usuario);

    } else {
      // Tipo de mensaje no soportado
      logger.warn(`Tipo de mensaje no soportado: ${mensaje.type}`);
      await enviarTexto(numeroDeTelefono,
        'Ese tipo de mensaje no lo entiendo. Mandá texto, imagen o audio.');
    }

  } catch (error) {
    logearError(error, `Procesamiento de mensaje ${messageID}`);
    try {
      await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
    } catch (e) {
      logger.error(`Error enviando mensaje de error: ${e.message}`);
    }
  }
}

// ==========================================
// HANDLERS POR TIPO DE MENSAJE
// ==========================================

async function procesarTextoGenerico(numeroDeTelefono, texto, usuario) {
  try {
    // Obtener estado de conversación
    const conversacion = await obtenerEstado(numeroDeTelefono);
    const paso = conversacion?.paso;
    const datosActuales = conversacion?.datos
      ? JSON.parse(conversacion.datos)
      : {};

    // CANCELAR en cualquier momento
    if (detectarIntencion(texto) === 'CANCELAR') {
      await cancelarOperacion(numeroDeTelefono);
      return;
    }

    // Primer contacto (sin conversación)
    if (!conversacion) {
      // Necesita onboarding
      if (!usuario.cuit || !usuario.punto_venta) {
        await mostrarMenuPrincipal(numeroDeTelefono, usuario);
        logger.info(`👋 Primer contacto ${numeroDeTelefono} → onboarding`);
        return;
      }
      // Ya está completo → menú principal
      await mostrarMenuPrincipal(numeroDeTelefono, usuario);
      logger.info(`✅ Usuario ${numeroDeTelefono} listo → menú`);
      return;
    }

    // ONBOARDING EN PROGRESO
    if (
      paso === PASOS.ONBOARDING_CUIT ||
      paso === PASOS.ONBOARDING_RAZON_SOCIAL ||
      paso === PASOS.ONBOARDING_DOMICILIO ||
      paso === PASOS.ONBOARDING_CONDICION_IVA ||
      paso === PASOS.ONBOARDING_PUNTO_VENTA ||
      paso === PASOS.ONBOARDING_CONFIRMACION
    ) {
      await procesarOnboarding(numeroDeTelefono, texto, paso, datosActuales);
      return;
    }

    // MENÚ PRINCIPAL → detectar intención
    if (paso === PASOS.MENU_PRINCIPAL) {
      const intencion = detectarIntencion(texto);

      if (intencion === 'FACTURA') {
        await siguientePaso(numeroDeTelefono, PASOS.FACTURA_NOMBRE_CLIENTE);
        await enviarTexto(numeroDeTelefono, PLANTILLAS.PEDIR_NOMBRE_CLIENTE);
        return;
      }

      if (intencion === 'ULTIMA_FACTURA') {
        await verUltimaFactura(numeroDeTelefono, usuario);
        return;
      }

      if (intencion === 'MIS_DATOS') {
        await verMisDatos(numeroDeTelefono, usuario);
        return;
      }

      // No entendió
      await mostrarMenuPrincipal(numeroDeTelefono, usuario);
      return;
    }

    // FLUJO FACTURA EN PROGRESO
    if (
      paso === PASOS.FACTURA_NOMBRE_CLIENTE ||
      paso === PASOS.FACTURA_DOCUMENTO_CLIENTE ||
      paso === PASOS.FACTURA_CONCEPTO ||
      paso === PASOS.FACTURA_IMPORTE ||
      paso === PASOS.FACTURA_CONFIRMACION
    ) {
      await procesarFacturaTexto(numeroDeTelefono, texto, paso, datosActuales, usuario);
      return;
    }

    // Fallback: mostrar menú
    await mostrarMenuPrincipal(numeroDeTelefono, usuario);

  } catch (error) {
    logearError(error, `Texto ${numeroDeTelefono}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

async function procesarImagenGenerico(numeroDeTelefono, imagenID, usuario) {
  try {
    // Descargar imagen
    const { descargarMediaDeTelefono } = await import('../whatsapp/media.js');
    const imagenPath = await descargarMediaDeTelefono(imagenID);

    if (!imagenPath) {
      await enviarTexto(numeroDeTelefono, '❌ No pude descargar imagen');
      return;
    }

    // Preferencia: Gemini Vision > Claude Vision
    if (process.env.GOOGLE_API_KEY) {
      const { procesarImagenFactura } = await import('../flujos/imagen_vision.js');
      await procesarImagenFactura(numeroDeTelefono, imagenPath, usuario);
    } else if (process.env.ANTHROPIC_API_KEY) {
      await procesarImagen(numeroDeTelefono, imagenID, usuario);
    } else {
      await enviarTexto(numeroDeTelefono, '📸 No tengo visión de imágenes configurada. Escribí los datos manualmente.');
    }

    logger.info(`📸 Imagen procesada de ${numeroDeTelefono}`);

  } catch (error) {
    logearError(error, `Procesamiento imagen ${imagenID}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}

async function procesarAudioGenerico(numeroDeTelefono, audioID, usuario) {
  try {
    // Descargar audio desde Wappfly y guardar path
    const { descargarMediaDeTelefono } = await import('../whatsapp/media.js');
    const audioPath = await descargarMediaDeTelefono(audioID);

    if (!audioPath) {
      await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_AUDIO);
      return;
    }

    // Procesar con Groq + conversación
    await procesarAudioConversacional(numeroDeTelefono, audioPath, usuario);
    logger.info(`🎤 Audio procesado de ${numeroDeTelefono}`);

  } catch (error) {
    logearError(error, `Procesamiento audio ${audioID}`);
    await enviarTexto(numeroDeTelefono, PLANTILLAS.ERROR_GENERAL);
  }
}
