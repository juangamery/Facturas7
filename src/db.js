import Database from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/facturacion.db');

let db = null;

export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call inicializarDB() first.');
  }
  return db;
}

export async function inicializarDB() {
  if (db) return;

  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    logger.info(`📁 Base de datos: ${DB_PATH}`);

    db.exec(`
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

    db.exec(`
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

    db.exec(`
      CREATE TABLE IF NOT EXISTS conversaciones (
        numero_telefono TEXT PRIMARY KEY,
        paso TEXT NOT NULL,
        datos TEXT NOT NULL DEFAULT '{}',
        ultima_actividad INTEGER NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS mensajes_procesados (
        message_id TEXT PRIMARY KEY,
        procesado_en INTEGER NOT NULL
      )
    `);

    db.exec(`
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

    db.exec(`
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

    db.exec(`
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

    logger.info('✅ Tablas de BD creadas/verificadas');
  } catch (error) {
    logger.error(`Error al inicializar BD: ${error.message}`);
    throw error;
  }
}

export function limpiarDatos() {
  try {
    if (!db) return;

    const ahora = Math.floor(Date.now() / 1000);
    const hace15Min = ahora - (15 * 60);
    const hace24Horas = ahora - (24 * 60 * 60);

    db.prepare(`DELETE FROM conversaciones WHERE ultima_actividad < ?`).run(hace15Min);
    db.prepare(`DELETE FROM mensajes_procesados WHERE procesado_en < ?`).run(hace24Horas);

    logger.debug('🧹 Datos viejos limpiados');
  } catch (error) {
    logger.error(`Error al limpiar datos: ${error.message}`);
  }
}

export function obtenerUsuario(numeroDeTelefono) {
  const database = getDB();
  return database.prepare(`SELECT * FROM usuarios WHERE numero_telefono = ?`).get(numeroDeTelefono);
}

export function obtenerUsuarioPorID(usuarioID) {
  const database = getDB();
  return database.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(usuarioID);
}

export function crearUsuario(numeroDeTelefono, datos = {}) {
  const database = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  return database.prepare(`
    INSERT INTO usuarios (numero_telefono, nombre, plan, fecha_registro, activo, limite_facturas_mes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    numeroDeTelefono,
    datos.nombre || null,
    datos.plan || 'basico',
    ahora,
    datos.activo || 0,
    datos.plan === 'premium' ? -1 : 100
  );
}

export function actualizarUsuario(usuarioID, datos) {
  const database = getDB();
  const campos = Object.keys(datos).map(k => `${k} = ?`).join(', ');
  const valores = Object.values(datos);

  return database.prepare(`UPDATE usuarios SET ${campos} WHERE id = ?`).run(...valores, usuarioID);
}

export function obtenerUltimaFactura(usuarioID) {
  const database = getDB();
  return database.prepare(`
    SELECT * FROM facturas WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT 1
  `).get(usuarioID);
}

export function crearFactura(usuarioID, datos) {
  const database = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  return database.prepare(`
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
  const database = getDB();
  return database.prepare(`
    SELECT * FROM facturas WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT ?
  `).all(usuarioID, limite);
}

export function obtenerConversacion(numeroDeTelefono) {
  const database = getDB();
  return database.prepare(`SELECT * FROM conversaciones WHERE numero_telefono = ?`).get(numeroDeTelefono);
}

export function guardarConversacion(numeroDeTelefono, paso, datos = {}) {
  const database = getDB();
  const ahora = Math.floor(Date.now() / 1000);
  const conversacionExistente = obtenerConversacion(numeroDeTelefono);

  if (conversacionExistente) {
    database.prepare(`
      UPDATE conversaciones SET paso = ?, datos = ?, ultima_actividad = ? WHERE numero_telefono = ?
    `).run(paso, JSON.stringify(datos), ahora, numeroDeTelefono);
  } else {
    database.prepare(`
      INSERT INTO conversaciones (numero_telefono, paso, datos, ultima_actividad) VALUES (?, ?, ?, ?)
    `).run(numeroDeTelefono, paso, JSON.stringify(datos), ahora);
  }
}

export function borrarConversacion(numeroDeTelefono) {
  const database = getDB();
  database.prepare(`DELETE FROM conversaciones WHERE numero_telefono = ?`).run(numeroDeTelefono);
}

export function yaProcesado(messageID) {
  const database = getDB();
  return database.prepare(`SELECT * FROM mensajes_procesados WHERE message_id = ?`).get(messageID) !== undefined;
}

export function marcarComoProcesado(messageID) {
  const database = getDB();
  const ahora = Math.floor(Date.now() / 1000);
  database.prepare(`INSERT OR IGNORE INTO mensajes_procesados (message_id, procesado_en) VALUES (?, ?)`).run(messageID, ahora);
}

export function registrarPago(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado) {
  const database = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  return database.prepare(`
    INSERT INTO pagos (usuario_id, mp_payment_id, mp_subscription_id, monto, estado, fecha)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado, ahora);
}

export function cerrarDB() {
  if (db) {
    db.close();
    db = null;
  }
}

process.on('exit', cerrarDB);
