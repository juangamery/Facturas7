import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

import { inicializarDB, limpiarDatos, getDB, actualizarUsuario } from '../src/db.js';
import { logger } from '../src/logger.js';
import webhookWhatsApp from '../src/bot/webhook.js';
import adminRoutes from '../src/admin/routes.js';
import { handleMercadoPagoWebhook } from '../src/mercadopago/webhook.js';
import { handleEvolutionWebhook } from '../src/evolution/webhook.js';
import { inicializarMailer } from '../src/email/mailer.js';
import { inicializarReceiver } from '../src/email/receiver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../src/admin/views'));

// Sesiones
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true }
}));

// Rutas
app.use('/admin', adminRoutes);
app.post('/webhook/whatsapp', webhookWhatsApp);
app.post('/webhook/mercadopago', handleMercadoPagoWebhook);
app.post('/webhook/evolution', handleEvolutionWebhook);

// Frontend fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Inicialización async
let dbReady = false;

async function initApp() {
  try {
    await inicializarDB();
    logger.info('✅ BD conectada');
    dbReady = true;

    try {
      await inicializarMailer();
      logger.info('✅ Mailer init');
    } catch (e) {
      logger.warn(`⚠️ Mailer no disponible: ${e.message}`);
    }

    try {
      await inicializarReceiver();
      logger.info('✅ Receiver init');
    } catch (e) {
      logger.warn(`⚠️ Receiver no disponible: ${e.message}`);
    }
  } catch (error) {
    logger.error(`Init error: ${error.message}`);
  }
}

// Iniciar app
initApp();

export default app;
