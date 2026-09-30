'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { db } = require('./db');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'sid';

// ---------- passwords ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// A hash of a random password, used so that login takes the same time
// whether or not the email exists.
let dummyHash;
async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, dummyHash);
}

// ---------- tokens ----------

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ---------- sessions ----------

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

function startSession(res, userId) {
  const token = randomToken();
  const maxAge = config.sessionDays * 24 * 60 * 60 * 1000;
  const expires = new Date(Date.now() + maxAge).toISOString();
  db.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expires);
  res.cookie(SESSION_COOKIE, token, cookieOptions(maxAge));
}

function endSession(req, res) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(token));
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function endAllSessionsForUser(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function loadUser(req, res, next) {
  req.user = null;
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const row = db.prepare(`
      SELECT u.id, u.email, u.name, u.bio, u.avatar, u.is_admin, u.is_banned, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ?`).get(sha256(token));
    if (!row || row.expires_at < new Date().toISOString() || row.is_banned) {
      endSession(req, res);
    } else {
      req.user = row;
      req.user.blog = db.prepare('SELECT id, slug, name FROM blogs WHERE user_id = ?').get(row.id) || null;
    }
  }
  res.locals.currentUser = req.user;
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  setFlash(res, 'Please log in first.');
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.is_admin) return next();
  res.status(404).render('error', { title: 'Not found', message: 'This page does not exist.' });
}

function purgeExpired() {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now);
}

// ---------- CSRF (double-submit cookie) ----------

const CSRF_COOKIE = 'csrf';

function csrfToken(req, res, next) {
  let token = req.cookies[CSRF_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    token = randomToken();
    res.cookie(CSRF_COOKIE, token, cookieOptions(365 * 24 * 60 * 60 * 1000));
  }
  req.csrfToken = token;
  res.locals.csrfToken = token;
  next();
}

function csrfValid(req) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.csrfToken || '';
  if (typeof sent !== 'string' || sent.length !== expected.length || !expected) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

// Checks every state-changing request. Multipart (file upload) forms are
// parsed inside their routes, so those routes call `verifyCsrf` themselves.
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.is('multipart/form-data')) return next();
  return verifyCsrf(req, res, next);
}

function verifyCsrf(req, res, next) {
  if (csrfValid(req)) return next();
  res.status(403).render('error', {
    title: 'Form expired',
    message: 'This form has expired or was sent from another site. Please go back, reload the page and try again.',
  });
}

// ---------- flash messages ----------

function setFlash(res, message, kind = 'info') {
  res.cookie('flash', JSON.stringify({ message, kind }), { ...cookieOptions(60 * 1000) });
}

function flash(req, res, next) {
  res.locals.flash = null;
  if (req.cookies.flash) {
    try {
      const parsed = JSON.parse(req.cookies.flash);
      if (parsed && typeof parsed.message === 'string') {
        res.locals.flash = { message: parsed.message, kind: parsed.kind === 'error' ? 'error' : 'info' };
      }
    } catch { /* ignore malformed cookie */ }
    res.clearCookie('flash', cookieOptions());
  }
  next();
}

// ---------- simple in-memory rate limiter ----------

function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    if (req.method !== 'POST') return next();
    const key = req.ip;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).render('error', {
        title: 'Slow down',
        message: 'Too many attempts. Please wait a few minutes and try again.',
      });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  burnPasswordCheck,
  randomToken,
  sha256,
  startSession,
  endSession,
  endAllSessionsForUser,
  loadUser,
  requireLogin,
  requireAdmin,
  purgeExpired,
  csrfToken,
  csrfProtect,
  verifyCsrf,
  setFlash,
  flash,
  rateLimit,
};
