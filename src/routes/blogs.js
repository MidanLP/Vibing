'use strict';
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const { str, pageParams, pagination } = require('../helpers');

const router = express.Router();

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set(['admin', 'new', 'edit', 'api', 'static', 'uploads', 'vendor']);

function slugify(text) {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

function validateBlog(body, currentBlogId) {
  const values = {
    name: str(body.name, 100),
    description: str(body.description, 500),
    slug: str(body.slug, 40).toLowerCase(),
  };
  if (!values.slug) values.slug = slugify(values.name);
  let error = null;
  if (!values.name) error = 'Please give your blog a name.';
  else if (!SLUG_RE.test(values.slug) || RESERVED.has(values.slug)) {
    error = 'The web address may only use lowercase letters, numbers and dashes (for example "my-travel-blog").';
  } else {
    const taken = db.prepare('SELECT id FROM blogs WHERE slug = ?').get(values.slug);
    if (taken && taken.id !== currentBlogId) error = 'That web address is already taken. Please choose another one.';
  }
  return { values, error };
}

// All blogs
router.get('/blogs', (req, res) => {
  const { page, limit, offset } = pageParams(req, 20);
  const where = 'u.is_banned = 0';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM blogs b JOIN users u ON u.id = b.user_id WHERE ${where}`).get().n;
  const blogs = db.prepare(`
    SELECT b.slug, b.name, b.description, u.id AS user_id, u.name AS author_name, u.avatar AS author_avatar,
      (SELECT COUNT(*) FROM posts p WHERE p.blog_id = b.id AND p.status = 'published') AS post_count
    FROM blogs b JOIN users u ON u.id = b.user_id
    WHERE ${where}
    ORDER BY post_count DESC, b.created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.render('blogs/index', { title: 'Blogs', blogs, pager: pagination(page, limit, total) });
});

// Create your blog / go to your dashboard
router.get('/my-blog', auth.requireLogin, (req, res) => {
  if (req.user.blog) return res.redirect('/dashboard');
  res.render('blogs/form', { title: 'Create your blog', values: {}, error: null, isNew: true });
});

router.post('/my-blog', auth.requireLogin, (req, res) => {
  if (req.user.blog) return res.redirect('/dashboard');
  const { values, error } = validateBlog(req.body, null);
  if (error) return res.status(400).render('blogs/form', { title: 'Create your blog', values, error, isNew: true });
  db.prepare('INSERT INTO blogs (user_id, slug, name, description) VALUES (?, ?, ?, ?)')
    .run(req.user.id, values.slug, values.name, values.description);
  auth.setFlash(res, 'Your blog is ready. Time to write your first post!');
  res.redirect('/dashboard');
});

router.get('/my-blog/edit', auth.requireLogin, (req, res) => {
  if (!req.user.blog) return res.redirect('/my-blog');
  const blog = db.prepare('SELECT * FROM blogs WHERE id = ?').get(req.user.blog.id);
  res.render('blogs/form', { title: 'Blog settings', values: blog, error: null, isNew: false });
});

router.post('/my-blog/edit', auth.requireLogin, (req, res) => {
  if (!req.user.blog) return res.redirect('/my-blog');
  const { values, error } = validateBlog(req.body, req.user.blog.id);
  if (error) return res.status(400).render('blogs/form', { title: 'Blog settings', values, error, isNew: false });
  db.prepare('UPDATE blogs SET slug = ?, name = ?, description = ? WHERE id = ?')
    .run(values.slug, values.name, values.description, req.user.blog.id);
  auth.setFlash(res, 'Blog settings saved.');
  res.redirect('/dashboard');
});

// Your posts (drafts and published)
router.get('/dashboard', auth.requireLogin, (req, res) => {
  if (!req.user.blog) return res.redirect('/my-blog');
  const blog = db.prepare('SELECT * FROM blogs WHERE id = ?').get(req.user.blog.id);
  const posts = db.prepare(`
    SELECT p.id, p.title, p.status, p.updated_at, p.published_at,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p WHERE p.blog_id = ? ORDER BY p.updated_at DESC`).all(blog.id);
  res.render('blogs/dashboard', { title: 'Your blog', blog, posts });
});

// Public blog page
router.get('/b/:slug', (req, res, next) => {
  const blog = db.prepare(`
    SELECT b.*, u.name AS author_name, u.avatar AS author_avatar, u.bio AS author_bio
    FROM blogs b JOIN users u ON u.id = b.user_id
    WHERE b.slug = ? AND u.is_banned = 0`).get(String(req.params.slug));
  if (!blog) return next();
  const { page, limit, offset } = pageParams(req);
  const total = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE blog_id = ? AND status = 'published'").get(blog.id).n;
  const posts = db.prepare(`
    SELECT id, title, cover_image, content_text, published_at FROM posts
    WHERE blog_id = ? AND status = 'published'
    ORDER BY published_at DESC LIMIT ? OFFSET ?`).all(blog.id, limit, offset);
  res.render('blogs/show', { title: blog.name, blog, posts, pager: pagination(page, limit, total) });
});

module.exports = router;
