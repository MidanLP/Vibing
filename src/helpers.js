'use strict';
const { htmlToText } = require('./sanitize');

const PAGE_SIZE = 10;

function pageParams(req, pageSize = PAGE_SIZE) {
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  return { page, limit: pageSize, offset: (page - 1) * pageSize };
}

function pagination(page, limit, total) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { page, pages, hasPrev: page > 1, hasNext: page < pages };
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function excerpt(text, length = 220) {
  if (!text) return '';
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), length - 30)) + '…';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function readingTime(text) {
  const words = (text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Escapes LIKE wildcards so that search text is matched literally. */
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

/** Only allow redirects to paths on this site. */
function safeNext(value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';
}

function toId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = {
  PAGE_SIZE, pageParams, pagination, str, isEmail, excerpt, formatDate,
  readingTime, nowSql, stripTags: htmlToText, likePattern, safeNext, toId,
};
