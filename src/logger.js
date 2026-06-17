// ==========================================
// SISTEMA DE LOGS
// ==========================================
// Logs a consola y archivo con timestamp, nivel y contexto

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../logs');

// Crear directorio de logs si no existe
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, 'app.log');

// Niveles de log
const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG'
};

// Nivel mínimo de log (cambiar a 0 para solo errores, 3 para todo)
const MIN_LEVEL = parseInt(process.env.LOG_LEVEL || '2');

// Colores para consola
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m'
};

// Función privada para escribir log
function escribirLog(nivel, mensaje, contexto = '') {
  if (nivel > MIN_LEVEL) return; // No loguear si está por debajo del nivel mínimo

  const timestamp = new Date().toISOString();
  const nombreNivel = LEVEL_NAMES[nivel];
  const contextoStr = contexto ? ` [${contexto}]` : '';

  // Formato completo para archivo
  const logFullText = `${timestamp} | ${nombreNivel}${contextoStr} | ${mensaje}`;

  // Escribir a archivo
  fs.appendFileSync(LOG_FILE, logFullText + '\n', { encoding: 'utf8' });

  // Escribir a consola con color
  let colorCode = COLORS.green;
  if (nivel === LEVELS.error) colorCode = COLORS.red;
  else if (nivel === LEVELS.warn) colorCode = COLORS.yellow;
  else if (nivel === LEVELS.debug) colorCode = COLORS.blue;

  const logConsoleText = `${colorCode}${timestamp} ${nombreNivel}${contextoStr}${COLORS.reset} ${mensaje}`;
  console.log(logConsoleText);
}

// ==========================================
// LOGGER OBJECT (exportado)
// ==========================================

export const logger = {
  // Nivel ERROR - fallos graves que detienen funcionalidad
  error: (mensaje, contexto = '') => {
    escribirLog(LEVELS.error, mensaje, contexto);
  },

  // Nivel WARN - cosas que están mal pero no detienen todo
  warn: (mensaje, contexto = '') => {
    escribirLog(LEVELS.warn, mensaje, contexto);
  },

  // Nivel INFO - información general del flujo
  info: (mensaje, contexto = '') => {
    escribirLog(LEVELS.info, mensaje, contexto);
  },

  // Nivel DEBUG - información detallada para debugging
  debug: (mensaje, contexto = '') => {
    escribirLog(LEVELS.debug, mensaje, contexto);
  }
};

// ==========================================
// FUNCIONES HELPER
// ==========================================

// Loguear error detallado con stack trace
export function logearError(error, contexto = '') {
  logger.error(`${error.message} | Stack: ${error.stack}`, contexto);
}

// Loguear información de request HTTP
export function logearRequest(metodo, ruta, statusCode, tiempoMs = 0) {
  const tiempoStr = tiempoMs > 0 ? ` (${tiempoMs}ms)` : '';
  const color = statusCode >= 400 ? 'WARN' : 'INFO';
  logger.info(`${metodo} ${ruta} → ${statusCode}${tiempoStr}`, 'HTTP');
}

// Loguear operación de BD
export function logearBD(operacion, tabla, detalles = '') {
  const detallesStr = detalles ? ` | ${detalles}` : '';
  logger.debug(`${operacion} en ${tabla}${detallesStr}`, 'DB');
}
