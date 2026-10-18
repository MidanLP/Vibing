'use strict';
const express = require('express');
const { db } = require('../db');
const config = require('../config');
const auth = require('../auth');
const { sendMail } = require('../mail');
const { str, isEmail, safeNext } = require('../helpers');

const router = express.Router();
const limiter = auth.rateLimit({ windowMs: 15 * 60 * 1000, max: config.authRateLimit });

const MIN_PASSWORD = 8;

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/signup', { title: 'Sign up', values: {}, error: null });
});

router.post('/signup', limiter, async (req, res) => {
  const values = { name: str(req.body.name, 80), email: str(req.body.email, 254).toLowerCase() };
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  let error = null;
  if (!values.name) error = 'Please enter your name.';
  else if (!isEmail(values.email)) error = 'Please enter a valid email address.';
  else if (password.length < MIN_PASSWORD) error = `The password must be at least ${MIN_PASSWORD} characters long.`;
  else if (password.length > 200) error = 'The password is too long.';
  else if (password !== req.body.password2) error = 'The two passwords do not match.';
  else if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(values.email)) {
    error = 'An account with this email already exists. Try logging in instead.';
  }
  if (error) return res.status(400).render('auth/signup', { title: 'Sign up', values, error });

  const hash = await auth.hashPassword(password);
  const { lastInsertRowid } = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(values.email, hash, values.name);
  const userId = Number(lastInsertRowid);
  await sendVerificationEmail({ id: userId, name: values.name, email: values.email });
  auth.startSession(res, userId);
  res.redirect('/verify-email');
});

// ---------- email verification ----------

async function sendVerificationEmail(user) {
  const token = auth.randomToken();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(auth.sha256(token), user.id, expires);
  const link = `${config.baseUrl}/verify-email/${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: `Confirm your email for ${config.siteName}`,
      text: `Hi ${user.name},\n\nWelcome to ${config.siteName}! Please confirm your email address by opening this link.\n`
        + `It is valid for 24 hours:\n\n${link}\n\n`
        + 'If you did not create an account, you can ignore this email.\n',
    });
  } catch (err) {
    console.error('Could not send verification email:', err.message);
  }
}

router.get('/verify-email', auth.requireLogin, (req, res) => {
  if (req.user.email_verified) return res.redirect(req.user.blog ? '/dashboard' : '/my-blog');
  res.render('auth/verify', { title: 'Confirm your email', sent: req.query.sent === '1' });
});

router.post('/verify-email/resend', auth.requireLogin, limiter, async (req, res) => {
  if (!req.user.email_verified) await sendVerificationEmail(req.user);
  res.redirect('/verify-email?sent=1');
});

router.get('/verify-email/:token', (req, res) => {
  const token = req.params.token;
  const row = typeof token === 'string' && token.length <= 100
    ? db.prepare('SELECT user_id, expires_at FROM email_verifications WHERE token_hash = ?').get(auth.sha256(token))
    : null;
  if (!row || row.expires_at < new Date().toISOString()) {
    return res.status(400).render('error', {
      title: 'Link expired',
      message: 'This confirmation link is invalid or has expired. Log in and ask for a new one.',
    });
  }
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
  db.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(row.user_id);
  auth.setFlash(res, 'Thanks! Your email address is confirmed.');
  res.redirect(req.user && req.user.id === row.user_id ? '/my-blog' : '/login');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('auth/login', { title: 'Log in', values: {}, error: null, next: safeNext(req.query.next) });
});

router.post('/login', limiter, async (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password.slice(0, 200) : '';
  const next = safeNext(req.body.next);
  const user = db.prepare('SELECT id, password_hash, is_banned FROM users WHERE email = ?').get(email);

  let ok = false;
  if (user) ok = await auth.verifyPassword(password, user.password_hash);
  else await auth.burnPasswordCheck(password);

  if (!ok) {
    return res.status(400).render('auth/login', {
      title: 'Log in', values: { email }, next, error: 'Wrong email or password.',
    });
  }
  if (user.is_banned) {
    return res.status(403).render('auth/login', {
      title: 'Log in', values: { email }, next, error: 'This account has been banned.',
    });
  }
  auth.startSession(res, user.id);
  res.redirect(next);
});

router.post('/logout', (req, res) => {
  auth.endSession(req, res);
  res.redirect('/');
});

router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot', { title: 'Forgot password', sent: false, error: null });
});

router.post('/forgot-password', limiter, async (req, res) => {
  const email = str(req.body.email, 254).toLowerCase();
  if (!isEmail(email)) {
    return res.status(400).render('auth/forgot', { title: 'Forgot password', sent: false, error: 'Please enter a valid email address.' });
  }
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ? AND is_banned = 0').get(email);
  if (user) {
    const token = auth.randomToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(auth.sha256(token), user.id, expires);
    const link = `${config.baseUrl}/reset-password/${token}`;
    try {
      await sendMail({
        to: user.email,
        subject: `Reset your ${config.siteName} password`,
        text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your password on ${config.siteName}.\n`
          + `Open this link to choose a new password. It is valid for one hour:\n\n${link}\n\n`
          + 'If you did not ask for this, you can ignore this email.\n',
      });
    } catch (err) {
      console.error('Could not send password reset email:', err.message);
    }
  }
  // Same answer whether or not the account exists, so that nobody can use
  // this form to find out who has an account.
  res.render('auth/forgot', { title: 'Forgot password', sent: true, error: null });
});

function findReset(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const row = db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?').get(auth.sha256(token));
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return row;
}

router.get('/reset-password/:token', (req, res) => {
  const valid = Boolean(findReset(req.params.token));
  res.render('auth/reset', { title: 'Choose a new password', valid, token: req.params.token, error: null });
});

router.post('/reset-password/:token', limiter, async (req, res) => {
  const reset = findReset(req.params.token);
  const render = (error) => res.status(400).render('auth/reset', {
    title: 'Choose a new password', valid: Boolean(reset), token: req.params.token, error,
  });
  if (!reset) return render(null);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < MIN_PASSWORD) return render(`The password must be at least ${MIN_PASSWORD} characters long.`);
  if (password.length > 200) return render('The password is too long.');
  if (password !== req.body.password2) return render('The two passwords do not match.');

  const hash = await auth.hashPassword(password);
  // Using the link from the email also proves the email address is theirs.
  db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(hash, reset.user_id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(reset.user_id);
  auth.endAllSessionsForUser(reset.user_id);
  auth.setFlash(res, 'Your password has been changed. You can now log in.');
  res.redirect('/login');
});

module.exports = router;
