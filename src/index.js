// ==========================================
// PUNTO DE ENTRADA - Bot Facturación
// ==========================================
// Este archivo:
// 1. Carga variables de entorno (.env)
// 2. Inicializa la base de datos SQLite
// 3. Monta todas las rutas de la app
// 4. Inicia el servidor Express
// 5. Configura webhooks de Meta y Mercado Pago

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// Importar módulos propios
import { inicializarDB, limpiarDatos, getDB, actualizarUsuario } from './db.js';
import { initLocalDB } from './db-local.js';
import { logger } from './logger.js';
import webhookWhatsApp, { iniciarPolling } from './bot/webhook.js';
import adminRoutes from './admin/routes.js';
import { handleMercadoPagoWebhook } from './mercadopago/webhook.js';
import { inicializarMailer } from './email/mailer.js';
import { inicializarReceiver } from './email/receiver.js';

// Configurar rutas (compatibilidad con ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ==========================================
// MIDDLEWARE GLOBAL
// ==========================================

// Parsear JSON en requests POST
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Servir archivos estáticos (CSS, JS) desde /public
app.use(express.static(path.join(__dirname, '../public')));

// Configurar vista con EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'admin/views'));
app.set('view cache', false);

// ==========================================
// RUTAS
// ==========================================

// Webhook de WhatsApp (GET y POST /webhooks/whatsapp)
// GET: verificación de webhook por Meta
// POST: todos los mensajes que recibe Meta
app.get('/webhooks/whatsapp', webhookWhatsApp);
app.post('/webhooks/whatsapp', webhookWhatsApp);

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

    // 1b. Inicializar SQLite local para admin panel
    await initLocalDB();

    // 2. Limpiar datos viejos (conversaciones, archivos temporales, etc)
    // Esto se ejecuta cada hora
    setInterval(limpiarDatos, 60 * 60 * 1000);
    logger.info('Configurada limpieza horaria ✅');

    // 3. Resetear contador de facturas del mes (DESACTIVADO - loop infinito)
    // TODO: Implementar correctamente con async Supabase
    // resetearFacturasDelMes();

    // 4. Avisar a clientes vencidos (cada día a las 10:00 AM)
    avisarClientesVencidos();

    // 5. Email service (Nodemailer + IMAP) - DESACTIVADO
    // try {
    //   inicializarMailer();
    //   logger.info('Inicializando Email Receiver...');
    //   inicializarReceiver();
    //   logger.info('Email service listo ✅');
    // } catch (error) {
    //   logger.warn(`Email service no disponible: ${error.message}`);
    // }

    // 6. Iniciar polling de Wappfly
    iniciarPolling();

    // 7. Iniciar servidor Express
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor corriendo en ${BASE_URL}`);
      logger.info(`📊 Panel admin: ${BASE_URL}/admin/login`);
      logger.info(`⚡ Webhook Wappfly: ${BASE_URL}/webhooks/whatsapp`);
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
      logger.info('⏰ Scheduled reset: facturas_mes_actual (TODO: implement async Supabase)');
      // TODO: Implementar con async Supabase update
      // const db = getDB();
      // await db.from('usuarios').update({ facturas_mes_actual: 0 }).eq('activo', true);

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

  setTimeout(async () => {
    try {
      logger.info('🔔 Revisando clientes próximos a vencer...');

      // Buscar usuarios que vencen en 3 días - usar DB local
      const db = getDB();
      const en3Dias = Math.floor((Date.now() + 3 * 24 * 60 * 60 * 1000) / 1000);
      const ahora_ts = Math.floor(Date.now() / 1000);

      const usuarios = await db.from('usuarios')
        .select('*')
        .eq('activo', true)
        .not('numero_telefono', 'is', null)
        .lt('fecha_vencimiento', en3Dias)
        .gt('fecha_vencimiento', ahora_ts);

      if (usuarios.data && usuarios.data.length > 0) {
        logger.info(`📌 ${usuarios.data.length} clientes vencen en 3 días`);

        for (const usuario of usuarios.data) {
          try {
            const fechaVenc = new Date(usuario.fecha_vencimiento * 1000);
            const mensaje = `🔔 Recordatorio: Tu suscripción vence el ${fechaVenc.toLocaleDateString('es-AR')}. Contáctanos para renovar.`;

            // Aquí iría envío por WhatsApp si Evolution/WABA estuviera configurado
            logger.info(`✉️  Aviso para ${usuario.nombre}: ${mensaje}`);
          } catch (err) {
            logger.warn(`Error notificando ${usuario.nombre}: ${err.message}`);
          }
        }
      }

      avisarClientesVencidos();
    } catch (error) {
      logger.error(`Error en aviso de vencimiento: ${error.message}`);
      avisarClientesVencidos();
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
