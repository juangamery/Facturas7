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
