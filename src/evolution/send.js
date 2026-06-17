import axios from 'axios';
import { logger } from '../logger.js';
import fs from 'fs';

const EVOLUTION_API = process.env.EVOLUTION_API_URL;
const EVOLUTION_TOKEN = process.env.EVOLUTION_API_TOKEN;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

export async function enviarMensajeTexto(numeroWhatsapp, texto) {
  try {
    const url = `${EVOLUTION_API}/message/sendText/${EVOLUTION_INSTANCE}`;

    const response = await axios.post(
      url,
      {
        number: numeroWhatsapp,
        text: texto
      },
      {
        headers: {
          Authorization: `Bearer ${EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`✉️ Texto enviado a ${numeroWhatsapp}`);
    return response.data;

  } catch (error) {
    logger.error(`Error enviando texto: ${error.message}`);
    throw error;
  }
}

export async function enviarPDF(numeroWhatsapp, pdfPath, nombreArchivo) {
  try {
    const url = `${EVOLUTION_API}/message/sendDocument/${EVOLUTION_INSTANCE}`;

    const fileBuffer = fs.readFileSync(pdfPath);
    const base64 = fileBuffer.toString('base64');

    const response = await axios.post(
      url,
      {
        number: numeroWhatsapp,
        document: {
          url: `data:application/pdf;base64,${base64}`,
          mimetype: 'application/pdf',
          fileName: nombreArchivo || 'factura.pdf'
        },
        caption: '📄 Tu factura electrónica'
      },
      {
        headers: {
          Authorization: `Bearer ${EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`📄 PDF enviado a ${numeroWhatsapp}: ${nombreArchivo}`);
    return response.data;

  } catch (error) {
    logger.error(`Error enviando PDF: ${error.message}`);
    throw error;
  }
}

export async function enviarImagen(numeroWhatsapp, imagenPath, caption) {
  try {
    const url = `${EVOLUTION_API}/message/sendImage/${EVOLUTION_INSTANCE}`;

    const fileBuffer = fs.readFileSync(imagenPath);
    const base64 = fileBuffer.toString('base64');

    const response = await axios.post(
      url,
      {
        number: numeroWhatsapp,
        image: {
          url: `data:image/png;base64,${base64}`,
          caption: caption || ''
        }
      },
      {
        headers: {
          Authorization: `Bearer ${EVOLUTION_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`🖼️ Imagen enviada a ${numeroWhatsapp}`);
    return response.data;

  } catch (error) {
    logger.error(`Error enviando imagen: ${error.message}`);
    throw error;
  }
}
