import Imap from 'imap';
import { simpleParser } from 'mailparser';
import Groq from 'groq-sdk';
import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { enviarFacturaEmail, enviarRespuestaEmail, enviarPedidoRegistro } from './mailer.js';
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

  logger.info(`🔗 IMAP intento ${intento}: ${process.env.MAIL_USER}@${process.env.MAIL_IMAP_HOST}`);

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
      logger.info('✅ IMAP autenticado');
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          logger.warn(`❌ Error INBOX: ${err.message}`);
          conectando = false;
          setTimeout(() => intentarConectar(intento + 1), 5000 * intento);
          imap.end();
          return;
        }
        logger.info('✅ IMAP + Groq conectado');
        conectando = false;
        buscarEmailsNuevos();
      });
    });

    imap.on('mail', () => {
      logger.info('📧 Email nuevo');
      buscarEmailsNuevos();
    });

    imap.on('error', (err) => {
      logger.warn(`❌ IMAP error (intento ${intento}): ${err.message}`);
      conectando = false;
      setTimeout(() => intentarConectar(intento + 1), 5000 * intento);
    });

    imap.on('end', () => {
      conectando = false;
      setTimeout(() => intentarConectar(intento + 1), 5000);
    });

    imap.connect();

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
  return new Promise((resolve) => {
    msg.on('attributes', async (attrs) => {
      // Get email structure
      msg.on('body', async (stream, info) => {
        try {
          const parsed = await simpleParser(stream);
          const { subject, text, from } = parsed;

          const emailFrom = from?.text || from || '';
          const contenido = `Asunto: ${subject}\n\n${text || ''}`;

          logger.info(`📧 De: ${emailFrom}, Asunto: ${subject}`);

          const resultado = await procesarConGroq(contenido, emailFrom);

          if (resultado.success) {
            logger.info(`✅ Factura creada: #${resultado.factura}`);
          }
        } catch (err) {
          logger.warn(`Procesar email: ${err.message}`);
        }
        resolve();
      });
    });
  });
}

export async function procesarConGroq(contenido, emailFrom) {
  try {
    logger.info(`🧠 Groq procesando email de ${emailFrom}`);

    const completion = await getGroq().chat.completions.create({
      messages: [{
        role: 'user',
        content: `Extract invoice data EXACTLY as shown. Return ONLY valid JSON with no extra text.

Email:
${contenido}

INSTRUCTIONS:
- cuit: Extract exact 11-digit number (e.g., "20347351300")
- concept: Description of what is being invoiced
- amount: Calculate to single NUMBER, never expressions (if "5000+40000", return 45000)

Response format - ONLY this JSON:
{"cuit":"20347351300","concept":"description","amount":12345}

Do not include code blocks, markdown, or explanations. Return ONLY the JSON object.`
      }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0
    });

    const respuesta = completion.choices[0].message.content;
    logger.info(`📝 Groq raw response: ${respuesta}`);

    // Extract first valid JSON object
    let jsonObj = null;
    try {
      // Try to find JSON object in response
      const match = respuesta.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (match) {
        jsonObj = JSON.parse(match[0]);
      }
    } catch (e) {
      // Try eval as last resort (Groq might return valid JS)
      try {
        jsonObj = eval(`(${respuesta})`);
      } catch (e2) {
        logger.warn(`❌ Could not parse JSON from: ${respuesta.substring(0, 100)}`);
        return { success: false, error: 'Invalid JSON response' };
      }
    }

    if (!jsonObj) {
      logger.warn(`❌ No JSON object found in: ${respuesta}`);
      return { success: false, error: 'Could not extract JSON from response' };
    }

    logger.info(`🔍 Extracted JSON: ${JSON.stringify(jsonObj)}`);
    const datos = jsonObj;

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

    let usuario = db.prepare('SELECT * FROM usuarios WHERE cuit = ?').get(cuit);

    if (!usuario) {
      logger.info(`🔔 Usuario no registrado: CUIT ${cuit}, email ${emailFrom}`);

      // Responder pidiendo registro
      try {
        await enviarPedidoRegistro(emailFrom, cuit);
      } catch (err) {
        logger.warn(`Error enviando pedido de registro: ${err.message}`);
      }

      return { success: false, error: 'Usuario no registrado, se envió solicitud de registro' };
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

    const factura_id = db.prepare('SELECT last_insert_rowid() as id').get().id;

    db.prepare(`
      INSERT INTO solicitudes_factura (usuario_id, email, factura_id, estado, creado_en)
      VALUES (?, ?, ?, 'procesada', ?)
    `).run(usuario.id, emailFrom, factura_id, ahora);

    // Enviar respuesta por email
    try {
      await enviarRespuestaEmail(emailFrom, numero, concepto, importe);
      logger.info(`📧 Email de respuesta enviado a ${emailFrom}`);
    } catch (emailErr) {
      logger.warn(`⚠️ Error enviando email: ${emailErr.message}`);
    }

    logger.info(`✅ Factura creada: #${numero} para ${usuario.razon_social}`);
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
