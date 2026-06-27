import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/facturacion.db');

let SQL = null;
let db = null;

class DBWrapper {
  constructor(sqlJs) {
    this.sqlJs = sqlJs;
    this.sqlDb = null;
    this.loadFromFile();
  }

  loadFromFile() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH);
        this.sqlDb = new this.sqlJs.Database(new Uint8Array(data));
      } else {
        this.sqlDb = new this.sqlJs.Database();
      }
    } catch (e) {
      logger.error(`Error loading DB: ${e.message}`);
      this.sqlDb = new this.sqlJs.Database();
    }
  }

  saveToFile() {
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = this.sqlDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      logger.error(`Error saving DB: ${e.message}`);
    }
  }

  exec(sql) {
    try {
      this.sqlDb.run(sql);
      this.saveToFile();
    } catch (e) {
      logger.error(`DB exec error: ${e.message}`);
      throw e;
    }
  }

  prepare(sql) {
    const sqlDb = this.sqlDb;
    const self = this;
    return {
      run(...params) {
        try {
          sqlDb.run(sql, params);
          self.saveToFile();
          return { changes: 1 };
        } catch (e) {
          logger.error(`DB run error: ${e.message}`);
          throw e;
        }
      },
      get(...params) {
        try {
          const stmt = sqlDb.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        } catch (e) {
          logger.error(`DB get error: ${e.message}`);
          throw e;
        }
      },
      all(...params) {
        try {
          const stmt = sqlDb.prepare(sql);
          stmt.bind(params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (e) {
          logger.error(`DB all error: ${e.message}`);
          throw e;
        }
      }
    };
  }

  pragma(cmd) {
  }

  close() {
    if (this.sqlDb) {
      this.saveToFile();
      this.sqlDb.close();
      this.sqlDb = null;
    }
  }
}

export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call inicializarDB() first.');
  }
  return db;
}

export async function inicializarDB() {
  if (db) return;

  try {
    SQL = await initSqlJs();
    db = new DBWrapper(SQL);
    logger.info(`📁 Base de datos: ${DB_PATH}`);
  } catch (error) {
    logger.error(`Error al inicializar BD: ${error.message}`);
    throw error;
  }

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

    logger.info('✅ Tablas de BD creadas/verificadas');
  } catch (error) {
    logger.error(`Error al crear tablas: ${error.message}`);
    throw error;
  }
}

export function limpiarDatos() {
  try {
    const database = db;
    if (!database) return;

    const ahora = Math.floor(Date.now() / 1000);
    const hace15Min = ahora - (15 * 60);
    const hace24Horas = ahora - (24 * 60 * 60);

    database.prepare(`DELETE FROM conversaciones WHERE ultima_actividad < ?`).run(hace15Min);
    database.prepare(`DELETE FROM mensajes_procesados WHERE procesado_en < ?`).run(hace24Horas);

    logger.debug('🧹 Datos viejos limpiados');
  } catch (error) {
    logger.error(`Error al limpiar datos: ${error.message}`);
  }
}

// ==========================================
// FUNCIONES HELPERS - USUARIOS
// ==========================================

export function obtenerUsuario(numeroDeTelefono) {
  const database = db;
  return database.prepare(`SELECT * FROM usuarios WHERE numero_telefono = ?`).get(numeroDeTelefono);
}

export function obtenerUsuarioPorID(usuarioID) {
  const database = db;
  return database.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(usuarioID);
}

export function crearUsuario(numeroDeTelefono, datos = {}) {
  const database = db;
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
  const database = db;
  const campos = Object.keys(datos).map(k => `${k} = ?`).join(', ');
  const valores = Object.values(datos);

  return database.prepare(`UPDATE usuarios SET ${campos} WHERE id = ?`).run(...valores, usuarioID);
}

// ==========================================
// FUNCIONES HELPERS - FACTURAS
// ==========================================

export function obtenerUltimaFactura(usuarioID) {
  const database = db;
  return database.prepare(`
    SELECT * FROM facturas WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT 1
  `).get(usuarioID);
}

export function crearFactura(usuarioID, datos) {
  const database = db;
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
  const database = db;
  return database.prepare(`
    SELECT * FROM facturas WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT ?
  `).all(usuarioID, limite);
}

// ==========================================
// FUNCIONES HELPERS - CONVERSACIONES
// ==========================================

export function obtenerConversacion(numeroDeTelefono) {
  const database = db;
  return database.prepare(`SELECT * FROM conversaciones WHERE numero_telefono = ?`).get(numeroDeTelefono);
}

export function guardarConversacion(numeroDeTelefono, paso, datos = {}) {
  const database = db;
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
  const database = db;
  database.prepare(`DELETE FROM conversaciones WHERE numero_telefono = ?`).run(numeroDeTelefono);
}

// ==========================================
// FUNCIONES HELPERS - MENSAJES PROCESADOS
// ==========================================

export function yaProcesado(messageID) {
  const database = db;
  return database.prepare(`SELECT * FROM mensajes_procesados WHERE message_id = ?`).get(messageID) !== undefined;
}

export function marcarComoProcesado(messageID) {
  const database = db;
  const ahora = Math.floor(Date.now() / 1000);
  database.prepare(`INSERT OR IGNORE INTO mensajes_procesados (message_id, procesado_en) VALUES (?, ?)`).run(messageID, ahora);
}

// ==========================================
// FUNCIONES HELPERS - PAGOS
// ==========================================

export function registrarPago(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado) {
  const database = db;
  const ahora = Math.floor(Date.now() / 1000);

  return database.prepare(`
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

process.on('exit', cerrarDB);
