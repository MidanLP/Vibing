'use strict';
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const { sanitizeCommentHtml, htmlToText } = require('../sanitize');
const { toId, nowSql } = require('../helpers');

const router = express.Router();
const MAX_COMMENT_LENGTH = 5000;

function readComment(body) {
  const html = sanitizeCommentHtml(typeof body.content === 'string' ? body.content.slice(0, 50000) : '');
  const text = htmlToText(html);
  if (!text) return { error: 'Your comment is empty.' };
  if (text.length > MAX_COMMENT_LENGTH) return { error: `Comments can be at most ${MAX_COMMENT_LENGTH} characters long.` };
  return { html };
}

function loadComment(id) {
  return db.prepare(`
    SELECT c.*, p.blog_id, b.user_id AS blog_owner_id
    FROM comments c JOIN posts p ON p.id = c.post_id JOIN blogs b ON b.id = p.blog_id
    WHERE c.id = ?`).get(id);
}

router.post('/posts/:id/comments', auth.requireLogin, (req, res, next) => {
  const id = toId(req.params.id);
  const post = id && db.prepare(`
    SELECT p.id FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id
    WHERE p.id = ? AND p.status = 'published' AND u.is_banned = 0`).get(id);
  if (!post) return next();
  const { html, error } = readComment(req.body);
  if (error) {
    auth.setFlash(res, error, 'error');
    return res.redirect(`/posts/${post.id}#comments`);
  }
  const now = nowSql();
  const { lastInsertRowid } = db.prepare('INSERT INTO comments (post_id, user_id, content_html, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(post.id, req.user.id, html, now, now);
  res.redirect(`/posts/${post.id}#comment-${lastInsertRowid}`);
});

router.get('/comments/:id/edit', auth.requireLogin, (req, res, next) => {
  const id = toId(req.params.id);
  const comment = id && loadComment(id);
  if (!comment || comment.user_id !== req.user.id) return next();
  res.render('comments/edit', { title: 'Edit comment', comment, error: null });
});

router.post('/comments/:id', auth.requireLogin, (req, res, next) => {
  const id = toId(req.params.id);
  const comment = id && loadComment(id);
  if (!comment || comment.user_id !== req.user.id) return next();
  const { html, error } = readComment(req.body);
  if (error) {
    return res.status(400).render('comments/edit', { title: 'Edit comment', comment: { ...comment, content_html: sanitizeCommentHtml(typeof req.body.content === 'string' ? req.body.content.slice(0, 50000) : '') }, error });
  }
  db.prepare('UPDATE comments SET content_html = ?, updated_at = ? WHERE id = ?').run(html, nowSql(), comment.id);
  res.redirect(`/posts/${comment.post_id}#comment-${comment.id}`);
});

// The comment's author, the owner of the blog and admins may delete a comment.
router.post('/comments/:id/delete', auth.requireLogin, (req, res, next) => {
  const id = toId(req.params.id);
  const comment = id && loadComment(id);
  if (!comment) return next();
  const allowed = comment.user_id === req.user.id || comment.blog_owner_id === req.user.id || req.user.is_admin;
  if (!allowed) return next();
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  auth.setFlash(res, 'The comment was deleted.');
  res.redirect(`/posts/${comment.post_id}#comments`);
});

module.exports = router;
