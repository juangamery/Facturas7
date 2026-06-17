// ==========================================
// AUTENTICACIÓN DEL PANEL ADMIN
// ==========================================
// Login, logout y middleware para proteger rutas

import bcrypt from 'bcrypt';
import { logger } from '../logger.js';

// Hash de contraseña admin (configurar en .env)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD_PLAIN = process.env.ADMIN_PASSWORD || 'cambiarme123';
let ADMIN_PASSWORD_HASH = null;

// Generar hash la primera vez
async function getAdminHash() {
  if (!ADMIN_PASSWORD_HASH) {
    ADMIN_PASSWORD_HASH = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);
  }
  return ADMIN_PASSWORD_HASH;
}

// Middleware para verificar sesión
export function requireAuth(req, res, next) {
  if (req.session?.user?.logueado === true) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// GET /admin/login - Mostrar formulario
export async function getLogin(req, res) {
  if (req.session?.user?.logueado) {
    return res.redirect('/admin/dashboard');
  }

  res.render('login', { title: 'Login' });
}

// POST /admin/login - Procesar login
export async function postLogin(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.render('login', {
      title: 'Login',
      error: 'Usuario y contraseña requeridos'
    });
  }

  // Verificar credenciales
  const adminHash = await getAdminHash();
  const usuarioCorrecto = usuario === ADMIN_USER;
  const passwordCorrecto = await bcrypt.compare(password, adminHash);

  if (!usuarioCorrecto || !passwordCorrecto) {
    logger.warn(`Intento de login fallido: ${usuario}`);
    return res.render('login', {
      title: 'Login',
      error: 'Usuario o contraseña incorrectos'
    });
  }

  // Crear sesión
  req.session.user = {
    logueado: true,
    usuario: ADMIN_USER,
    loginTime: new Date()
  };

  logger.info(`✅ Login exitoso: ${usuario}`);
  res.redirect('/admin/dashboard');
}

// GET /admin/logout - Cerrar sesión
export function logout(req, res) {
  req.session.destroy((err) => {
    if (err) logger.error(`Error al logout: ${err.message}`);
    res.redirect('/admin/login');
  });
}
