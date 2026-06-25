import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { enviarFacturaEmail } from './mailer.js';

export function inicializarReceiver() {
  logger.info('Email Receiver inicializado (modo manual)');
}

export async function procesarEmailManual(cuit, emailOrigen) {
  try {
    logger.info(`📧 Procesando email manual: CUIT ${cuit} desde ${emailOrigen}`);

    const db = getDB();

    // Buscar usuario por CUIT
    const usuario = db.prepare('SELECT * FROM usuarios WHERE cuit = ?').get(cuit);
    if (!usuario) {
      logger.warn(`❌ Usuario no encontrado: CUIT ${cuit}`);
      return { success: false, error: 'Usuario no encontrado' };
    }

    logger.info(`✅ Usuario encontrado: ${usuario.nombre}`);

    // Verificar que el email registrado coincida
    if (!usuario.email || usuario.email !== emailOrigen) {
      logger.warn(`❌ Email no coincide. Esperado: ${usuario.email}, Recibido: ${emailOrigen}`);
      return { success: false, error: 'Email no coincide' };
    }

    // Obtener última factura del usuario para reenviar
    const factura = db.prepare(`
      SELECT * FROM facturas
      WHERE usuario_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(usuario.id);

    if (!factura) {
      logger.warn(`❌ No hay facturas para usuario ${usuario.nombre}`);
      return { success: false, error: 'Sin facturas disponibles' };
    }

    // Enviar PDF por email
    const pdfPath = factura.pdf_path;
    const nombreArchivo = `Factura-${factura.numero_factura}.pdf`;

    const enviado = await enviarFacturaEmail(usuario.email, nombreArchivo, pdfPath);
    if (enviado) {
      logger.info(`✅ Factura reenviada a ${usuario.email}`);
      return { success: true, message: `Factura enviada a ${usuario.email}` };
    }

    return { success: false, error: 'Error enviando email' };

  } catch (error) {
    logger.error(`Error procesando email: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export function conectarReceiver() {
  logger.info('Receiver (manual mode)');
}
