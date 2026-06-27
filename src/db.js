import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/facturacion.db');

let db = null;

export function getDB() {
  if (!db) {
    try {
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      logger.info(`📁 BD: ${DB_PATH}`);
    } catch (error) {
      logger.error(`BD connect: ${error.message}`);
      throw error;
    }
  }
  return db;
}

export async function inicializarDB() {
  const database = getDB();

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_telefono TEXT UNIQUE NOT NULL,
        nombre TEXT,
        cuit TEXT,
        razon_social TEXT,
        domicilio TEXT,
        condicion_iva TEXT DEFAULT 'Monotributista',
        punto_venta INTEGER,
        plan TEXT DEFAULT 'basico',
        activo INTEGER DEFAULT 0,
        fecha_registro INTEGER,
        fecha_vencimiento INTEGER,
        facturas_mes_actual INTEGER DEFAULT 0,
        limite_facturas_mes INTEGER DEFAULT 100,
        mp_subscription_id TEXT,
        notas TEXT,
        email TEXT UNIQUE
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        numero_telefono TEXT NOT NULL,
        fecha_emision TEXT NOT NULL,
        tipo_comprobante TEXT NOT NULL DEFAULT 'Factura C',
        numero_factura TEXT NOT NULL,
        razon_social_cliente TEXT NOT NULL,
        documento_cliente TEXT NOT NULL,
        concepto TEXT NOT NULL,
        importe REAL NOT NULL,
        cae TEXT NOT NULL,
        vencimiento_cae TEXT NOT NULL,
        pdf_path TEXT,
        origen TEXT NOT NULL DEFAULT 'texto',
        creado_en INTEGER NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS conversaciones (
        numero_telefono TEXT PRIMARY KEY,
        paso TEXT NOT NULL,
        datos TEXT NOT NULL DEFAULT '{}',
        ultima_actividad INTEGER NOT NULL
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS mensajes_procesados (
        message_id TEXT PRIMARY KEY,
        procesado_en INTEGER NOT NULL
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        mp_payment_id TEXT UNIQUE,
        mp_subscription_id TEXT,
        monto REAL,
        estado TEXT,
        fecha INTEGER,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS conversaciones_whatsapp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_whatsapp TEXT UNIQUE NOT NULL,
        estado TEXT NOT NULL DEFAULT 'NUEVO',
        datos_temporales TEXT DEFAULT '{}',
        comprobante_id INTEGER,
        creado_en INTEGER NOT NULL,
        actualizado_en INTEGER NOT NULL,
        FOREIGN KEY (comprobante_id) REFERENCES comprobantes_pago(id)
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS comprobantes_pago (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_whatsapp TEXT NOT NULL,
        archivo_path TEXT,
        tipo TEXT NOT NULL DEFAULT 'imagen',
        contenido_texto TEXT,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',
        razon_rechazo TEXT,
        verificado_por TEXT,
        creado_en INTEGER NOT NULL,
        verificado_en INTEGER
      )
    `);

    logger.info('✅ BD tablas OK');
  } catch (error) {
    logger.error(`BD init: ${error.message}`);
    throw error;
  }
}

export function limpiarDatos() {
  try {
    const database = getDB();
    const ahora = Math.floor(Date.now() / 1000);
    database.prepare(`DELETE FROM conversaciones WHERE ultima_actividad < ?`).run(ahora - 900);
    database.prepare(`DELETE FROM mensajes_procesados WHERE procesado_en < ?`).run(ahora - 86400);
    logger.debug('🧹 Cleaned');
  } catch (error) {
    logger.error(`Cleanup: ${error.message}`);
  }
}

export function obtenerUsuario(numeroDeTelefono) {
  return getDB().prepare(`SELECT * FROM usuarios WHERE numero_telefono = ?`).get(numeroDeTelefono);
}

export function obtenerUsuarioPorID(usuarioID) {
  return getDB().prepare(`SELECT * FROM usuarios WHERE id = ?`).get(usuarioID);
}

export function crearUsuario(numeroDeTelefono, datos = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return getDB().prepare(`
    INSERT INTO usuarios (numero_telefono, nombre, plan, fecha_registro, activo, limite_facturas_mes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    numeroDeTelefono, datos.nombre || null, datos.plan || 'basico', ahora, datos.activo || 0,
    datos.plan === 'premium' ? -1 : 100
  );
}

export function actualizarUsuario(usuarioID, datos) {
  const campos = Object.keys(datos).map(k => `${k} = ?`).join(', ');
  return getDB().prepare(`UPDATE usuarios SET ${campos} WHERE id = ?`).run(...Object.values(datos), usuarioID);
}

export function obtenerUltimaFactura(usuarioID) {
  return getDB().prepare(`SELECT * FROM facturas WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT 1`).get(usuarioID);
}

export function crearFactura(usuarioID, datos) {
  const ahora = Math.floor(Date.now() / 1000);
  return getDB().prepare(`
    INSERT INTO facturas (
      usuario_id, numero_telefono, fecha_emision, tipo_comprobante, numero_factura,
      razon_social_cliente, documento_cliente, concepto, importe, cae, vencimiento_cae,
      pdf_path, origen, creado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    usuarioID, datos.numero_telefono, datos.fecha_emision, datos.tipo_comprobante || 'Factura C',
    datos.numero_factura, datos.razon_social_cliente, datos.documento_cliente, datos.concepto,
    datos.importe, datos.cae, datos.vencimiento_cae, datos.pdf_path || null, datos.origen || 'texto', ahora
  );
}

export function obtenerFacturasDeUsuario(usuarioID, limite = 20) {
  return getDB().prepare(`SELECT * FROM facturas WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT ?`).all(usuarioID, limite);
}

export function obtenerConversacion(numeroDeTelefono) {
  return getDB().prepare(`SELECT * FROM conversaciones WHERE numero_telefono = ?`).get(numeroDeTelefono);
}

export function guardarConversacion(numeroDeTelefono, paso, datos = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const existe = obtenerConversacion(numeroDeTelefono);
  if (existe) {
    getDB().prepare(`UPDATE conversaciones SET paso = ?, datos = ?, ultima_actividad = ? WHERE numero_telefono = ?`).run(paso, JSON.stringify(datos), ahora, numeroDeTelefono);
  } else {
    getDB().prepare(`INSERT INTO conversaciones (numero_telefono, paso, datos, ultima_actividad) VALUES (?, ?, ?, ?)`).run(numeroDeTelefono, paso, JSON.stringify(datos), ahora);
  }
}

export function borrarConversacion(numeroDeTelefono) {
  getDB().prepare(`DELETE FROM conversaciones WHERE numero_telefono = ?`).run(numeroDeTelefono);
}

export function yaProcesado(messageID) {
  return getDB().prepare(`SELECT * FROM mensajes_procesados WHERE message_id = ?`).get(messageID) !== undefined;
}

export function marcarComoProcesado(messageID) {
  const ahora = Math.floor(Date.now() / 1000);
  getDB().prepare(`INSERT OR IGNORE INTO mensajes_procesados (message_id, procesado_en) VALUES (?, ?)`).run(messageID, ahora);
}

export function registrarPago(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado) {
  const ahora = Math.floor(Date.now() / 1000);
  return getDB().prepare(`INSERT INTO pagos (usuario_id, mp_payment_id, mp_subscription_id, monto, estado, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado, ahora);
}

export function cerrarDB() {
  if (db) {
    db.close();
    db = null;
  }
}

process.on('exit', cerrarDB);
