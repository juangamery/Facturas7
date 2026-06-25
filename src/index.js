// ==========================================
// PUNTO DE ENTRADA - Bot Facturación
// ==========================================
// Este archivo:
// 1. Carga variables de entorno (.env)
// 2. Inicializa la base de datos SQLite
// 3. Monta todas las rutas de la app
// 4. Inicia el servidor Express
// 5. Configura webhooks de Meta y Mercado Pago

import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

// Importar módulos propios
import { inicializarDB, limpiarDatos, getDB, actualizarUsuario } from './db.js';
import { logger } from './logger.js';
import webhookWhatsApp from './bot/webhook.js';
import adminRoutes from './admin/routes.js';
import { handleMercadoPagoWebhook } from './mercadopago/webhook.js';
import { handleEvolutionWebhook } from './evolution/webhook.js';
import { inicializarMailer } from './email/mailer.js';
import { inicializarReceiver } from './email/receiver.js';

// Configurar rutas (compatibilidad con ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ==========================================
// MIDDLEWARE GLOBAL
// ==========================================

// Parsear JSON en requests POST
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (CSS, JS) desde /public
app.use(express.static(path.join(__dirname, '../public')));

// Configurar vista con EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'admin/views'));
app.set('view cache', false); // Deshabilitar caché para desarrollo

// Sesiones para el panel admin
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret_change_in_prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS en prod
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ==========================================
// RUTAS
// ==========================================

// Webhook de WhatsApp (GET y POST /webhooks/whatsapp)
// GET: verificación de webhook por Meta
// POST: todos los mensajes que recibe Meta
app.get('/webhooks/whatsapp', webhookWhatsApp);
app.post('/webhooks/whatsapp', webhookWhatsApp);

// Webhook de Evolution API (POST /webhooks/evolution)
// Evolution manda acá todos los mensajes WhatsApp
app.post('/webhooks/evolution', handleEvolutionWebhook);

// Webhook de Mercado Pago (POST /webhooks/mercadopago)
// MP manda acá eventos de pagos aprobados, rechazados, etc
app.post('/webhooks/mercadopago', handleMercadoPagoWebhook);

// Panel admin (todas las rutas /admin/*)
// Rutas públicas: /admin/login, /admin/info
// Rutas protegidas: /admin/dashboard, /admin/clientes, etc
app.use('/admin', adminRoutes);

// Página de info pública (sin login) - mostrada en /admin/info
app.get('/info', (req, res) => {
  res.render('info', { title: 'Información del Servicio' });
});

// Health check para Railway/monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Redirect raíz a panel admin
app.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

// ==========================================
// INICIALIZACIÓN
// ==========================================

async function iniciar() {
  try {
    // 1. Inicializar base de datos (crear tablas si no existen)
    logger.info('Inicializando base de datos...');
    await inicializarDB();
    logger.info('Base de datos lista ✅');

    // 2. Limpiar datos viejos (conversaciones, archivos temporales, etc)
    // Esto se ejecuta cada hora
    setInterval(limpiarDatos, 60 * 60 * 1000);
    logger.info('Configurada limpieza horaria ✅');

    // 3. Resetear contador de facturas del mes (día 1 de cada mes a las 00:00)
    // Esto permite que cada cliente tenga límite de facturas por mes
    resetearFacturasDelMes();

    // 4. Avisar a clientes vencidos (cada día a las 10:00 AM)
    avisarClientesVencidos();

    // 5. Email service (Nodemailer + IMAP)
    try {
      inicializarMailer();
      logger.info('Inicializando Email Receiver...');
      inicializarReceiver();
      logger.info('Email service listo ✅');
    } catch (error) {
      logger.warn(`Email service no disponible: ${error.message}`);
    }

    // 6. Iniciar servidor Express
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor corriendo en ${BASE_URL}`);
      logger.info(`📊 Panel admin: ${BASE_URL}/admin/login`);
      logger.info(`⚡ Webhook Meta: ${BASE_URL}/webhooks/whatsapp`);
      logger.info(`💳 Webhook MP: ${BASE_URL}/webhooks/mercadopago`);
      logger.info(`📈 Health check: ${BASE_URL}/health`);
    });

  } catch (error) {
    logger.error(`❌ Error al iniciar: ${error.message}`);
    process.exit(1);
  }
}

// ==========================================
// FUNCIONES DE BACKGROUND
// ==========================================

// Resetear facturas_mes_actual cada día 1 a las 00:00
function resetearFacturasDelMes() {
  const ahora = new Date();
  const proximaMedianoche = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1, 0, 0, 0);
  let tiempoEspera = proximaMedianoche - ahora;

  // Si ya pasó el día 1, esperar al mes siguiente
  if (tiempoEspera < 0) {
    tiempoEspera = 30 * 24 * 60 * 60 * 1000;
  }

  setTimeout(() => {
    try {
      // Resetear contador de facturas para TODOS los usuarios
      const db = getDB();
      db.prepare('UPDATE usuarios SET facturas_mes_actual = 0').run();
      logger.info('✅ Contador de facturas reseteado para nuevo mes');

      // Volver a programar para el próximo mes
      resetearFacturasDelMes();
    } catch (error) {
      logger.error(`Error al resetear facturas: ${error.message}`);
    }
  }, tiempoEspera);
}

// Avisar a usuarios que vencen en 3 días
async function avisarClientesVencidos() {
  // Se ejecuta una vez por día
  const ahora = new Date();
  const proximaMedianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 10, 0, 0);
  let tiempoEspera = proximaMedianoche - ahora;

  setTimeout(() => {
    try {
      // Buscar usuarios que vencen en 3 días
      const db = getDB();
      const en3Dias = new Date();
      en3Dias.setDate(en3Dias.getDate() + 3);
      const timestamp3Dias = Math.floor(en3Dias.getTime() / 1000);

      const vencidos = db.prepare(`
        SELECT * FROM usuarios
        WHERE activo = 1
        AND fecha_vencimiento < ?
        AND fecha_vencimiento > ?
        AND numero_telefono IS NOT NULL
      `).all(timestamp3Dias, Math.floor(new Date().getTime() / 1000));

      vencidos.forEach(usuario => {
        // TODO: Enviar mensaje de WhatsApp avisando que vence pronto
        logger.info(`Aviso: ${usuario.nombre} vence en 3 días`);
      });

      avisarClientesVencidos();
    } catch (error) {
      logger.error(`Error en aviso de vencimiento: ${error.message}`);
    }
  }, tiempoEspera);
}

// ==========================================
// MANEJO DE ERRORES
// ==========================================

// Errores no capturados en promises
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

// Errores globales sin capturar
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

// Iniciar aplicación
iniciar();
