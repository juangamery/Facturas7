// ==========================================
// DESCARGA DE MEDIA (Audio, Imágenes)
// ==========================================
// Descarga archivos desde Wappfly y los guarda localmente

import fs from 'fs';
import path from 'path';
import https from 'https';
import { logger } from '../logger.js';

const MEDIA_DIR = './media';

// Crear carpeta si no existe
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export async function descargarMediaDeTelefono(mediaID) {
  try {
    // URL de descarga desde Wappfly API
    const url = `https://wappfly.wapp.pro/v1/media/${mediaID}`;
    const token = process.env.WAPPFLY_TOKEN;

    if (!token) {
      logger.warn('WAPPFLY_TOKEN no configurado');
      return null;
    }

    const options = {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    };

    return new Promise((resolve, reject) => {
      const filename = path.join(MEDIA_DIR, `${mediaID}.wav`);
      const file = fs.createWriteStream(filename);

      https.get(url, options, (response) => {
        if (response.statusCode !== 200) {
          logger.warn(`Media download error: ${response.statusCode}`);
          resolve(null);
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          logger.info(`✅ Media descargado: ${mediaID}`);
          resolve(filename);
        });
      }).on('error', (err) => {
        fs.unlink(filename, () => {});
        logger.error(`Descarga media falla: ${err.message}`);
        resolve(null);
      });
    });
  } catch (error) {
    logger.error(`descargarMediaDeTelefono error: ${error.message}`);
    return null;
  }
}
