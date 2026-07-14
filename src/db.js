import { createClient } from '@supabase/supabase-js';
import { logger } from './logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let db = null;

export function getDB() {
  if (!db) {
    db = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return db;
}

export async function inicializarDB() {
  const client = getDB();
  try {
    await client.from('usuarios').select('id').limit(1);
    logger.info('✅ BD conexión OK');
  } catch (error) {
    logger.error(`BD init: ${error.message}`);
    throw error;
  }
}

export function limpiarDatos() {
  // Supabase handles cleanup via policies
  logger.debug('🧹 Cleanup managed by Supabase');
}

export async function obtenerUsuario(numeroDeTelefono) {
  const digitos = String(numeroDeTelefono).replace(/\D/g, '');
  // Tolerante a números guardados con '+' o sin él (o con sufijo @s.whatsapp.net).
  for (const valor of [digitos, `+${digitos}`, numeroDeTelefono]) {
    const { data } = await getDB()
      .from('usuarios')
      .select('*')
      .eq('numero_telefono', valor)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

export async function obtenerUsuarioPorID(usuarioID) {
  const { data } = await getDB()
    .from('usuarios')
    .select('*')
    .eq('id', usuarioID)
    .single();
  return data;
}

export async function crearUsuario(numeroDeTelefono, datos = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const { data } = await getDB()
    .from('usuarios')
    .insert({
      numero_telefono: numeroDeTelefono,
      nombre: datos.nombre || null,
      plan: datos.plan || 'basico',
      fecha_registro: ahora,
      activo: datos.activo || 0,
      limite_facturas_mes: datos.plan === 'premium' ? -1 : 100,
      cuit: datos.cuit || null,
      email: datos.email || null
    })
    .select()
    .single();
  return data;
}

export async function actualizarUsuario(usuarioID, datos) {
  await getDB()
    .from('usuarios')
    .update(datos)
    .eq('id', usuarioID);
  return { changes: 1 };
}

export async function obtenerUltimaFactura(usuarioID) {
  const { data } = await getDB()
    .from('facturas')
    .select('*')
    .eq('usuario_id', usuarioID)
    .order('creado_en', { ascending: false })
    .limit(1)
    .single();
  return data;
}

export async function crearFactura(usuarioID, datos) {
  const ahora = Math.floor(Date.now() / 1000);
  const { data } = await getDB()
    .from('facturas')
    .insert({
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
    })
    .select()
    .single();
  return data;
}

export async function obtenerFacturasDeUsuario(usuarioID, limite = 20) {
  const { data } = await getDB()
    .from('facturas')
    .select('*')
    .eq('usuario_id', usuarioID)
    .order('creado_en', { ascending: false })
    .limit(limite);
  return data || [];
}

export async function obtenerConversacion(numeroDeTelefono) {
  const { data } = await getDB()
    .from('conversaciones')
    .select('*')
    .eq('numero_telefono', numeroDeTelefono)
    .single();
  return data;
}

export async function guardarConversacion(numeroDeTelefono, paso, datos = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const existe = await obtenerConversacion(numeroDeTelefono);

  if (existe) {
    await getDB()
      .from('conversaciones')
      .update({ paso, datos: JSON.stringify(datos), ultima_actividad: ahora })
      .eq('numero_telefono', numeroDeTelefono);
  } else {
    await getDB()
      .from('conversaciones')
      .insert({ numero_telefono: numeroDeTelefono, paso, datos: JSON.stringify(datos), ultima_actividad: ahora });
  }
}

export async function borrarConversacion(numeroDeTelefono) {
  await getDB()
    .from('conversaciones')
    .delete()
    .eq('numero_telefono', numeroDeTelefono);
}

export async function yaProcesado(messageID) {
  // BUGFIX: la tabla NO tiene columna 'id', solo 'message_id' y 'procesado_en'.
  // .select('id') daba error 400 → data null → siempre false → loop infinito.
  // .maybeSingle() evita error PGRST116 cuando no hay filas.
  const { data } = await getDB()
    .from('mensajes_procesados')
    .select('message_id')
    .eq('message_id', messageID)
    .maybeSingle();
  return !!data;
}

export async function marcarComoProcesado(messageID) {
  const ahora = Math.floor(Date.now() / 1000);
  await getDB()
    .from('mensajes_procesados')
    .insert({ message_id: messageID, procesado_en: ahora });
}

export async function registrarPago(usuarioID, mpPaymentID, mpSubscriptionID, monto, estado) {
  const ahora = Math.floor(Date.now() / 1000);
  const { data } = await getDB()
    .from('pagos')
    .insert({
      usuario_id: usuarioID,
      mp_payment_id: mpPaymentID,
      mp_subscription_id: mpSubscriptionID,
      monto,
      estado,
      fecha: ahora
    })
    .select()
    .single();
  return data;
}

export function cerrarDB() {
  // Supabase auto-closes
}

process.on('exit', cerrarDB);
