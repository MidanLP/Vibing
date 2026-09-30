'use strict';
const express = require('express');
const { db, transaction } = require('../db');
const auth = require('../auth');
const { deleteImage, deleteAllImagesOfUser } = require('../uploads');
const { str, toId, pageParams, pagination, likePattern } = require('../helpers');

const router = express.Router();
router.use(auth.requireAdmin);

const PAGE = 25;

function searchClause(q, columns) {
  if (!q) return { sql: '1 = 1', params: [] };
  const pattern = likePattern(q);
  return {
    sql: '(' + columns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')',
    params: columns.map(() => pattern),
  };
}

function back(req, res, message) {
  auth.setFlash(res, message);
  const target = typeof req.body.back === 'string' && /^\/admin(?:[/?]|$)/.test(req.body.back) ? req.body.back : '/admin';
  res.redirect(target);
}

router.get('/', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  const stats = {
    users: count('SELECT COUNT(*) AS n FROM users'),
    banned: count('SELECT COUNT(*) AS n FROM users WHERE is_banned = 1'),
    blogs: count('SELECT COUNT(*) AS n FROM blogs'),
    published: count("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'"),
    drafts: count("SELECT COUNT(*) AS n FROM posts WHERE status = 'draft'"),
    comments: count('SELECT COUNT(*) AS n FROM comments'),
  };
  const recentUsers = db.prepare('SELECT id, name, email, created_at FROM users ORDER BY id DESC LIMIT 5').all();
  const recentComments = db.prepare(`
    SELECT c.id, c.content_html, c.created_at, c.post_id, u.name AS user_name, p.title AS post_title
    FROM comments c JOIN users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
    ORDER BY c.id DESC LIMIT 5`).all();
  res.render('admin/index', { title: 'Admin', stats, recentUsers, recentComments, tab: 'overview' });
});

router.get('/users', (req, res) => {
  const q = str(req.query.q, 100);
  const { page, limit, offset } = pageParams(req, PAGE);
  const where = searchClause(q, ['u.name', 'u.email']);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${where.sql}`).get(...where.params).n;
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, u.is_admin, u.is_banned, u.created_at, b.slug AS blog_slug,
      (SELECT COUNT(*) FROM posts p WHERE p.blog_id = b.id) AS post_count,
      (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS comment_count
    FROM users u LEFT JOIN blogs b ON b.user_id = u.id
    WHERE ${where.sql} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...where.params, limit, offset);
  res.render('admin/users', { title: 'Admin: users', users, q, pager: pagination(page, limit, total), tab: 'users' });
});

router.get('/blogs', (req, res) => {
  const q = str(req.query.q, 100);
  const { page, limit, offset } = pageParams(req, PAGE);
  const where = searchClause(q, ['b.name', 'b.slug', 'u.name']);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM blogs b JOIN users u ON u.id = b.user_id WHERE ${where.sql}`).get(...where.params).n;
  const blogs = db.prepare(`
    SELECT b.id, b.slug, b.name, b.created_at, u.id AS user_id, u.name AS user_name, u.is_banned,
      (SELECT COUNT(*) FROM posts p WHERE p.blog_id = b.id) AS post_count
    FROM blogs b JOIN users u ON u.id = b.user_id
    WHERE ${where.sql} ORDER BY b.id DESC LIMIT ? OFFSET ?`).all(...where.params, limit, offset);
  res.render('admin/blogs', { title: 'Admin: blogs', blogs, q, pager: pagination(page, limit, total), tab: 'blogs' });
});

router.get('/posts', (req, res) => {
  const q = str(req.query.q, 100);
  const { page, limit, offset } = pageParams(req, PAGE);
  const where = searchClause(q, ['p.title', 'b.name', 'u.name']);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id WHERE ${where.sql}`).get(...where.params).n;
  const posts = db.prepare(`
    SELECT p.id, p.title, p.status, p.created_at, p.published_at, b.slug AS blog_slug, b.name AS blog_name,
      u.id AS user_id, u.name AS user_name,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id
    WHERE ${where.sql} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...where.params, limit, offset);
  res.render('admin/posts', { title: 'Admin: posts', posts, q, pager: pagination(page, limit, total), tab: 'posts' });
});

router.get('/comments', (req, res) => {
  const q = str(req.query.q, 100);
  const { page, limit, offset } = pageParams(req, PAGE);
  const where = searchClause(q, ['c.content_html', 'u.name', 'p.title']);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM comments c JOIN users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id WHERE ${where.sql}`).get(...where.params).n;
  const comments = db.prepare(`
    SELECT c.id, c.content_html, c.created_at, c.post_id, u.id AS user_id, u.name AS user_name, p.title AS post_title
    FROM comments c JOIN users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
    WHERE ${where.sql} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(...where.params, limit, offset);
  res.render('admin/comments', { title: 'Admin: comments', comments, q, pager: pagination(page, limit, total), tab: 'comments' });
});

// ---------- actions ----------

function targetUser(req, res) {
  const id = toId(req.params.id);
  const user = id && db.prepare('SELECT id, name, is_admin FROM users WHERE id = ?').get(id);
  if (!user) { back(req, res, 'That user no longer exists.'); return null; }
  if (user.id === req.user.id) { back(req, res, 'You cannot do that to your own account.'); return null; }
  return user;
}

router.post('/users/:id/ban', (req, res) => {
  const user = targetUser(req, res);
  if (!user) return;
  db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(user.id);
  auth.endAllSessionsForUser(user.id);
  back(req, res, `${user.name} is banned. They are logged out, cannot log in, and their blog, posts and comments are hidden.`);
});

router.post('/users/:id/unban', (req, res) => {
  const user = targetUser(req, res);
  if (!user) return;
  db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(user.id);
  back(req, res, `${user.name} is no longer banned.`);
});

router.post('/users/:id/delete', (req, res) => {
  const user = targetUser(req, res);
  if (!user) return;
  deleteAllImagesOfUser(user.id);
  transaction(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });
  back(req, res, `${user.name} and everything they wrote was deleted.`);
});

router.post('/blogs/:id/delete', (req, res) => {
  const id = toId(req.params.id);
  const blog = id && db.prepare('SELECT id, name FROM blogs WHERE id = ?').get(id);
  if (!blog) return back(req, res, 'That blog no longer exists.');
  for (const post of db.prepare('SELECT cover_image FROM posts WHERE blog_id = ?').all(blog.id)) deleteImage(post.cover_image);
  db.prepare('DELETE FROM blogs WHERE id = ?').run(blog.id);
  back(req, res, `The blog "${blog.name}" and all its posts were deleted.`);
});

router.post('/posts/:id/delete', (req, res) => {
  const id = toId(req.params.id);
  const post = id && db.prepare('SELECT id, title, cover_image FROM posts WHERE id = ?').get(id);
  if (!post) return back(req, res, 'That post no longer exists.');
  deleteImage(post.cover_image);
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  back(req, res, `The post "${post.title}" was deleted.`);
});

router.post('/comments/:id/delete', (req, res) => {
  const id = toId(req.params.id);
  const result = id ? db.prepare('DELETE FROM comments WHERE id = ?').run(id) : { changes: 0 };
  back(req, res, result.changes ? 'The comment was deleted.' : 'That comment no longer exists.');
});

module.exports = router;
