import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { enviarFacturaEmail } from './mailer.js';

let imap = null;
let conectando = false;

export function inicializarReceiver() {
  intentarConectar();
}

function intentarConectar(intento = 1) {
  if (conectando) return;
  conectando = true;

  try {
    imap = new Imap({
      user: process.env.MAIL_USER,
      password: process.env.MAIL_PASS,
      host: process.env.MAIL_IMAP_HOST,
      port: parseInt(process.env.MAIL_IMAP_PORT || 993),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000
    });

    imap.on('ready', () => {
      logger.info('✅ IMAP conectado');
      conectando = false;
      buscarEmailsNuevos();
    });

    imap.on('mail', () => {
      logger.info('📧 Email nuevo');
      buscarEmailsNuevos();
    });

    imap.on('error', (err) => {
      logger.warn(`IMAP error: ${err.message}`);
      conectando = false;
      setTimeout(() => intentarConectar(intento + 1), 5000);
    });

    imap.on('end', () => {
      conectando = false;
      setTimeout(() => intentarConectar(intento + 1), 5000);
    });

    imap.openBox('INBOX', false, (err) => {
      if (err) {
        logger.warn(`Error INBOX: ${err.message}`);
        conectando = false;
        setTimeout(() => intentarConectar(intento + 1), 5000);
      }
    });

    imap.openBox('INBOX', false, () => {});

  } catch (error) {
    logger.warn(`IMAP init error: ${error.message}`);
    conectando = false;
    setTimeout(() => intentarConectar(intento + 1), 5000);
  }
}

function buscarEmailsNuevos() {
  if (!imap) return;

  try {
    imap.search(['UNSEEN'], (err, results) => {
      if (err || !results || results.length === 0) return;

      const f = imap.fetch(results, { bodies: '' });
      f.on('message', (msg) => procesarEmailImap(msg));
    });
  } catch (error) {
    logger.warn(`Buscar emails error: ${error.message}`);
  }
}

async function procesarEmailImap(msg) {
  try {
    const parsed = await simpleParser(msg);
    const { subject, text, from } = parsed;

    const emailFrom = from?.text || '';
    const cuitMatch = subject?.match(/\d{11}/) || text?.match(/\d{11}/);

    if (!cuitMatch || !emailFrom) return;

    const resultado = await procesarEmailManual(cuitMatch[0], emailFrom);

    if (resultado.success) {
      msg.setFlags(['\\Seen']);
      logger.info(`✅ Email procesado: ${emailFrom}`);
    }
  } catch (error) {
    logger.warn(`Procesar email IMAP: ${error.message}`);
  }
}

export async function procesarEmailManual(cuit, emailOrigen) {
  try {
    logger.info(`📧 Procesando: CUIT ${cuit} desde ${emailOrigen}`);

    const db = getDB();
    const ahora = Math.floor(Date.now() / 1000);

    const usuario = db.prepare('SELECT * FROM usuarios WHERE cuit = ?').get(cuit);
    if (!usuario) return { success: false, error: 'Usuario no encontrado' };

    if (!usuario.email || usuario.email !== emailOrigen) {
      return { success: false, error: 'Email no coincide' };
    }

    const factura = db.prepare(`
      SELECT * FROM facturas WHERE usuario_id = ? ORDER BY id DESC LIMIT 1
    `).get(usuario.id);

    if (!factura) return { success: false, error: 'Sin facturas' };

    // Guardar solicitud
    db.prepare(`
      INSERT INTO solicitudes_factura (usuario_id, email, factura_id, estado, creado_en)
      VALUES (?, ?, ?, 'enviada', ?)
    `).run(usuario.id, emailOrigen, factura.id, ahora);

    // Intentar enviar email
    const enviado = await enviarFacturaEmail(emailOrigen, `Factura-${factura.numero_factura}.pdf`, factura.pdf_path);

    return {
      success: true,
      message: `Factura ${factura.numero_factura} para ${emailOrigen}`,
      factura_numero: factura.numero_factura,
      pdf_path: factura.pdf_path,
      email_enviado: enviado
    };

  } catch (error) {
    logger.error(`Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export function conectarReceiver() {
  if (imap && imap.state === 'authenticated') {
    imap.openBox('INBOX', false, () => {});
  }
}
