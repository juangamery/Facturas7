import { logger } from '../logger.js';
import { getDB } from '../db.js';

export function inicializarReceiver() {
  logger.info('Email Receiver inicializado');
}

export async function procesarEmailManual(cuit, emailOrigen) {
  try {
    logger.info(`📧 Procesando: CUIT ${cuit} desde ${emailOrigen}`);

    const db = getDB();
    const ahora = Math.floor(Date.now() / 1000);

    // Buscar usuario por CUIT
    const usuario = db.prepare('SELECT * FROM usuarios WHERE cuit = ?').get(cuit);
    if (!usuario) {
      logger.warn(`❌ Usuario no encontrado: ${cuit}`);
      return { success: false, error: 'Usuario no encontrado' };
    }

    // Verificar email
    if (!usuario.email || usuario.email !== emailOrigen) {
      logger.warn(`❌ Email no coincide. Esperado: ${usuario.email}`);
      return { success: false, error: 'Email no coincide' };
    }

    // Obtener última factura
    const factura = db.prepare(`
      SELECT * FROM facturas WHERE usuario_id = ? ORDER BY id DESC LIMIT 1
    `).get(usuario.id);

    if (!factura) {
      logger.warn(`❌ Sin facturas para ${usuario.nombre}`);
      return { success: false, error: 'Sin facturas' };
    }

    // Guardar solicitud (en lugar de enviar email real)
    const stmt = db.prepare(`
      INSERT INTO solicitudes_factura (usuario_id, email, factura_id, estado, creado_en)
      VALUES (?, ?, ?, 'enviada', ?)
    `);
    stmt.run(usuario.id, emailOrigen, factura.id, ahora);

    logger.info(`✅ Factura ${factura.numero_factura} asociada a ${emailOrigen}`);
    return {
      success: true,
      message: `Factura ${factura.numero_factura} procesada para ${emailOrigen}`,
      factura_numero: factura.numero_factura,
      pdf_path: factura.pdf_path
    };

  } catch (error) {
    logger.error(`Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export function conectarReceiver() {
  logger.info('Receiver ready');
}
