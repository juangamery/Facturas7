// ==========================================
// FLUJO IMAGEN - Procesar foto/escaneo de factura
// ==========================================
// 1. Descargar imagen de Meta
// 2. Enviar a Claude API vision
// 3. Mostrar confirmación
// 4. Guardar datos o ir a confirmación

import {
  siguientePaso,
  guardarDato,
  PASOS,
  obtenerEstado
} from '../bot/conversacion.js';
import { enviarMensajePorMeta } from '../bot/webhook.js';
import { MENSAJES } from '../bot/plantillas.js';
import { logger } from '../logger.js';
import { analizarImagenFactura } from '../ia/vision.js';
import procesarTexto from './texto.js';

export default async function procesarImagen(numeroDeTelefono, imagenID, usuario) {
  try {
    // Mostrar mensaje de análisis
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.ANALIZANDO_IMAGEN);

    // Analizar con Claude
    const datosImagen = await analizarImagenFactura(imagenID);

    if (!datosImagen) {
      await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.IMAGEN_CONFIANZA_BAJA);
      // Ir a flujo texto manual
      siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE, {});
      return;
    }

    // Guardar datos en conversación
    guardarDato(numeroDeTelefono, 'razon_social_cliente', datosImagen.razon_social);
    guardarDato(numeroDeTelefono, 'documento_cliente', datosImagen.documento);
    guardarDato(numeroDeTelefono, 'concepto', datosImagen.concepto);
    guardarDato(numeroDeTelefono, 'importe', datosImagen.importe);

    // Mostrar confirmación según confianza
    if (datosImagen.confianza === 'alta') {
      siguientePaso(numeroDeTelefono, PASOS.CONFIRMACION_FACTURA);
      await enviarMensajePorMeta(
        numeroDeTelefono,
        MENSAJES.IMAGEN_CONFIANZA_ALTA(datosImagen)
      );

    } else if (datosImagen.confianza === 'media') {
      siguientePaso(numeroDeTelefono, PASOS.CONFIRMACION_FACTURA);
      await enviarMensajePorMeta(
        numeroDeTelefono,
        MENSAJES.IMAGEN_CONFIANZA_MEDIA(datosImagen)
      );

    } else {
      // Confianza baja - ir a entrada manual
      await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.IMAGEN_CONFIANZA_BAJA);
      siguientePaso(numeroDeTelefono, PASOS.FLUJO_CLIENTE, {});
    }

  } catch (error) {
    logger.error(`Error procesando imagen: ${error.message}`);
    await enviarMensajePorMeta(numeroDeTelefono, MENSAJES.ERROR_GENERICO);
  }
}
