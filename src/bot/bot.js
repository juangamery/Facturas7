// ==========================================
// ORQUESTADOR DEL BOT - Detecta tipo de mensaje
// ==========================================
// 1. Verifica acceso del usuario
// 2. Detecta si es texto, imagen o audio
// 3. Llama al handler correspondiente
// 4. Maneja la máquina de estados de conversación

import { verificarAcceso, enviarMensajeDeAccesoDenegado } from './acceso.js';
import { enviarTexto } from '../whatsapp/mensajes.js';
import { MENSAJES } from './plantillas.js';
import { logger, logearError } from '../logger.js';
import { obtenerEstado } from './conversacion.js';
import procesarTexto from '../flujos/texto.js';
import procesarImagen from '../flujos/imagen.js';
import { procesarAudio } from '../ia/audio.js';

export default async function procesarMensaje(mensaje, phoneID, displayPhoneNumber) {
  const numeroDeTelefono = mensaje.from;
  const messageID = mensaje.id;
  const timestamp = mensaje.timestamp;

  try {
    logger.info(`📨 Mensaje recibido de ${numeroDeTelefono}`, 'Bot');

    // PASO 1: Verificar acceso
    const acceso = await verificarAcceso(numeroDeTelefono);

    if (!acceso.permitido) {
      await enviarMensajeDeAccesoDenegado(numeroDeTelefono, acceso.razon, acceso.mensaje);
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
      await enviarTexto(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
    } catch (e) {
      logger.error(`Error enviando mensaje de error: ${e.message}`);
    }
  }
}

// ==========================================
// HANDLERS POR TIPO DE MENSAJE
// ==========================================

async function procesarTextoGenerico(numeroDeTelefono, texto, usuario) {
  // Obtener estado actual de conversación
  const conversacion = await obtenerEstado(numeroDeTelefono);
  const paso = conversacion?.paso || 'menu_principal';
  const datos = conversacion?.datos ? JSON.parse(conversacion.datos) : {};

  // Normalizar texto
  const textoNormalizado = texto.trim().toUpperCase();

  // Detectar intenciones rápidas (palabras clave)
  if (textoNormalizado === 'CANCELAR') {
    const { limpiarConversacion } = await import('./conversacion.js');
    await limpiarConversacion(numeroDeTelefono);
    await enviarTexto(numeroDeTelefono, MENSAJES.CANCELADO);
    return;
  }

  // Llamar a procesarTexto
  await procesarTexto(numeroDeTelefono, texto, usuario, paso, datos);
  logger.info(`📝 Texto recibido (paso: ${paso}): ${texto.substring(0, 50)}`);
}

async function procesarImagenGenerico(numeroDeTelefono, imagenID, usuario) {
  try {
    // Verificar si Claude Vision está disponible
    if (!process.env.ANTHROPIC_API_KEY) {
      await enviarTexto(
        numeroDeTelefono,
        '📸 Por el momento no puedo interpretar imágenes. Por favor escribí los datos manualmente o mandá un audio.'
      );
      return;
    }

    await procesarImagen(numeroDeTelefono, imagenID, usuario);
    logger.info(`📸 Imagen recibida de ${numeroDeTelefono}`);

  } catch (error) {
    logearError(error, `Procesamiento imagen ${imagenID}`);
    await enviarTexto(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
  }
}

async function procesarAudioGenerico(numeroDeTelefono, audioID, usuario) {
  try {
    await enviarTexto(numeroDeTelefono, MENSAJES.ANALIZANDO_AUDIO);

    const audioResultado = await procesarAudio(audioID);

    if (!audioResultado) {
      await enviarTexto(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
      return;
    }

    const { siguientePaso, guardarDato, PASOS } = await import('./conversacion.js');
    await guardarDato(numeroDeTelefono, 'razon_social_cliente', audioResultado.datos?.razon_social);
    await guardarDato(numeroDeTelefono, 'documento_cliente', audioResultado.datos?.documento);
    await guardarDato(numeroDeTelefono, 'concepto', audioResultado.datos?.concepto);
    await guardarDato(numeroDeTelefono, 'importe', audioResultado.datos?.importe);
    await siguientePaso(numeroDeTelefono, PASOS.CONFIRMACION_FACTURA);

    await enviarTexto(
      numeroDeTelefono,
      MENSAJES.AUDIO_TRANSCRIBIDO(audioResultado.datos, audioResultado.transcripcion)
    );

    logger.info(`🎤 Audio procesado de ${numeroDeTelefono}`);

  } catch (error) {
    logearError(error, `Procesamiento audio ${audioID}`);
    await enviarTexto(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
  }
}
