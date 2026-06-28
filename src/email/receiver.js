import Imap from 'imap';
import { simpleParser } from 'mailparser';
import Groq from 'groq-sdk';
import { logger } from '../logger.js';
import { getDB } from '../db.js';
import { enviarFacturaEmail, enviarRespuestaEmail, enviarPedidoRegistro } from './mailer.js';
import { solicitarCAE } from '../facturacion/factura.js';
import { generarPDFFactura } from '../facturacion/pdf.js';

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
  return new Promise((resolve, reject) => {
    try {
      let resolved = false;

      // Marcar como leído inmediatamente
      msg.setFlags(['\\Seen'], (err) => {
        if (err) logger.warn(`⚠️ Error marcando: ${err.message}`);
      });

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          logger.warn('⏱️ Timeout procesando email');
          resolve();
        }
      }, 30000);

      msg.on('body', async (stream, info) => {
        try {
          logger.info(`🔄 Parseando email...`);
          const parsed = await simpleParser(stream);
          const { subject, text, from } = parsed;

          const emailFrom = typeof from === 'string' ? from : from?.text || '';
          const contenido = `Asunto: ${subject}\n\n${text || ''}`;

          logger.info(`📧 De: ${emailFrom}, Asunto: ${subject}`);

          if (!emailFrom) {
            logger.warn('❌ Email FROM vacío');
            return;
          }

          const resultado = await procesarConGroq(contenido, emailFrom);

          if (resultado.success) {
            logger.info(`✅ Factura creada: #${resultado.factura}`);
          } else {
            logger.warn(`⚠️ ${resultado.error}`);
          }

          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        } catch (err) {
          logger.error(`❌ Parse error: ${err.message}`);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      msg.on('error', (err) => {
        logger.error(`❌ Message error: ${err.message}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch (err) {
      logger.error(`❌ Setup error: ${err.message}`);
      resolve();
    }
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
    logger.debug(`📝 GROQ response: ${respuesta.substring(0, 200)}`);

    // Robust JSON extraction - try multiple strategies
    let jsonObj = null;

    // Strategy 1: Direct JSON.parse
    try {
      jsonObj = JSON.parse(respuesta);
      logger.debug('✓ Direct JSON parse succeeded');
    } catch (e1) {
      // Strategy 2: Extract JSON object from text
      const jsonMatches = respuesta.match(/\{[^{}]*"[^"]*"[^{}]*:[^,{}]*[^{}]*\}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        try {
          jsonObj = JSON.parse(jsonMatches[0]);
          logger.debug('✓ Extracted JSON from text');
        } catch (e2) {
          logger.warn(`JSON parse failed: ${e2.message}`);
        }
      }
    }

    // Validate extracted data
    if (!jsonObj || typeof jsonObj !== 'object') {
      logger.error(`❌ Invalid GROQ response: ${respuesta.substring(0, 100)}`);
      return { success: false, error: 'Could not parse GROQ response' };
    }

    // Normalize field names (Spanish/English)
    const cuit = jsonObj.cuit || jsonObj.CUIT;
    const concepto = jsonObj.concepto || jsonObj.concept || jsonObj.Concept || '';
    const importe = parseFloat(jsonObj.importe || jsonObj.amount || jsonObj.Amount || 0);

    // Validate required fields
    if (!cuit || cuit.length < 11) {
      logger.warn(`Invalid CUIT from GROQ: ${cuit}`);
      return { success: false, error: 'CUIT must be 11 digits' };
    }

    if (!concepto || concepto.length === 0) {
      logger.warn('Empty concept from GROQ');
      return { success: false, error: 'Concept is required' };
    }

    if (isNaN(importe) || importe <= 0) {
      logger.warn(`Invalid importe from GROQ: ${importe}`);
      return { success: false, error: 'Amount must be a positive number' };
    }

    const datos = { cuit, concepto, importe };

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

    // Auto-registrar si no existe
    if (!usuario) {
      logger.info(`📝 Auto-registrando usuario: CUIT ${cuit}, email ${emailFrom}`);

      // Extraer nombre del email (parte antes de @)
      const nombreAuto = emailFrom.split('@')[0] || 'Cliente Email';
      const telefonoAuto = '11-0000-0000'; // Default

      try {
        db.prepare(`
          INSERT INTO usuarios (nombre, numero_telefono, cuit, razon_social, email, plan, activo, fecha_registro)
          VALUES (?, ?, ?, ?, ?, 'basico', 1, ?)
        `).run(nombreAuto, telefonoAuto, cuit, nombreAuto, emailFrom, ahora);

        usuario = db.prepare('SELECT * FROM usuarios WHERE cuit = ?').get(cuit);
        logger.info(`✅ Usuario auto-registrado: ${nombreAuto}`);
      } catch (err) {
        logger.error(`❌ Error auto-registrando: ${err.message}`);
        return { success: false, error: 'No se pudo registrar usuario' };
      }
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

    // Generar PDF y enviar respuesta
    try {
      const pdfPath = await generarPDFFactura({
        numero_factura: numero,
        tipo_comprobante: 'Factura C',
        fecha_emision: new Date().toISOString().split('T')[0],
        razon_social_emisor: usuario.razon_social,
        cuit_emisor: usuario.cuit,
        domicilio_emisor: usuario.domicilio || '',
        razon_social_cliente: datoExtraidos.razon_social || 'Cliente',
        documento_cliente: datoExtraidos.documento || 'CF',
        concepto,
        importe: parseFloat(importe),
        cae: 'PENDIENTE',
        punto_venta: usuario.punto_venta || 1
      });

      await enviarRespuestaEmail(emailFrom, numero, concepto, importe, pdfPath);
      logger.info(`📧 Email con PDF enviado a ${emailFrom}`);
    } catch (emailErr) {
      logger.warn(`⚠️ No se envió PDF por email: ${emailErr.message}`);
    }

    logger.info(`✅ Factura creada: #${numero} para ${usuario.razon_social}`);
    return { success: true, factura: numero, email: emailFrom };

  } catch (error) {
    logger.error(`Crear factura desde email: ${error.message}`);
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
