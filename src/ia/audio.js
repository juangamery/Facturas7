// ==========================================
// GROQ API - Transcripción y extracción de datos de audio
// ==========================================
// 1. Descargar audio .ogg de Meta
// 2. Convertir a .mp3 con ffmpeg
// 3. Transcribir con Groq Whisper
// 4. Extraer datos con Groq Llama

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { logger, logearError } from '../logger.js';

ffmpeg.setFfmpegPath(ffmpegStatic);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '../../temp');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Crear directorio temp si no existe
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ===== DESCARGAR AUDIO DE META =====

async function descargarAudio(audioID) {
  try {
    const token = process.env.WHATSAPP_TOKEN;

    // Obtener URL del audio
    const respMeta = await axios.get(
      `https://graph.instagram.com/v18.0/${audioID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const urlAudio = respMeta.data.url;

    // Descargar archivo
    const respAudio = await axios.get(urlAudio, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` }
    });

    // Guardar temporalmente
    const rutaTemp = path.join(TEMP_DIR, `${audioID}.ogg`);
    fs.writeFileSync(rutaTemp, respAudio.data);

    logger.info(`Audio descargado: ${rutaTemp}`);
    return rutaTemp;

  } catch (error) {
    logearError(error, 'descargarAudio');
    throw new Error('No pude descargar el audio');
  }
}

// ===== CONVERTIR OGG A MP3 CON FFMPEG =====

function convertirOggAMp3(rutaOgg) {
  return new Promise((resolve, reject) => {
    const rutaMp3 = rutaOgg.replace('.ogg', '.mp3');

    ffmpeg(rutaOgg)
      .toFormat('mp3')
      .on('error', (error) => {
        logearError(error, 'ffmpeg');
        reject(new Error('Error convirtiendo audio'));
      })
      .on('end', () => {
        logger.info(`Audio convertido a MP3: ${rutaMp3}`);
        // Borrar OGG original
        try {
          fs.unlinkSync(rutaOgg);
        } catch (e) {
          logger.warn(`Error borrando OGG: ${e.message}`);
        }
        resolve(rutaMp3);
      })
      .save(rutaMp3);
  });
}

// ===== TRANSCRIBIR CON GROQ WHISPER =====

async function transcribirAudio(rutaMp3) {
  try {
    const stream = fs.createReadStream(rutaMp3);
    const form = new FormData();
    form.append('file', stream);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');

    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${GROQ_API_KEY}`
        }
      }
    );

    const transcripcion = response.data.text;
    logger.info(`Audio transcrito: "${transcripcion.substring(0, 50)}..."`);
    return transcripcion;

  } catch (error) {
    logearError(error, 'transcribirAudio');
    throw new Error('Error transcribiendo audio');
  }
}

// ===== EXTRAER DATOS CON GROQ LLAMA =====

async function extraerDatos(transcripcion) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'user',
            content: `Sos un asistente de facturación electrónica argentina.
Extraé los datos del siguiente texto y devolvé ÚNICAMENTE un JSON:

{
  "razon_social": "nombre o razón social del cliente o null",
  "documento": "CUIT formato XX-XXXXXXXX-X o DNI XXXXXXXX o null",
  "concepto": "descripción del servicio o producto o null",
  "importe": número sin puntos ni comas o null,
  "confianza": "alta | media | baja"
}

Texto: ${transcripcion}`
          }
        ],
        max_tokens: 500
      },
      {
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
      }
    );

    const contenido = response.data.choices[0]?.message?.content || '{}';
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
      logger.warn('Error parseando respuesta de Groq Llama');
      return null;
    }
    logearError(error, 'extraerDatos');
    throw new Error('Error extrayendo datos de audio');
  }
}

// ===== FUNCIÓN PRINCIPAL =====

export async function procesarAudio(audioID) {
  let rutaOgg = null;
  let rutaMp3 = null;

  try {
    // Descargar
    rutaOgg = await descargarAudio(audioID);

    // Convertir
    rutaMp3 = await convertirOggAMp3(rutaOgg);

    // Transcribir
    const transcripcion = await transcribirAudio(rutaMp3);

    // Extraer datos
    const datos = await extraerDatos(transcripcion);

    return {
      transcripcion,
      datos
    };

  } finally {
    // Limpiar archivos temporales
    if (rutaMp3 && fs.existsSync(rutaMp3)) {
      try {
        fs.unlinkSync(rutaMp3);
      } catch (e) {
        logger.warn(`Error borrando MP3: ${e.message}`);
      }
    }
  }
}
