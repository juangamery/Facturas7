import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { logger } from '../logger.js';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD_PLAIN = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.SESSION_SECRET || 'default_jwt_secret_change_in_prod';
let ADMIN_PASSWORD_HASH = null;

async function getAdminHash() {
  if (!ADMIN_PASSWORD_HASH) {
    ADMIN_PASSWORD_HASH = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);
  }
  return ADMIN_PASSWORD_HASH;
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token;

  if (!token) {
    return res.redirect('/admin/login');
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    logger.warn(`Token inválido: ${err.message}`);
    res.redirect('/admin/login');
  }
}

export async function getLogin(req, res) {
  const token = req.cookies?.auth_token;

  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/admin/dashboard');
    } catch (err) {
      // Token inválido, mostrar login
    }
  }

  res.render('login', { title: 'Login' });
}

export async function postLogin(req, res) {
  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.render('login', {
      title: 'Login',
      error: 'Usuario y contraseña requeridos'
    });
  }

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

  const token = jwt.sign(
    { usuario: ADMIN_USER, iat: Date.now() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  logger.info(`✅ Login exitoso: ${usuario}`);
  res.redirect('/admin/dashboard');
}

export function logout(req, res) {
  res.clearCookie('auth_token');
  logger.info('Logout exitoso');
  res.redirect('/admin/login');
}
