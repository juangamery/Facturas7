// ==========================================
// CLAUDE API - Vision para analizar imágenes
// ==========================================
// Descargar imagen de Meta y usar Claude para extraer datos
// Si ANTHROPIC_API_KEY no está configurada, retorna error

import axios from 'axios';
import { logger, logearError } from '../logger.js';

// Verificar API key al cargar
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let client = null;
if (ANTHROPIC_API_KEY) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  } catch (e) {
    logger.warn('Anthropic SDK no disponible');
  }
}

// Descargar imagen desde Meta
async function descargarImagen(imagenID) {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneID = process.env.WHATSAPP_PHONE_ID;

    // Obtener URL de la imagen
    const respMeta = await axios.get(
      `https://graph.instagram.com/v18.0/${imagenID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const urlImagen = respMeta.data.url;

    // Descargar imagen
    const respImagenBuf = await axios.get(urlImagen, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` }
    });

    return Buffer.from(respImagenBuf.data, 'binary').toString('base64');

  } catch (error) {
    logearError(error, 'Descarga imagen');
    throw new Error('No pude descargar la imagen');
  }
}

// Analizar imagen con Claude vision
export async function analizarImagenFactura(imagenID) {
  try {
    // Si no hay API key, retornar null para desactivar feature
    if (!client || !ANTHROPIC_API_KEY) {
      logger.warn('Claude Vision no disponible - falta ANTHROPIC_API_KEY');
      return null;
    }

    logger.info('Descargando imagen...');
    const imagenBase64 = await descargarImagen(imagenID);

    logger.info('Analizando con Claude Vision...');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: imagenBase64
              }
            },
            {
              type: 'text',
              text: `Sos un asistente de facturación electrónica argentina.
Analizá esta imagen y extraé los datos para emitir una factura.
Devolvé ÚNICAMENTE un JSON sin texto adicional, con este formato exacto:

{
  "razon_social": "nombre o razón social del cliente o null",
  "documento": "CUIT formato XX-XXXXXXXX-X o DNI XXXXXXXX o null",
  "concepto": "descripción del servicio o producto o null",
  "importe": número sin puntos ni comas o null,
  "confianza": "alta | media | baja"
}

Notas:
- Si la imagen es borrosa o no tiene datos claros, devolvé null
- El importe debe ser número entero, SIN separador de miles
- La confianza es: alta (datos claros y legibles), media (algunos datos sin confirmar), baja (no se ve casi nada)
`
            }
          ]
        }
      ]
    });

    // Parsear respuesta JSON
    const contenido = response.content[0]?.text || '{}';
    logger.debug(`Respuesta Claude: ${contenido.substring(0, 200)}`);

    const datos = JSON.parse(contenido);
    return {
      razon_social: datos.razon_social,
      documento: datos.documento,
      concepto: datos.concepto,
      importe: datos.importe,
      confianza: datos.confianza || 'media'
    };

  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn('Error parseando respuesta de Claude');
      return null;
    }
    logearError(error, 'analizarImagenFactura');
    throw new Error('Error analizando imagen');
  }
}
