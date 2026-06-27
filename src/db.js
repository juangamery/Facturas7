import Datastore from 'nedb';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '../data');

const stores = {
  usuarios: null,
  facturas: null,
  conversaciones: null,
  mensajes_procesados: null,
  pagos: null,
  conversaciones_whatsapp: null,
  comprobantes_pago: null
};

export function getDB() {
  return stores;
}

export async function inicializarDB() {
  try {
    stores.usuarios = new Datastore({ filename: path.join(DB_DIR, 'usuarios.db'), autoload: true });
    stores.facturas = new Datastore({ filename: path.join(DB_DIR, 'facturas.db'), autoload: true });
    stores.conversaciones = new Datastore({ filename: path.join(DB_DIR, 'conversaciones.db'), autoload: true });
    stores.mensajes_procesados = new Datastore({ filename: path.join(DB_DIR, 'mensajes_procesados.db'), autoload: true });
    stores.pagos = new Datastore({ filename: path.join(DB_DIR, 'pagos.db'), autoload: true });
    stores.conversaciones_whatsapp = new Datastore({ filename: path.join(DB_DIR, 'conversaciones_whatsapp.db'), autoload: true });
    stores.comprobantes_pago = new Datastore({ filename: path.join(DB_DIR, 'comprobantes_pago.db'), autoload: true });

    stores.usuarios.ensureIndex({ fieldName: 'numero_telefono', unique: true });
    stores.usuarios.ensureIndex({ fieldName: 'email', unique: true, sparse: true });
    stores.facturas.ensureIndex({ fieldName: 'usuario_id' });
    stores.conversaciones.ensureIndex({ fieldName: 'numero_telefono', unique: true });
    stores.mensajes_procesados.ensureIndex({ fieldName: 'message_id', unique: true });
    stores.pagos.ensureIndex({ fieldName: 'mp_payment_id', unique: true, sparse: true });
    stores.conversaciones_whatsapp.ensureIndex({ fieldName: 'numero_whatsapp', unique: true });

    logger.info(`📁 BD: ${DB_DIR}`);
    logger.info('✅ BD tablas OK');
  } catch (error) {
    logger.error(`BD init: ${error.message}`);
    throw error;
  }
}

export function limpiarDatos() {
  try {
    const ahora = Math.floor(Date.now() / 1000);
    stores.conversaciones.remove({ ultima_actividad: { $lt: ahora - 900 } }, { multi: true });
    stores.mensajes_procesados.remove({ procesado_en: { $lt: ahora - 86400 } }, { multi: true });
    logger.debug('🧹 Cleaned');
  } catch (error) {
    logger.error(`Cleanup: ${error.message}`);
  }
}

export function obtenerUsuario(numeroDeTelefono) {
  return new Promise((resolve) => {
    stores.usuarios.findOne({ numero_telefono: numeroDeTelefono }, (err, doc) => {
      resolve(doc || undefined);
    });
  });
}

export function obtenerUsuarioPorID(usuarioID) {
  return new Promise((resolve) => {
    stores.usuarios.findOne({ _id: usuarioID }, (err, doc) => {
      resolve(doc || undefined);
    });
  });
}

export function crearUsuario(numeroDeTelefono, datos = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    stores.usuarios.insert({
      numero_telefono: numeroDeTelefono,
      nombre: datos.nombre || null,
      plan: datos.plan || 'basico',
      fecha_registro: ahora,
      activo: datos.activo || 0,
      limite_facturas_mes: datos.plan === 'premium' ? -1 : 100
    }, (err, newDoc) => {
      resolve(newDoc);
    });
  });
}

export function actualizarUsuario(usuarioID, datos) {
  return new Promise((resolve) => {
    stores.usuarios.update({ _id: usuarioID }, { $set: datos }, {}, (err) => {
      resolve({ changes: 1 });
    });
  });
}

export function obtenerUltimaFactura(usuarioID) {
  return new Promise((resolve) => {
    stores.facturas.findOne({ usuario_id: usuarioID }).sort({ creado_en: -1 }).exec((err, doc) => {
      resolve(doc || undefined);
    });
  });
}

export function crearFactura(usuarioID, datos) {
  const ahora = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    stores.facturas.insert({
      usuario_id: usuarioID,
      numero_telefono: datos.numero_telefono,
      fecha_emision: datos.fecha_emision,
      tipo_comprobante: datos.tipo_comprobante || 'Factura C',
      numero_factura: datos.numero_factura,
      razon_social_cliente: datos.razon_social_cliente,
      documento_cliente: datos.documento_cliente,
      concepto: datos.concepto,
      importe: datos.importe,
      cae: datos.cae,
      vencimiento_cae: datos.vencimiento_cae,
      pdf_path: datos.pdf_path || null,
      origen: datos.origen || 'texto',
      creado_en: ahora
    }, (err, newDoc) => {
      resolve(newDoc);
    });
  });
}

export function obtenerFacturasDeUsuario(usuarioID, limite = 20) {
  return new Promise((resolve) => {
    stores.facturas.find({ usuario_id: usuarioID }).sort({ creado_en: -1 }).limit(limite).exec((err, docs) => {
      resolve(docs || []);
    });
  });
}

export function obtenerConversacion(numeroDeTelefono) {
  return new Promise((resolve) => {
    stores.conversaciones.findOne({ numero_telefono: numeroDeTelefono }, (err, doc) => {
      resolve(doc || undefined);
    });
  });
}

export function guardarConversacion(numeroDeTelefono, paso, datos = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    obtenerConversacion(numeroDeTelefono).then((existe) => {
      if (existe) {
        stores.conversaciones.update({ numero_telefono: numeroDeTelefono },
          { $set: { paso, datos: JSON.stringify(datos), ultima_actividad: ahora } }, {}, () => resolve());
      } else {
        stores.conversaciones.insert({ numero_telefono: numeroDeTelefono, paso, datos: JSON.stringify(datos), ultima_actividad: ahora }, () => resolve());
      }
    });
  });
}

export function borrarConversacion(numeroDeTelefono) {
  return new Promise((resolve) => {
    stores.conversaciones.remove({ numero_telefono: numeroDeTelefono }, {}, () => resolve());
  });
}

export function yaProcesado(messageID) {
  return new Promise((resolve) => {
    stores.mensajes_procesados.findOne({ message_id: messageID }, (err, doc) => {
      resolve(!!doc);
    });
  });
}

export function marcarComoProcesado(messageID) {
  const ahora = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    stores.mensajes_procesados.insert({ message_id: messageID, procesado_en: ahora }, () => resolve());
  });
}

export function registrarPago(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado) {
  const ahora = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    stores.pagos.insert({
      usuario_id: usuarioID,
      mp_payment_id: mpPaymentID,
      mp_subscription_id: mpSubscriptionID,
      monto,
      estado,
      fecha: ahora
    }, (err, newDoc) => {
      resolve(newDoc);
    });
  });
}

export function cerrarDB() {
  // NeDB auto-persists, no close needed
}

process.on('exit', cerrarDB);
