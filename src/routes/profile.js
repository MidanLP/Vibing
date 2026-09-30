'use strict';
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const { singleImage, saveImage, deleteImage } = require('../uploads');
const { str, toId } = require('../helpers');

const router = express.Router();

router.get('/u/:id', (req, res, next) => {
  const id = toId(req.params.id);
  const profile = id && db.prepare('SELECT id, name, bio, avatar, created_at FROM users WHERE id = ? AND is_banned = 0').get(id);
  if (!profile) return next();
  const blog = db.prepare('SELECT slug, name, description FROM blogs WHERE user_id = ?').get(profile.id);
  const posts = blog ? db.prepare(`
    SELECT p.id, p.title, p.cover_image, p.content_text, p.published_at
    FROM posts p JOIN blogs b ON b.id = p.blog_id
    WHERE b.user_id = ? AND p.status = 'published'
    ORDER BY p.published_at DESC LIMIT 5`).all(profile.id) : [];
  res.render('profile/show', { title: profile.name, profile, blog, posts });
});

router.get('/settings', auth.requireLogin, (req, res) => {
  res.render('profile/settings', { title: 'Your profile', values: req.user, error: null, pwError: null });
});

router.post('/settings', auth.requireLogin, singleImage('avatar'), auth.verifyCsrf, (req, res) => {
  const values = { ...req.user, name: str(req.body.name, 80), bio: str(req.body.bio, 500) };
  let error = req.uploadError || null;
  if (!error && !values.name) error = 'Please enter your name.';
  if (error) return res.status(400).render('profile/settings', { title: 'Your profile', values, error, pwError: null });

  let avatar = req.user.avatar;
  if (req.file) {
    avatar = saveImage(req.file, req.user.id);
    deleteImage(req.user.avatar);
  } else if (req.body.remove_avatar === '1') {
    deleteImage(req.user.avatar);
    avatar = null;
  }
  db.prepare('UPDATE users SET name = ?, bio = ?, avatar = ? WHERE id = ?').run(values.name, values.bio, avatar, req.user.id);
  auth.setFlash(res, 'Your profile has been saved.');
  res.redirect('/settings');
});

router.post('/settings/password', auth.requireLogin, async (req, res) => {
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  let pwError = null;
  if (!(await auth.verifyPassword(current.slice(0, 200), row.password_hash))) pwError = 'Your current password is not correct.';
  else if (password.length < 8) pwError = 'The new password must be at least 8 characters long.';
  else if (password.length > 200) pwError = 'The new password is too long.';
  else if (password !== req.body.password2) pwError = 'The two new passwords do not match.';
  if (pwError) {
    return res.status(400).render('profile/settings', { title: 'Your profile', values: req.user, error: null, pwError });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await auth.hashPassword(password), req.user.id);
  auth.endAllSessionsForUser(req.user.id);
  auth.startSession(res, req.user.id);
  auth.setFlash(res, 'Your password has been changed.');
  res.redirect('/settings');
});

module.exports = router;
