import { logger } from '../logger.js';
import { enviarPorEvolution } from './webhook.js';

export async function procesarMensaje(numeroWhatsapp, contenido, tipo, messageId) {
  try {
    logger.info(`🔄 Procesando mensaje de ${numeroWhatsapp}: ${contenido.substring(0, 30)}`);

    let respuesta = '';

    // Flujo mínimo para testear
    if (contenido.toLowerCase().includes('hola') || contenido.toLowerCase().includes('hi')) {
      respuesta = `👋 ¡Hola! Bienvenido a Facturas7.\n\nSoy un bot de facturación electrónica.\n\nEscribe "1" para emitir una factura o "menu" para ver opciones.`;
    } else if (contenido === '1' || contenido.toLowerCase() === 'factura') {
      respuesta = `📄 Factura nueva.\n\n¿A nombre de quién va la factura?`;
    } else if (contenido.toLowerCase() === 'menu') {
      respuesta = `📋 MENU:\n\n1️⃣ Emitir factura\n2️⃣ Ver última factura\n3️⃣ Mi información`;
    } else {
      respuesta = `Escribiste: "${contenido}"\n\nEscribe "menu" para ver opciones.`;
    }

    logger.info(`📨 Enviando respuesta a ${numeroWhatsapp}`);
    await enviarPorEvolution(numeroWhatsapp, respuesta);

  } catch (error) {
    logger.error(`❌ Error procesarMensaje: ${error.message}`);
    try {
      await enviarPorEvolution(numeroWhatsapp, `❌ Error: ${error.message}`);
    } catch (e) {
      logger.error(`Error enviando error: ${e.message}`);
    }
  }
}
