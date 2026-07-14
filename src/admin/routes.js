// ==========================================
// RUTAS DEL PANEL ADMIN (100% Supabase)
// ==========================================
// GET /admin/login, /admin/dashboard, /admin/clientes, etc
// POST /admin/clientes/nuevo, /admin/clientes/:id/activar, etc
// Nota: todo lee/escribe en Supabase vía getDB(). Ya NO se usa SQLite local.

import express from 'express';
import fs from 'fs';
import { getLogin, postLogin, logout, requireAuth } from './auth.js';
import {
  obtenerUsuarioPorID,
  actualizarUsuario,
  obtenerFacturasDeUsuario,
  getDB
} from '../db.js';
import { logger, logearError } from '../logger.js';
import { validarCUIT } from '../facturacion/validaciones.js';
import { generarPDFFactura } from '../facturacion/pdf.js';
import { conectarReceiver } from '../email/receiver.js';
import { enviarTexto } from '../whatsapp/mensajes.js';

const router = express.Router();

const ahoraSeg = () => Math.floor(Date.now() / 1000);

// Contar filas de una tabla con filtros (Supabase head+count).
async function contar(tabla, aplicarFiltros = (q) => q) {
  const { count } = await aplicarFiltros(
    getDB().from(tabla).select('*', { count: 'exact', head: true })
  );
  return count || 0;
}

// Aplana el join usuarios(nombre) → nombre en el nivel superior.
function aplanarNombre(filas) {
  return (filas || []).map((f) => ({ ...f, nombre: f.nombre ?? f.usuarios?.nombre ?? null }));
}

// ==========================================
// RUTAS PÚBLICAS (sin login)
// ==========================================

router.get('/login', getLogin);
router.post('/login', postLogin);
router.get('/logout', logout);

router.get('/info', (req, res) => {
  res.render('info', {
    title: 'Información del Servicio',
    baseURL: process.env.BASE_URL
  });
});

router.get('/', (req, res) => {
  const token = req.cookies?.auth_token;
  res.redirect(token ? '/admin/dashboard' : '/admin/login');
});

// GET /admin/stats - Stats (JSON)
router.get('/stats', async (req, res) => {
  try {
    const now = ahoraSeg();
    const hoy = now - (now % 86400);

    const usuariosActivos = await contar('usuarios', (q) => q.eq('activo', 1));
    const usuariosVencidos = await contar('usuarios', (q) => q.eq('activo', 1).lt('fecha_vencimiento', now));
    const facturasHoy = await contar('facturas', (q) => q.gte('creado_en', hoy));
    const facturasDelMes = await contar('facturas');

    const { data: ultimas } = await getDB()
      .from('facturas')
      .select('*, usuarios(nombre)')
      .order('creado_en', { ascending: false })
      .limit(10);

    res.json({
      usuariosActivos,
      usuariosVencidos,
      facturasHoy,
      facturasDelMes,
      ultimasFacturas: aplanarNombre(ultimas)
    });
  } catch (error) {
    logearError(error, 'Stats públicos');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/facturas-json
router.get('/facturas-json', async (req, res) => {
  try {
    const busqueda = req.query.q || '';
    let query = getDB()
      .from('facturas')
      .select('*, usuarios(nombre)')
      .order('creado_en', { ascending: false });
    if (busqueda) query = query.ilike('numero_factura', `%${busqueda}%`);

    const { data } = await query;
    res.json({ facturas: aplanarNombre(data) });
  } catch (error) {
    logearError(error, 'Facturas JSON');
    res.status(500).json({ error: error.message, facturas: [] });
  }
});

// GET /admin/clientes-json
router.get('/clientes-json', async (req, res) => {
  try {
    const busqueda = req.query.q || '';
    let query = getDB().from('usuarios').select('*').order('nombre');
    if (busqueda) query = query.or(`nombre.ilike.%${busqueda}%,cuit.ilike.%${busqueda}%`);

    const { data: usuarios } = await query;
    res.json({ usuarios: usuarios || [] });
  } catch (error) {
    logearError(error, 'Clientes JSON');
    res.status(500).json({ error: error.message, usuarios: [] });
  }
});

// GET /admin/facturas-descargar/:id - Descargar PDF (PÚBLICO)
router.get('/facturas-descargar/:id', async (req, res) => {
  try {
    const { data: factura } = await getDB()
      .from('facturas')
      .select('pdf_path, numero_factura')
      .eq('id', req.params.id)
      .single();

    if (!factura || !factura.pdf_path || !fs.existsSync(factura.pdf_path)) {
      return res.status(404).json({ error: 'PDF no encontrado' });
    }
    res.download(factura.pdf_path, `Factura_${factura.numero_factura}.pdf`);
  } catch (error) {
    logearError(error, 'Descargar PDF');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes-nuevo - Crear cliente (PÚBLICO)
router.post('/clientes-nuevo', async (req, res) => {
  try {
    const { nombre, numero_telefono, cuit, razon_social, plan, email } = req.body;

    if (!nombre || !numero_telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }
    if (cuit && !validarCUIT(cuit)) {
      return res.status(400).json({ error: 'CUIT inválido' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const now = ahoraSeg();
    const { error } = await getDB().from('usuarios').insert({
      nombre,
      numero_telefono: String(numero_telefono).replace(/\D/g, ''),
      cuit: cuit || null,
      razon_social: razon_social || null,
      plan: plan || 'basico',
      email: email || null,
      limite_facturas_mes: plan === 'premium' ? -1 : 100,
      fecha_vencimiento: now + 30 * 24 * 60 * 60,
      activo: 1,
      fecha_registro: now
    });
    if (error) throw error;

    logger.info(`Cliente ${nombre} creado`);
    res.json({ success: true, message: 'Cliente creado' });
  } catch (error) {
    logearError(error, 'Crear cliente');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/facturas-nuevo - Crear factura manual (PÚBLICO)
router.post('/facturas-nuevo', async (req, res) => {
  try {
    const { usuario_id, documento_cliente, razon_social_cliente, concepto, importe } = req.body;

    const usuario = await obtenerUsuarioPorID(usuario_id);
    if (!usuario) return res.status(400).json({ error: 'Cliente no encontrado' });
    if (!razon_social_cliente || !concepto || !importe) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const importeNum = parseFloat(importe);
    if (isNaN(importeNum) || importeNum <= 0) {
      return res.status(400).json({ error: 'Importe debe ser mayor a 0' });
    }

    const now = ahoraSeg();
    const numero = `${now}`;

    let pdfPath = '';
    try {
      pdfPath = await generarPDFFactura({
        numero_factura: numero,
        fecha_emision: new Date().toISOString().split('T')[0],
        razon_social_cliente,
        documento_cliente: documento_cliente || 'CF',
        domicilio_cliente: usuario.domicilio || '',
        razon_social_emisor: usuario.razon_social,
        cuit_emisor: usuario.cuit,
        domicilio_emisor: usuario.domicilio,
        condicion_iva: usuario.condicion_iva,
        concepto,
        importe: importeNum,
        tipo_comprobante: 'Factura C',
        punto_venta: usuario.punto_venta || 1,
        cae: 'PENDIENTE'
      });
    } catch (pdfError) {
      logger.warn(`No se generó PDF: ${pdfError.message}`);
    }

    const { error } = await getDB().from('facturas').insert({
      usuario_id: usuario.id,
      numero_telefono: usuario.numero_telefono,
      fecha_emision: new Date().toISOString().split('T')[0],
      tipo_comprobante: 'Factura C',
      numero_factura: numero,
      razon_social_cliente,
      documento_cliente: documento_cliente || 'CF',
      concepto,
      importe: importeNum,
      cae: 'PENDIENTE',
      vencimiento_cae: '',
      pdf_path: pdfPath,
      origen: 'admin',
      creado_en: now
    });
    if (error) throw error;

    logger.info(`Factura ${numero} creada`);
    res.json({ success: true, numero, pdfPath });
  } catch (error) {
    logearError(error, 'Crear factura');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/email-procesar (público, manual por CUIT/email)
router.post('/email-procesar', async (req, res) => {
  try {
    const { cuit, email } = req.body;
    if (!cuit || !email) return res.status(400).json({ error: 'Falta CUIT o email' });
    const { procesarEmailManual } = await import('../email/receiver.js');
    res.json(await procesarEmailManual(cuit, email));
  } catch (error) {
    logearError(error, 'Procesar email');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/email-groq (público)
router.post('/email-groq', async (req, res) => {
  try {
    const { asunto, cuerpo, email } = req.body;
    if (!asunto || !cuerpo || !email) return res.status(400).json({ error: 'Falta asunto, cuerpo o email' });
    const { procesarConGroq } = await import('../email/receiver.js');
    res.json(await procesarConGroq(`Asunto: ${asunto}\n\n${cuerpo}`, email));
  } catch (error) {
    logearError(error, 'Email Groq');
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTAS PROTEGIDAS (requieren login)
// ==========================================

router.use(requireAuth);

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const now = ahoraSeg();
    const hoy = now - (now % 86400);
    const en7dias = now + 7 * 24 * 60 * 60;

    const usuariosActivos = await contar('usuarios', (q) => q.eq('activo', 1));
    const usuariosVencidos = await contar('usuarios', (q) => q.eq('activo', 1).lt('fecha_vencimiento', now));
    const facturasHoy = await contar('facturas', (q) => q.gte('creado_en', hoy));
    const facturasDelMes = await contar('facturas');

    const { data: ultimas } = await getDB()
      .from('facturas')
      .select('*, usuarios(nombre)')
      .order('creado_en', { ascending: false })
      .limit(10);

    const { data: proximos } = await getDB()
      .from('usuarios')
      .select('*')
      .eq('activo', 1)
      .gt('fecha_vencimiento', now)
      .lt('fecha_vencimiento', en7dias)
      .order('fecha_vencimiento', { ascending: true });

    res.render('dashboard', {
      title: 'Dashboard',
      usuariosActivos,
      usuariosVencidos,
      facturasHoy,
      facturasDelMes,
      ultimasFacturas: aplanarNombre(ultimas),
      proximosAVencer: proximos || []
    });
  } catch (error) {
    logearError(error, 'Dashboard');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/clientes - Lista de clientes
router.get('/clientes', async (req, res) => {
  try {
    const filtro = req.query.filtro || 'todos';
    const busqueda = req.query.q || '';

    let query = getDB().from('usuarios').select('*');
    if (filtro === 'activos') {
      query = query.eq('activo', 1);
    } else if (filtro === 'vencidos') {
      query = query.or(`activo.eq.0,fecha_vencimiento.lt.${ahoraSeg()}`);
    }
    if (busqueda) query = query.or(`nombre.ilike.%${busqueda}%,cuit.ilike.%${busqueda}%`);

    const { data: usuarios } = await query.order('nombre');
    res.render('clientes', { title: 'Clientes', usuarios: usuarios || [], filtro, busqueda });
  } catch (error) {
    logger.error(`Clientes: ${error.message}`);
    res.render('clientes', { title: 'Clientes', usuarios: [], filtro: 'todos', busqueda: '' });
  }
});

// GET /admin/clientes/nuevo
router.get('/clientes/nuevo', (req, res) => {
  res.render('cliente-nuevo', { title: 'Nuevo Cliente' });
});

// POST /admin/clientes/nuevo
router.post('/clientes/nuevo', async (req, res) => {
  try {
    const { nombre, numero_telefono, cuit, razon_social, plan } = req.body;
    if (!nombre || !numero_telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }
    if (cuit && !validarCUIT(cuit)) {
      return res.status(400).json({ error: 'CUIT inválido' });
    }

    const now = ahoraSeg();
    const { error } = await getDB().from('usuarios').insert({
      nombre,
      numero_telefono: String(numero_telefono).replace(/\D/g, ''),
      cuit: cuit || null,
      razon_social: razon_social || null,
      plan: plan || 'basico',
      limite_facturas_mes: plan === 'premium' ? -1 : 100,
      fecha_vencimiento: now + 30 * 24 * 60 * 60,
      activo: 1,
      fecha_registro: now
    });
    if (error) throw error;

    logger.info(`Cliente ${nombre} creado (teléfono: ${numero_telefono})`);
    res.json({ success: true, message: 'Cliente creado exitosamente' });
  } catch (error) {
    logearError(error, 'Crear cliente');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/clientes/:id - Detalle
router.get('/clientes/:id', async (req, res) => {
  try {
    const usuario = await obtenerUsuarioPorID(req.params.id);
    if (!usuario) return res.status(404).render('error', { error: 'Cliente no encontrado' });

    const ultimasFacturas = await obtenerFacturasDeUsuario(usuario.id, 20);
    res.render('cliente-detalle', {
      title: `Cliente: ${usuario.nombre}`,
      usuario,
      ultimasFacturas: ultimasFacturas || []
    });
  } catch (error) {
    logearError(error, `Detalle cliente ${req.params.id}`);
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/clientes/:id/editar - Formulario de edición
router.get('/clientes/:id/editar', async (req, res) => {
  try {
    const usuario = await obtenerUsuarioPorID(req.params.id);
    if (!usuario) return res.status(404).render('error', { error: 'Cliente no encontrado' });
    res.render('cliente-editar', { title: `Editar: ${usuario.nombre}`, usuario });
  } catch (error) {
    logearError(error, `Editar form ${req.params.id}`);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes/:id/editar - Guardar cambios
router.post('/clientes/:id/editar', async (req, res) => {
  try {
    const { nombre, numero_telefono, cuit, razon_social, domicilio, condicion_iva, email, plan } = req.body;
    if (!nombre || !numero_telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }
    if (cuit && !validarCUIT(String(cuit).replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'CUIT inválido' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    await actualizarUsuario(req.params.id, {
      nombre,
      numero_telefono: String(numero_telefono).replace(/\D/g, ''),
      cuit: cuit ? String(cuit).replace(/\D/g, '') : null,
      razon_social: razon_social || null,
      domicilio: domicilio || null,
      condicion_iva: condicion_iva || null,
      email: email || null,
      plan: plan || 'basico',
      limite_facturas_mes: plan === 'premium' ? -1 : 100
    });

    logger.info(`Cliente ${req.params.id} editado`);
    res.json({ success: true });
  } catch (error) {
    logearError(error, `Editar cliente ${req.params.id}`);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes/:id/activar
router.post('/clientes/:id/activar', async (req, res) => {
  try {
    const usuario = await obtenerUsuarioPorID(req.params.id);
    await actualizarUsuario(usuario.id, { activo: usuario.activo ? 0 : 1 });
    logger.info(`Usuario ${usuario.id} estado actualizado`);
    res.json({ success: true });
  } catch (error) {
    logearError(error, 'Activar cliente');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes/:id/extender
router.post('/clientes/:id/extender', async (req, res) => {
  try {
    const dias = parseInt(req.body.dias) || 30;
    const usuario = await obtenerUsuarioPorID(req.params.id);
    const base = usuario.fecha_vencimiento || ahoraSeg();
    await actualizarUsuario(usuario.id, {
      fecha_vencimiento: base + dias * 24 * 60 * 60,
      activo: 1
    });
    logger.info(`Usuario ${usuario.id} suscripción extendida ${dias} días`);
    res.json({ success: true });
  } catch (error) {
    logearError(error, 'Extender suscripción');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes/:id/mensaje - Enviar WhatsApp al cliente (solo dentro de la ventana 24h)
router.post('/clientes/:id/mensaje', async (req, res) => {
  try {
    const texto = (req.body.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escribí un mensaje' });

    const usuario = await obtenerUsuarioPorID(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Cliente no encontrado' });

    await enviarTexto(usuario.numero_telefono, texto);
    logger.info(`✉️ Mensaje manual enviado a ${usuario.numero_telefono}`);
    res.json({ success: true });
  } catch (error) {
    // Meta rechaza si la ventana de 24h está cerrada (requiere plantilla aprobada).
    logearError(error, 'Enviar mensaje manual');
    res.status(500).json({ error: error.message || 'No se pudo enviar (¿ventana de 24h cerrada?)' });
  }
});

// GET /admin/facturas
router.get('/facturas', async (req, res) => {
  try {
    const busqueda = req.query.q || '';
    let query = getDB()
      .from('facturas')
      .select('*, usuarios(nombre)')
      .order('creado_en', { ascending: false });
    if (busqueda) query = query.ilike('numero_factura', `%${busqueda}%`);

    const { data: facturas } = await query;
    res.render('facturas', { title: 'Facturas', facturas: aplanarNombre(facturas), busqueda });
  } catch (error) {
    logger.error(`Facturas: ${error.message}`);
    res.render('facturas', { title: 'Facturas', facturas: [], busqueda: '', error: 'Error cargando facturas' });
  }
});

// GET /admin/facturas/nuevo
router.get('/facturas/nuevo', async (req, res) => {
  try {
    const { data: usuarios } = await getDB()
      .from('usuarios')
      .select('id, nombre, cuit, razon_social')
      .eq('activo', 1)
      .order('nombre');
    res.render('factura-nueva', { title: 'Nueva Factura', usuarios: usuarios || [] });
  } catch (error) {
    logger.error(`Formulario nueva factura: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/facturas/nuevo
router.post('/facturas/nuevo', async (req, res) => {
  try {
    const { usuario_id, concepto, importe } = req.body;
    if (!usuario_id || !concepto || !importe) return res.status(400).json({ error: 'Faltan campos' });

    const numero = `FAC-${Date.now()}`;
    const { error } = await getDB().from('facturas').insert({
      usuario_id: parseInt(usuario_id),
      numero_factura: numero,
      concepto,
      importe: parseFloat(importe),
      creado_en: ahoraSeg(),
      pdf_path: ''
    });
    if (error) throw error;
    res.json({ success: true, numero });
  } catch (error) {
    logger.error(`Factura error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/debug/db-status
router.get('/debug/db-status', async (req, res) => {
  try {
    const usuarios = await contar('usuarios');
    const facturas = await contar('facturas');
    res.json({ status: 'ok', usuarios_count: usuarios, facturas_count: facturas, db: 'supabase' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/comprobantes - Comprobantes de pago pendientes
router.get('/comprobantes', async (req, res) => {
  try {
    const { data: comprobantes } = await getDB()
      .from('comprobantes_pago')
      .select('*')
      .eq('estado', 'PENDIENTE')
      .order('creado_en', { ascending: false });
    res.json({ comprobantes: comprobantes || [] });
  } catch (error) {
    logearError(error, 'Obtener comprobantes');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/comprobantes/:id/aprobar
router.post('/comprobantes/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const { verificado_por } = req.body;

    const { data: comprobante } = await getDB()
      .from('comprobantes_pago').select('*').eq('id', id).single();
    if (!comprobante) return res.status(404).json({ error: 'Comprobante no encontrado' });

    await getDB().from('comprobantes_pago').update({
      estado: 'APROBADO', verificado_por: verificado_por || 'admin', verificado_en: ahoraSeg()
    }).eq('id', id);

    await enviarTexto(comprobante.numero_whatsapp, '✅ Pago verificado. ¿Tu nombre?');

    logger.info(`Comprobante ${id} aprobado`);
    res.json({ success: true });
  } catch (error) {
    logearError(error, 'Aprobar comprobante');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/comprobantes/:id/rechazar
router.post('/comprobantes/:id/rechazar', async (req, res) => {
  try {
    const { id } = req.params;
    const { razon, verificado_por } = req.body;

    const { data: comprobante } = await getDB()
      .from('comprobantes_pago').select('*').eq('id', id).single();
    if (!comprobante) return res.status(404).json({ error: 'Comprobante no encontrado' });

    await getDB().from('comprobantes_pago').update({
      estado: 'RECHAZADO', razon_rechazo: razon || 'Comprobante inválido',
      verificado_por: verificado_por || 'admin', verificado_en: ahoraSeg()
    }).eq('id', id);

    await enviarTexto(
      comprobante.numero_whatsapp,
      `❌ Comprobante rechazado: ${razon || 'Formato inválido'}\n\nIntenta de nuevo.`
    );

    logger.info(`Comprobante ${id} rechazado`);
    res.json({ success: true });
  } catch (error) {
    logearError(error, 'Rechazar comprobante');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/email-procesar-todos - Disparar receiver de emails
router.post('/email-procesar-todos', (req, res) => {
  try {
    conectarReceiver();
    logger.info('📧 Email receiver triggered');
    res.json({ success: true, message: 'Procesando emails...' });
  } catch (error) {
    logearError(error, 'Procesar emails');
    res.status(500).json({ error: error.message });
  }
});

export default router;
