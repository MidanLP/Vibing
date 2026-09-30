'use strict';
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const { singleImage, saveImage, deleteImage } = require('../uploads');
const { sanitizePostHtml, htmlToText, hasContent } = require('../sanitize');
const { str, toId, pageParams, pagination, likePattern, nowSql } = require('../helpers');

const router = express.Router();

// Columns for post lists, joined with the blog and its author.
const LIST_SELECT = `
  SELECT p.id, p.title, p.cover_image, p.content_text, p.published_at,
    b.slug AS blog_slug, b.name AS blog_name, u.id AS author_id, u.name AS author_name, u.avatar AS author_avatar
  FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id`;
const PUBLIC_WHERE = "p.status = 'published' AND u.is_banned = 0";

router.get('/', (req, res) => {
  const { page, limit, offset } = pageParams(req);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id WHERE ${PUBLIC_WHERE}`).get().n;
  const posts = db.prepare(`${LIST_SELECT} WHERE ${PUBLIC_WHERE} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.render('home', { title: null, posts, pager: pagination(page, limit, total) });
});

router.get('/search', (req, res) => {
  const q = str(req.query.q, 100);
  let posts = [];
  let pager = null;
  if (q) {
    const { page, limit, offset } = pageParams(req);
    const pattern = likePattern(q);
    const where = `${PUBLIC_WHERE} AND (p.title LIKE ? ESCAPE '\\' OR p.content_text LIKE ? ESCAPE '\\')`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id WHERE ${where}`).get(pattern, pattern).n;
    // Title matches first, then newest first.
    posts = db.prepare(`${LIST_SELECT} WHERE ${where}
      ORDER BY (p.title LIKE ? ESCAPE '\\') DESC, p.published_at DESC LIMIT ? OFFSET ?`)
      .all(pattern, pattern, pattern, limit, offset);
    pager = pagination(page, limit, total);
  }
  res.render('search', { title: q ? `Search: ${q}` : 'Search', q, posts, pager });
});

// ---------- reading a post ----------

function loadPost(id) {
  return db.prepare(`
    SELECT p.*, b.slug AS blog_slug, b.name AS blog_name, b.user_id AS author_id,
      u.name AS author_name, u.avatar AS author_avatar, u.bio AS author_bio, u.is_banned AS author_banned
    FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN users u ON u.id = b.user_id
    WHERE p.id = ?`).get(id);
}

function canView(post, user) {
  if (!post) return false;
  if (user && user.id === post.author_id) return true;
  return post.status === 'published' && !post.author_banned;
}

router.get('/posts/:id', (req, res, next) => {
  const id = toId(req.params.id);
  const post = id && loadPost(id);
  if (!canView(post, req.user)) return next();
  const comments = db.prepare(`
    SELECT c.id, c.content_html, c.created_at, c.updated_at, u.id AS user_id, u.name AS user_name, u.avatar AS user_avatar
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? AND u.is_banned = 0 ORDER BY c.created_at ASC, c.id ASC`).all(post.id);
  res.render('posts/show', { title: post.title, post, comments, commentError: null, commentDraft: '' });
});

// ---------- writing ----------

function requireBlog(req, res, next) {
  if (req.user.blog) return next();
  auth.setFlash(res, 'Create your blog first, then you can write posts.');
  res.redirect('/my-blog');
}

function ownPost(req, res, next) {
  const id = toId(req.params.id);
  const post = id && loadPost(id);
  if (!post || post.author_id !== req.user.id) {
    return res.status(404).render('error', { title: 'Not found', message: 'This post does not exist or is not yours.' });
  }
  req.post = post;
  next();
}

function readPostForm(req) {
  const html = sanitizePostHtml(typeof req.body.content === 'string' ? req.body.content : '');
  return {
    title: str(req.body.title, 200),
    content_html: html,
    content_text: htmlToText(html),
    publish: req.body.action === 'publish',
    unpublish: req.body.action === 'unpublish',
    remove_cover: req.body.remove_cover === '1',
  };
}

function postFormError(req, values) {
  if (req.uploadError) return req.uploadError;
  if (!values.title) return 'Please give your post a title.';
  if (values.publish && !hasContent(values.content_html)) return 'Your post is empty. Write something before publishing.';
  return null;
}

router.get('/posts/new', auth.requireLogin, requireBlog, (req, res) => {
  res.render('posts/form', { title: 'New post', post: { status: 'draft' }, error: null, isNew: true });
});

router.post('/posts', auth.requireLogin, requireBlog, singleImage('cover'), auth.verifyCsrf, (req, res) => {
  const values = readPostForm(req);
  const error = postFormError(req, values);
  if (error) {
    return res.status(400).render('posts/form', { title: 'New post', post: { ...values, status: 'draft' }, error, isNew: true });
  }
  const cover = req.file ? saveImage(req.file, req.user.id) : null;
  const now = nowSql();
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO posts (blog_id, title, cover_image, content_html, content_text, status, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    req.user.blog.id, values.title, cover, values.content_html, values.content_text,
    values.publish ? 'published' : 'draft', now, now, values.publish ? now : null,
  );
  auth.setFlash(res, values.publish ? 'Your post is published!' : 'Draft saved. Only you can see it.');
  res.redirect(values.publish ? `/posts/${lastInsertRowid}` : `/posts/${lastInsertRowid}/edit`);
});

router.get('/posts/:id/edit', auth.requireLogin, ownPost, (req, res) => {
  res.render('posts/form', { title: 'Edit post', post: req.post, error: null, isNew: false });
});

router.post('/posts/:id', auth.requireLogin, ownPost, singleImage('cover'), auth.verifyCsrf, (req, res) => {
  const post = req.post;
  const values = readPostForm(req);
  const error = postFormError(req, values);
  if (error) {
    return res.status(400).render('posts/form', { title: 'Edit post', post: { ...post, ...values }, error, isNew: false });
  }
  let cover = post.cover_image;
  if (req.file) {
    cover = saveImage(req.file, req.user.id);
    deleteImage(post.cover_image);
  } else if (values.remove_cover) {
    deleteImage(post.cover_image);
    cover = null;
  }
  let status = post.status;
  let publishedAt = post.published_at;
  if (values.publish && status === 'draft') {
    status = 'published';
    publishedAt = nowSql();
  } else if (values.unpublish) {
    status = 'draft';
  }
  db.prepare(`
    UPDATE posts SET title = ?, cover_image = ?, content_html = ?, content_text = ?, status = ?, published_at = ?, updated_at = ?
    WHERE id = ?`).run(values.title, cover, values.content_html, values.content_text, status, publishedAt, nowSql(), post.id);

  let message = 'Changes saved.';
  if (status === 'published' && post.status === 'draft') message = 'Your post is published!';
  if (status === 'draft' && post.status === 'published') message = 'The post is now a draft again. Only you can see it.';
  auth.setFlash(res, message);
  res.redirect(status === 'published' ? `/posts/${post.id}` : `/posts/${post.id}/edit`);
});

router.post('/posts/:id/delete', auth.requireLogin, ownPost, (req, res) => {
  deleteImage(req.post.cover_image);
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.post.id);
  auth.setFlash(res, 'The post was deleted.');
  res.redirect('/dashboard');
});

// Pictures inserted into the text of a post by the editor.
router.post('/uploads/image', auth.requireLogin, singleImage('image'), auth.verifyCsrf, (req, res) => {
  if (req.uploadError) return res.status(400).json({ error: req.uploadError });
  if (!req.file) return res.status(400).json({ error: 'No picture was chosen.' });
  res.json({ url: saveImage(req.file, req.user.id) });
});

module.exports = router;
