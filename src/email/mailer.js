import nodemailer from 'nodemailer';
import { logger } from '../logger.js';

let transporter = null;

export function inicializarMailer() {
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT || 587),
    secure: false, // TLS, no SSL
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  logger.info('✅ Mailer inicializado');
}

export async function enviarFacturaEmail(destinatario, nombreArchivo, rutaPDF) {
  try {
    if (!transporter) inicializarMailer();

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: destinatario,
      subject: `Factura: ${nombreArchivo}`,
      html: `<p>Adjunto tu factura solicitada.</p>`,
      attachments: [
        {
          filename: nombreArchivo,
          path: rutaPDF
        }
      ]
    });

    logger.info(`📧 Email enviado a ${destinatario}: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error(`Error enviando email a ${destinatario}`);
    logger.error(`  Código: ${error.code}`);
    logger.error(`  Mensaje: ${error.message}`);
    logger.error(`  Response: ${error.response}`);
    return false;
  }
}

export async function enviarRespuestaEmail(destinatario, numero, concepto, importe) {
  try {
    if (!transporter) inicializarMailer();

    const html = `
      <h2>✅ Factura Generada</h2>
      <p>Tu factura ha sido procesada correctamente.</p>
      <p><strong>Número de Factura:</strong> #${numero}</p>
      <p><strong>Concepto:</strong> ${concepto}</p>
      <p><strong>Importe:</strong> $${importe}</p>
      <p>Próximamente recibirás el PDF adjunto en otro email.</p>
      <hr>
      <p><small>Sistema automático de facturación</small></p>
    `;

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: destinatario,
      subject: `Factura #${numero} - Sistema de Facturación`,
      html: html
    });

    logger.info(`📧 Respuesta enviada a ${destinatario}`);
    return true;
  } catch (error) {
    logger.error(`Error enviando respuesta: ${error.message}`);
    return false;
  }
}

export async function enviarPedidoRegistro(destinatario, cuit) {
  try {
    if (!transporter) inicializarMailer();

    const html = `
      <h2>⚠️ Registro Requerido</h2>
      <p>Para crear facturas, primero debes registrarte en el sistema.</p>
      <p><strong>Tu CUIT:</strong> ${cuit}</p>
      <hr>
      <h3>Opciones para registrarte:</h3>
      <p><strong>1. Por WhatsApp:</strong> Envía tu mensaje a nuestro número WhatsApp con tu CUIT y datos.</p>
      <p><strong>2. Por Email:</strong> Responde a este email con tus datos de empresa (razón social, domicilio, etc.)</p>
      <p><strong>3. Panel Web:</strong> Accede a ${process.env.BASE_URL || 'http://localhost:5173'} y regístrate.</p>
      <hr>
      <p>Una vez registrado, podrás solicitar facturas directamente.</p>
      <p><small>Sistema automático de facturación</small></p>
    `;

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: destinatario,
      subject: 'Registro Requerido - Sistema de Facturación',
      html: html
    });

    logger.info(`📧 Pedido de registro enviado a ${destinatario}`);
    return true;
  } catch (error) {
    logger.error(`Error enviando pedido de registro: ${error.message}`);
    return false;
  }
}
