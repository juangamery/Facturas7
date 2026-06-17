// ==========================================
// BASE DE DATOS - SQLite con better-sqlite3
// ==========================================
// Este archivo:
// 1. Crea/inicializa la BD SQLite
// 2. Define y crea todas las tablas
// 3. Exporta funciones para CRUD operations
// 4. Maneja limpieza de datos viejos

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/facturacion.db');

// Instancia de BD (singleton)
let db = null;

// Obtener instancia de BD (crear si no existe)
export function getDB() {
  if (!db) {
    try {
      // Abrir BD en modo WAL (Write-Ahead Logging) para mejor concurrencia
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      logger.info(`📁 Base de datos: ${DB_PATH}`);
    } catch (error) {
      logger.error(`Error al conectar BD: ${error.message}`);
      throw error;
    }
  }
  return db;
}

// ==========================================
// INICIALIZACIÓN DE TABLAS
// ==========================================

export async function inicializarDB() {
  const db = getDB();

  try {
    // Tabla de USUARIOS - clientes del servicio SaaS
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
        notas TEXT
      )
    `);

    // Tabla de FACTURAS - comprobantes emitidos
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

    // Tabla de CONVERSACIONES - estado de máquina de estados por teléfono
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversaciones (
        numero_telefono TEXT PRIMARY KEY,
        paso TEXT NOT NULL,
        datos TEXT NOT NULL DEFAULT '{}',
        ultima_actividad INTEGER NOT NULL
      )
    `);

    // Tabla de MENSAJES_PROCESADOS - evitar procesar dos veces el mismo mensaje
    db.exec(`
      CREATE TABLE IF NOT EXISTS mensajes_procesados (
        message_id TEXT PRIMARY KEY,
        procesado_en INTEGER NOT NULL
      )
    `);

    // Tabla de PAGOS - registro de pagos de Mercado Pago
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

    // Tabla de CONVERSACIONES_WHATSAPP - máquina de estados por usuario
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

    // Tabla de COMPROBANTES_PAGO - para verificación de pagos
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
    logger.error(`Error al crear tablas: ${error.message}`);
    throw error;
  }
}

// ==========================================
// FUNCIONES DE LIMPIEZA
// ==========================================

export function limpiarDatos() {
  try {
    const db = getDB();
    const ahora = Math.floor(Date.now() / 1000);

    // Limpiar conversaciones con más de 15 minutos de inactividad
    const hace15Min = ahora - (15 * 60);
    db.prepare(`
      DELETE FROM conversaciones
      WHERE ultima_actividad < ?
    `).run(hace15Min);

    // Limpiar mensajes procesados con más de 24 horas
    const hace24Horas = ahora - (24 * 60 * 60);
    db.prepare(`
      DELETE FROM mensajes_procesados
      WHERE procesado_en < ?
    `).run(hace24Horas);

    logger.debug('🧹 Datos viejos limpiados');

  } catch (error) {
    logger.error(`Error al limpiar datos: ${error.message}`);
  }
}

// ==========================================
// FUNCIONES HELPERS - USUARIOS
// ==========================================

// Obtener usuario por número de teléfono
export function obtenerUsuario(numeroDeTelefono) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM usuarios
    WHERE numero_telefono = ?
  `).get(numeroDeTelefono);
}

// Obtener usuario por ID
export function obtenerUsuarioPorID(usuarioID) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM usuarios
    WHERE id = ?
  `).get(usuarioID);
}

// Crear nuevo usuario
export function crearUsuario(numeroDeTelefono, datos = {}) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  return db.prepare(`
    INSERT INTO usuarios (
      numero_telefono,
      nombre,
      plan,
      fecha_registro,
      activo,
      limite_facturas_mes
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    numeroDeTelefono,
    datos.nombre || null,
    datos.plan || 'basico',
    ahora,
    datos.activo || 0,
    datos.plan === 'premium' ? -1 : 100 // -1 = ilimitado para premium
  );
}

// Actualizar usuario
export function actualizarUsuario(usuarioID, datos) {
  const db = getDB();
  const campos = Object.keys(datos).map(k => `${k} = ?`).join(', ');
  const valores = Object.values(datos);

  return db.prepare(`
    UPDATE usuarios
    SET ${campos}
    WHERE id = ?
  `).run(...valores, usuarioID);
}

// ==========================================
// FUNCIONES HELPERS - FACTURAS
// ==========================================

// Obtener última factura de un usuario
export function obtenerUltimaFactura(usuarioID) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM facturas
    WHERE usuario_id = ?
    ORDER BY creado_en DESC
    LIMIT 1
  `).get(usuarioID);
}

// Crear nueva factura
export function crearFactura(usuarioID, datos) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  return db.prepare(`
    INSERT INTO facturas (
      usuario_id,
      numero_telefono,
      fecha_emision,
      tipo_comprobante,
      numero_factura,
      razon_social_cliente,
      documento_cliente,
      concepto,
      importe,
      cae,
      vencimiento_cae,
      pdf_path,
      origen,
      creado_en
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    usuarioID,
    datos.numero_telefono,
    datos.fecha_emision,
    datos.tipo_comprobante || 'Factura C',
    datos.numero_factura,
    datos.razon_social_cliente,
    datos.documento_cliente,
    datos.concepto,
    datos.importe,
    datos.cae,
    datos.vencimiento_cae,
    datos.pdf_path || null,
    datos.origen || 'texto',
    ahora
  );
}

// Obtener facturas de un usuario
export function obtenerFacturasDeUsuario(usuarioID, limite = 20) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM facturas
    WHERE usuario_id = ?
    ORDER BY creado_en DESC
    LIMIT ?
  `).all(usuarioID, limite);
}

// ==========================================
// FUNCIONES HELPERS - CONVERSACIONES
// ==========================================

// Obtener estado de conversación
export function obtenerConversacion(numeroDeTelefono) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM conversaciones
    WHERE numero_telefono = ?
  `).get(numeroDeTelefono);
}

// Crear/actualizar conversación
export function guardarConversacion(numeroDeTelefono, paso, datos = {}) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  const conversacionExistente = obtenerConversacion(numeroDeTelefono);

  if (conversacionExistente) {
    db.prepare(`
      UPDATE conversaciones
      SET paso = ?, datos = ?, ultima_actividad = ?
      WHERE numero_telefono = ?
    `).run(paso, JSON.stringify(datos), ahora, numeroDeTelefono);
  } else {
    db.prepare(`
      INSERT INTO conversaciones (numero_telefono, paso, datos, ultima_actividad)
      VALUES (?, ?, ?, ?)
    `).run(numeroDeTelefono, paso, JSON.stringify(datos), ahora);
  }
}

// Borrar conversación
export function borrarConversacion(numeroDeTelefono) {
  const db = getDB();
  db.prepare(`
    DELETE FROM conversaciones
    WHERE numero_telefono = ?
  `).run(numeroDeTelefono);
}

// ==========================================
// FUNCIONES HELPERS - MENSAJES PROCESADOS
// ==========================================

// Verificar si mensaje ya fue procesado
export function yaProcesado(messageID) {
  const db = getDB();
  return db.prepare(`
    SELECT * FROM mensajes_procesados
    WHERE message_id = ?
  `).get(messageID) !== undefined;
}

// Marcar mensaje como procesado
export function marcarComoProcesado(messageID) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT OR IGNORE INTO mensajes_procesados (message_id, procesado_en)
    VALUES (?, ?)
  `).run(messageID, ahora);
}

// ==========================================
// FUNCIONES HELPERS - PAGOS
// ==========================================

// Registrar pago de Mercado Pago
export function registrarPago(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado) {
  const db = getDB();
  const ahora = Math.floor(Date.now() / 1000);

  return db.prepare(`
    INSERT INTO pagos (usuario_id, mp_payment_id, mp_subscription_id, monto, estado, fecha)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado, ahora);
}

// ==========================================
// CERRAR BD
// ==========================================

export function cerrarDB() {
  if (db) {
    db.close();
    db = null;
  }
}

// Cerrar BD al salir de la app
process.on('exit', cerrarDB);
