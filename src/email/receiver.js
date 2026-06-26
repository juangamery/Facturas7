import Imap from 'imap';
import { simpleParser } from 'mailparser';
import Groq from 'groq-sdk';
import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { enviarFacturaEmail } from './mailer.js';
import { solicitarCAE } from '../facturacion/factura.js';

let groq = null;
let imap = null;
let conectando = false;

function getGroq() {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

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
      logger.info('✅ IMAP + Groq conectado');
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
    const contenido = `Asunto: ${subject}\n\n${text || ''}`;

    const resultado = await procesarConGroq(contenido, emailFrom);

    if (resultado.success) {
      msg.setFlags(['\\Seen']);
      logger.info(`✅ Email procesado por Groq: ${emailFrom}`);
    }
  } catch (error) {
    logger.warn(`Procesar email IMAP: ${error.message}`);
  }
}

export async function procesarConGroq(contenido, emailFrom) {
  try {
    logger.info(`🧠 Groq procesando email de ${emailFrom}`);

    const completion = await getGroq().chat.completions.create({
      messages: [{
        role: 'user',
        content: `Extract invoice request data from email. Return ONLY valid JSON.

Email:
${contenido}

JSON format (values as null if not found):
{"cuit":"11-digit-number","concept":"description","amount":number}

Examples:
{"cuit":"20123456789","concept":"Professional services","amount":3000}
{"cuit":"20987654321","concept":"Consulting","amount":5000}`
      }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0
    });

    const respuesta = completion.choices[0].message.content;
    logger.info(`📝 Groq raw response: ${respuesta}`);

    // Extract JSON from response (may contain extra text)
    const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn(`❌ No JSON found in response: ${respuesta}`);
      return { success: false, error: 'Could not extract JSON from response' };
    }

    logger.info(`🔍 Extracted JSON: ${jsonMatch[0]}`);
    const datos = JSON.parse(jsonMatch[0]);

    // Accept both Spanish and English keys
    const cuit = datos.cuit;
    const concepto = datos.concepto || datos.concept;
    const importe = datos.importe || datos.amount;

    if (!cuit || !concepto || !importe) {
      logger.warn('❌ Groq: datos incompletos');
      return { success: false, error: 'Datos incompletos' };
    }

    return await crearFacturaConDatos(cuit, concepto, importe, emailFrom);

  } catch (error) {
    logger.error(`Groq error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function crearFacturaConDatos(cuit, concepto, importe, emailFrom) {
  try {
    const db = getDB();
    const ahora = Math.floor(Date.now() / 1000);

    const usuario = db.prepare('SELECT * FROM usuarios WHERE cuit = ?').get(cuit);
    if (!usuario) return { success: false, error: 'Usuario no encontrado' };

    if (!usuario.email || usuario.email !== emailFrom) {
      return { success: false, error: 'Email no coincide' };
    }

    const numero = `${ahora}`;
    const pdfPath = `facturas/Factura_${numero}_${ahora}.pdf`;

    db.prepare(`
      INSERT INTO facturas (usuario_id, numero_telefono, fecha_emision, tipo_comprobante, numero_factura,
                           razon_social_cliente, documento_cliente, concepto, importe, cae, vencimiento_cae,
                           pdf_path, origen, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario.id, usuario.numero_telefono, new Date().toISOString().split('T')[0],
      'Factura C', numero, usuario.razon_social, usuario.cuit, concepto, importe,
      'PENDIENTE', '', pdfPath, 'email', ahora
    );

    db.prepare(`
      INSERT INTO solicitudes_factura (usuario_id, email, factura_id, estado, creado_en)
      VALUES (?, ?, ?, 'enviada', ?)
    `).run(usuario.id, emailFrom, db.prepare('SELECT last_insert_rowid() as id').get().id, ahora);

    await enviarFacturaEmail(emailFrom, `Factura-${numero}.pdf`, pdfPath);

    logger.info(`✅ Factura creada por Groq: ${numero}`);
    return { success: true, factura: numero, email: emailFrom };

  } catch (error) {
    logger.error(`Crear factura: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function procesarEmailManual(cuit, emailOrigen) {
  try {
    logger.info(`📧 Manual: CUIT ${cuit} desde ${emailOrigen}`);

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

    db.prepare(`
      INSERT INTO solicitudes_factura (usuario_id, email, factura_id, estado, creado_en)
      VALUES (?, ?, ?, 'enviada', ?)
    `).run(usuario.id, emailOrigen, factura.id, ahora);

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
