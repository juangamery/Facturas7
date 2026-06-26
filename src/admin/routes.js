// ==========================================
// RUTAS DEL PANEL ADMIN
// ==========================================
// GET /admin/login, /admin/dashboard, /admin/clientes, etc
// POST /admin/clientes/nuevo, /admin/clientes/:id/activar, etc

import express from 'express';
import { getLogin, postLogin, logout, requireAuth } from './auth.js';
import {
  obtenerUsuario,
  obtenerUsuarioPorID,
  crearUsuario,
  actualizarUsuario,
  obtenerFacturasDeUsuario,
  obtenerUltimaFactura,
  getDB
} from '../db.js';
import { logger, logearError } from '../logger.js';
import { validarCUIT, validarDocumento, validarImporte } from '../facturacion/validaciones.js';
import { generarPDFFactura } from '../facturacion/pdf.js';
import { conectarReceiver } from '../email/receiver.js';

const router = express.Router();

// ==========================================
// RUTAS PÚBLICAS (sin login)
// ==========================================

// GET /admin/login
router.get('/login', getLogin);

// POST /admin/login
router.post('/login', postLogin);

// GET /admin/logout
router.get('/logout', logout);

// GET /admin/info - Página pública de info del servicio
router.get('/info', (req, res) => {
  res.render('info', {
    title: 'Información del Servicio',
    baseURL: process.env.BASE_URL
  });
});

// Redirect raíz de admin a dashboard
router.get('/', (req, res) => {
  if (req.session?.user?.logueado) {
    res.redirect('/admin/dashboard');
  } else {
    res.redirect('/admin/login');
  }
});

// GET /admin/stats - Endpoint público con stats (JSON)
router.get('/stats', (req, res) => {
  try {
    const db = getDB();

    const usuariosActivos = db.prepare(
      'SELECT COUNT(*) as count FROM usuarios WHERE activo = 1'
    ).get();

    const usuariosVencidos = db.prepare(
      `SELECT COUNT(*) as count FROM usuarios
       WHERE activo = 1 AND fecha_vencimiento < strftime('%s', 'now')`
    ).get();

    const ahora = Math.floor(Date.now() / 1000);
    const hoy = ahora - (ahora % 86400);

    const facturasHoy = db.prepare(
      `SELECT COUNT(*) as count FROM facturas WHERE creado_en >= ?`
    ).get(hoy);

    const facturasDelMes = db.prepare(
      `SELECT COUNT(*) as count FROM facturas`
    ).get();

    const ultimasFacturas = db.prepare(
      `SELECT f.*, u.nombre FROM facturas f
       JOIN usuarios u ON f.usuario_id = u.id
       ORDER BY f.creado_en DESC LIMIT 10`
    ).all();

    res.json({
      usuariosActivos: usuariosActivos.count,
      usuariosVencidos: usuariosVencidos.count,
      facturasHoy: facturasHoy.count,
      facturasDelMes: facturasDelMes.count,
      ultimasFacturas
    });

  } catch (error) {
    logearError(error, 'Stats públicos');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/facturas-json - Endpoint público lista facturas (JSON)
router.get('/facturas-json', (req, res) => {
  try {
    const db = getDB();
    const busqueda = req.query.q || '';

    let query = `
      SELECT f.*, u.nombre FROM facturas f
      JOIN usuarios u ON f.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (busqueda) {
      query += ' AND (u.nombre LIKE ? OR f.numero_factura LIKE ?)';
      params.push(`%${busqueda}%`, `%${busqueda}%`);
    }

    query += ' ORDER BY f.creado_en DESC';
    const facturas = db.prepare(query).all(...params);

    res.json({ facturas });

  } catch (error) {
    logearError(error, 'Facturas JSON');
    res.status(500).json({ error: error.message, facturas: [] });
  }
});

// GET /admin/clientes-json - Endpoint público lista clientes (JSON)
router.get('/clientes-json', (req, res) => {
  try {
    const db = getDB();
    const busqueda = req.query.q || '';

    let query = 'SELECT * FROM usuarios WHERE 1=1';
    const params = [];

    if (busqueda) {
      query += ' AND (nombre LIKE ? OR cuit LIKE ?)';
      params.push(`%${busqueda}%`, `%${busqueda}%`);
    }

    query += ' ORDER BY nombre ASC';
    const usuarios = db.prepare(query).all(...params);

    res.json({ usuarios });

  } catch (error) {
    logearError(error, 'Clientes JSON');
    res.status(500).json({ error: error.message, usuarios: [] });
  }
});

// GET /admin/facturas-descargar/:id - Descargar PDF (PÚBLICO)
router.get('/facturas-descargar/:id', (req, res) => {
  try {
    const db = getDB();
    const factura = db.prepare('SELECT pdf_path, numero_factura FROM facturas WHERE id = ?').get(req.params.id);

    if (!factura || !factura.pdf_path) {
      return res.status(404).json({ error: 'PDF no encontrado' });
    }

    const fs = require('fs');
    if (!fs.existsSync(factura.pdf_path)) {
      return res.status(404).json({ error: 'Archivo no existe' });
    }

    res.download(factura.pdf_path, `Factura_${factura.numero_factura}.pdf`);
  } catch (error) {
    logearError(error, 'Descargar PDF');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes-nuevo - Crear cliente (PÚBLICO)
router.post('/clientes-nuevo', (req, res) => {
  try {
    const { nombre, numero_telefono, cuit, razon_social, plan, email } = req.body;
    const db = getDB();

    if (!nombre || !numero_telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }

    if (cuit && !validarCUIT(cuit)) {
      return res.status(400).json({ error: 'CUIT inválido' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    const ahora = Math.floor(Date.now() / 1000);
    const vencimiento = ahora + (30 * 24 * 60 * 60);

    const stmt = db.prepare(`
      INSERT INTO usuarios (nombre, numero_telefono, cuit, razon_social, plan, email,
                           fecha_vencimiento, activo, fecha_registro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      nombre,
      numero_telefono,
      cuit || null,
      razon_social || null,
      plan || 'basico',
      email || null,
      vencimiento,
      1,
      ahora
    );

    logger.info(`Cliente ${nombre} creado`);
    res.json({ success: true, message: 'Cliente creado' });

  } catch (error) {
    logearError(error, 'Crear cliente');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/facturas-nuevo - Crear factura (PÚBLICO)
router.post('/facturas-nuevo', async (req, res) => {
  try {
    const { usuario_id, documento_cliente, razon_social_cliente, concepto, importe } = req.body;
    const db = getDB();

    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario_id);
    if (!usuario) {
      return res.status(400).json({ error: 'Cliente no encontrado' });
    }

    if (!razon_social_cliente || !concepto || !importe) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const importeNum = parseFloat(importe);
    if (isNaN(importeNum) || importeNum <= 0) {
      return res.status(400).json({ error: 'Importe debe ser mayor a 0' });
    }

    const ahora = Math.floor(Date.now() / 1000);
    const numero = `${ahora}`;

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

    const stmt = db.prepare(`
      INSERT INTO facturas (usuario_id, numero_telefono, fecha_emision, tipo_comprobante, numero_factura,
                           razon_social_cliente, documento_cliente, concepto, importe, cae, vencimiento_cae,
                           pdf_path, origen, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      usuario.id,
      usuario.numero_telefono,
      new Date().toISOString().split('T')[0],
      'Factura C',
      numero,
      razon_social_cliente,
      documento_cliente || 'CF',
      concepto,
      importeNum,
      'PENDIENTE',
      '',
      pdfPath,
      'admin',
      ahora
    );

    logger.info(`Factura ${numero} creada`);
    res.json({ success: true, numero, pdfPath });

  } catch (error) {
    logearError(error, 'Crear factura');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/email-procesar - Procesar email manualmente (PÚBLICO)
router.post('/email-procesar', async (req, res) => {
  try {
    const { cuit, email } = req.body;

    if (!cuit || !email) {
      return res.status(400).json({ error: 'Falta CUIT o email' });
    }

    const { procesarEmailManual } = await import('../email/receiver.js');
    const resultado = await procesarEmailManual(cuit, email);

    res.json(resultado);

  } catch (error) {
    logearError(error, 'Procesar email');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/email-groq - Procesar email con Groq (PÚBLICO)
router.post('/email-groq', async (req, res) => {
  try {
    const { asunto, cuerpo, email } = req.body;

    if (!asunto || !cuerpo || !email) {
      return res.status(400).json({ error: 'Falta asunto, cuerpo o email' });
    }

    const { procesarConGroq } = await import('../email/receiver.js');
    const resultado = await procesarConGroq(`Asunto: ${asunto}\n\n${cuerpo}`, email);

    res.json(resultado);

  } catch (error) {
    logearError(error, 'Email Groq');
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RUTAS PROTEGIDAS (requieren login)
// ==========================================

// Aplicar middleware de autenticación a todas las rutas siguientes
router.use(requireAuth);

// GET /admin/dashboard - Panel principal con estadísticas
router.get('/dashboard', (req, res) => {
  try {
    const db = getDB();

    // Estadísticas generales
    const usuariosActivos = db.prepare(
      'SELECT COUNT(*) as count FROM usuarios WHERE activo = 1'
    ).get();

    const usuariosVencidos = db.prepare(
      `SELECT COUNT(*) as count FROM usuarios
       WHERE activo = 1 AND fecha_vencimiento < strftime('%s', 'now')`
    ).get();

    const ahora = Math.floor(Date.now() / 1000);
    const hoy = ahora - (ahora % 86400);

    const facturasHoy = db.prepare(
      `SELECT COUNT(*) as count FROM facturas WHERE creado_en >= ?`
    ).get(hoy);

    const facturasDelMes = db.prepare(
      `SELECT COUNT(*) as count FROM facturas`
    ).get();

    // Últimas actividades
    const ultimasFacturas = db.prepare(
      `SELECT f.*, u.nombre FROM facturas f
       JOIN usuarios u ON f.usuario_id = u.id
       ORDER BY f.creado_en DESC LIMIT 10`
    ).all();

    // Usuarios próximos a vencer (7 días)
    const proximosAVencer = db.prepare(
      `SELECT * FROM usuarios
       WHERE activo = 1
       AND fecha_vencimiento > strftime('%s', 'now')
       AND fecha_vencimiento < strftime('%s', 'now', '+7 days')
       ORDER BY fecha_vencimiento ASC`
    ).all();

    res.render('dashboard', {
      title: 'Dashboard',
      usuariosActivos: usuariosActivos.count,
      usuariosVencidos: usuariosVencidos.count,
      facturasHoy: facturasHoy.count,
      facturasDelMes: facturasDelMes.count,
      ultimasFacturas,
      proximosAVencer
    });

  } catch (error) {
    logearError(error, 'Dashboard');
    res.render('dashboard', { title: 'Dashboard', error: 'Error cargando datos' });
  }
});

// GET /admin/clientes - Lista de clientes
router.get('/clientes', (req, res) => {
  try {
    const db = getDB();
    const filtro = req.query.filtro || 'todos'; // todos, activos, vencidos
    const busqueda = req.query.q || '';

    let query = 'SELECT * FROM usuarios WHERE 1=1';
    const params = [];

    if (filtro === 'activos') {
      query += ' AND activo = 1 AND fecha_vencimiento > strftime("%s", "now")';
    } else if (filtro === 'vencidos') {
      query += ' AND (activo = 0 OR fecha_vencimiento < strftime("%s", "now"))';
    }

    if (busqueda) {
      query += ' AND (nombre LIKE ? OR cuit LIKE ?)';
      params.push(`%${busqueda}%`, `%${busqueda}%`);
    }

    query += ' ORDER BY nombre ASC';
    const usuarios = db.prepare(query).all(...params);

    res.render('clientes', {
      title: 'Clientes',
      usuarios,
      filtro,
      busqueda
    });

  } catch (error) {
    logearError(error, 'Clientes');
    res.render('clientes', { title: 'Clientes', usuarios: [], filtro: 'todos', busqueda: '', error: 'Error cargando clientes' });
  }
});

// GET /admin/clientes/nuevo - Formulario de nuevo cliente
router.get('/clientes/nuevo', (req, res) => {
  res.render('cliente-nuevo', { title: 'Nuevo Cliente' });
});

// POST /admin/clientes/nuevo - Crear nuevo cliente
router.post('/clientes/nuevo', (req, res) => {
  try {
    const { nombre, numero_telefono, cuit, razon_social, plan } = req.body;
    const db = getDB();

    // Validar campos obligatorios
    if (!nombre || !numero_telefono) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }

    // Validar CUIT si está presente
    if (cuit && !validarCUIT(cuit)) {
      return res.status(400).json({ error: 'CUIT inválido' });
    }

    // Generar fecha de vencimiento (30 días desde ahora)
    const ahora = Math.floor(Date.now() / 1000);
    const vencimiento = ahora + (30 * 24 * 60 * 60);

    // Insertar en BD
    const stmt = db.prepare(`
      INSERT INTO usuarios (nombre, numero_telefono, cuit, razon_social, plan,
                           fecha_vencimiento, activo, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      nombre,
      numero_telefono,
      cuit || null,
      razon_social || null,
      plan || 'basico',
      vencimiento,
      1,
      ahora
    );

    logger.info(`Cliente ${nombre} creado (teléfono: ${numero_telefono})`);
    res.json({ success: true, message: 'Cliente creado exitosamente' });

  } catch (error) {
    logearError(error, 'Crear cliente');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/clientes/:id - Detalle de cliente
router.get('/clientes/:id', (req, res) => {
  try {
    const usuario = obtenerUsuarioPorID(req.params.id);

    if (!usuario) {
      return res.status(404).render('error', { error: 'Cliente no encontrado' });
    }

    const ultimasFacturas = obtenerFacturasDeUsuario(usuario.id, 20);

    res.render('cliente-detalle', {
      title: `Cliente: ${usuario.nombre}`,
      usuario,
      ultimasFacturas
    });

  } catch (error) {
    logearError(error, `Detalle cliente ${req.params.id}`);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes/:id/activar - Activar/desactivar cliente
router.post('/clientes/:id/activar', (req, res) => {
  try {
    const usuario = obtenerUsuarioPorID(req.params.id);
    actualizarUsuario(usuario.id, { activo: usuario.activo ? 0 : 1 });

    logger.info(`Usuario ${usuario.id} estado actualizado`);
    res.json({ success: true });

  } catch (error) {
    logearError(error, `Activar cliente`);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/clientes/:id/extender - Extender suscripción X días
router.post('/clientes/:id/extender', (req, res) => {
  try {
    const dias = parseInt(req.body.dias) || 30;
    const usuario = obtenerUsuarioPorID(req.params.id);

    const newVencimiento = Math.floor((usuario.fecha_vencimiento * 1000 + dias * 24 * 60 * 60 * 1000) / 1000);
    actualizarUsuario(usuario.id, {
      fecha_vencimiento: newVencimiento,
      activo: 1
    });

    logger.info(`Usuario ${usuario.id} suscripción extendida ${dias} días`);
    res.json({ success: true });

  } catch (error) {
    logearError(error, 'Extender suscripción');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/facturas - Historial de facturas
router.get('/facturas', (req, res) => {
  try {
    const db = getDB();
    const filtro = req.query.filtro || 'todas';
    const busqueda = req.query.q || '';

    let query = `
      SELECT f.*, u.nombre FROM facturas f
      JOIN usuarios u ON f.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (busqueda) {
      query += ' AND (u.nombre LIKE ? OR f.numero_factura LIKE ?)';
      params.push(`%${busqueda}%`, `%${busqueda}%`);
    }

    query += ' ORDER BY f.creado_en DESC';
    const facturas = db.prepare(query).all(...params);

    res.render('facturas', {
      title: 'Facturas',
      facturas,
      busqueda
    });

  } catch (error) {
    logearError(error, 'Facturas');
    res.render('facturas', { title: 'Facturas', error: 'Error cargando facturas' });
  }
});

// GET /admin/facturas/nuevo - Formulario nueva factura
router.get('/facturas/nuevo', (req, res) => {
  try {
    const db = getDB();
    const usuarios = db.prepare('SELECT id, nombre, cuit, razon_social FROM usuarios WHERE activo = 1 ORDER BY nombre').all();

    res.render('factura-nueva', {
      title: 'Nueva Factura',
      usuarios
    });
  } catch (error) {
    logearError(error, 'Formulario nueva factura');
    res.status(500).render('error', { error: error.message });
  }
});

// POST /admin/facturas/nuevo - Crear factura
router.post('/facturas/nuevo', async (req, res) => {
  try {
    const { usuario_id, documento_cliente, razon_social_cliente, concepto, importe } = req.body;
    const db = getDB();

    // Validar usuario existe
    const usuario = obtenerUsuarioPorID(usuario_id);
    if (!usuario) {
      return res.status(400).json({ error: 'Cliente no encontrado' });
    }

    // Validar campos obligatorios
    if (!razon_social_cliente || !concepto || !importe) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Validar importe
    const importeNum = parseFloat(importe);
    if (isNaN(importeNum) || importeNum <= 0) {
      return res.status(400).json({ error: 'Importe debe ser mayor a 0' });
    }

    // Validar documento si está presente
    if (documento_cliente && !validarDocumento(documento_cliente)) {
      return res.status(400).json({ error: 'Documento inválido (CUIT, DNI o CF)' });
    }

    // Generar número de factura
    const ahora = Math.floor(Date.now() / 1000);
    const numero = `${ahora}`;

    // Generar PDF
    let pdfPath = '';
    try {
      pdfPath = await generarPDFFactura({
        numero_factura: numero,
        fecha_emision: new Date().toISOString().split('T')[0],
        razon_social_cliente: razon_social_cliente,
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
      logger.info(`PDF generado: ${pdfPath}`);
    } catch (pdfError) {
      logger.warn(`No se generó PDF: ${pdfError.message}`);
      pdfPath = '';
    }

    // Guardar en BD
    const stmt = db.prepare(`
      INSERT INTO facturas (usuario_id, numero_telefono, fecha_emision, tipo_comprobante, numero_factura,
                           razon_social_cliente, documento_cliente, concepto, importe, cae, vencimiento_cae,
                           pdf_path, origen, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      usuario.id,
      usuario.numero_telefono,
      new Date().toISOString().split('T')[0],
      'Factura C',
      numero,
      razon_social_cliente,
      documento_cliente || 'CF',
      concepto,
      importeNum,
      'PENDIENTE',
      '',
      pdfPath,
      'admin',
      ahora
    );

    // Actualizar contador mensual
    db.prepare('UPDATE usuarios SET facturas_mes_actual = facturas_mes_actual + 1 WHERE id = ?').run(usuario.id);

    logger.info(`Factura ${numero} creada para usuario ${usuario.id}`);
    res.json({ success: true, numero, pdfPath });

  } catch (error) {
    logearError(error, 'Crear factura');
    res.status(500).json({ error: error.message });
  }
});

// GET /admin/comprobantes - Lista comprobantes pendientes
router.get('/comprobantes', (req, res) => {
  try {
    const db = getDB();
    const comprobantes = db.prepare(`
      SELECT * FROM comprobantes_pago
      WHERE estado = 'PENDIENTE'
      ORDER BY creado_en DESC
    `).all();

    res.json({ comprobantes });

  } catch (error) {
    logearError(error, 'Obtener comprobantes');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/comprobantes/:id/aprobar - Aprobar comprobante
router.post('/comprobantes/:id/aprobar', async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { verificado_por } = req.body;

    const comprobante = db.prepare('SELECT * FROM comprobantes_pago WHERE id = ?').get(id);
    if (!comprobante) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    const ahora = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE comprobantes_pago
      SET estado = 'APROBADO', verificado_por = ?, verificado_en = ?
      WHERE id = ?
    `).run(verificado_por || 'admin', ahora, id);

    db.prepare(`
      UPDATE conversaciones_whatsapp
      SET estado = 'ESPERANDO_NOMBRE'
      WHERE numero_whatsapp = ?
    `).run(comprobante.numero_whatsapp);

    // Enviar mensaje al usuario
    const { enviarMensajeTexto } = await import('../evolution/send.js');
    await enviarMensajeTexto(comprobante.numero_whatsapp, '✅ Pago verificado. ¿Tu nombre?');

    logger.info(`Comprobante ${id} aprobado`);
    res.json({ success: true });

  } catch (error) {
    logearError(error, 'Aprobar comprobante');
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/comprobantes/:id/rechazar - Rechazar comprobante
router.post('/comprobantes/:id/rechazar', async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { razon, verificado_por } = req.body;

    const comprobante = db.prepare('SELECT * FROM comprobantes_pago WHERE id = ?').get(id);
    if (!comprobante) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    const ahora = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE comprobantes_pago
      SET estado = 'RECHAZADO', razon_rechazo = ?, verificado_por = ?, verificado_en = ?
      WHERE id = ?
    `).run(razon || 'Comprobante inválido', verificado_por || 'admin', ahora, id);

    db.prepare(`
      UPDATE conversaciones_whatsapp
      SET estado = 'NUEVO'
      WHERE numero_whatsapp = ?
    `).run(comprobante.numero_whatsapp);

    // Enviar mensaje al usuario
    const { enviarMensajeTexto } = await import('../evolution/send.js');
    await enviarMensajeTexto(
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

// POST /admin/email-procesar - Procesar emails pendientes manualmente
router.post('/email-procesar', (req, res) => {
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
