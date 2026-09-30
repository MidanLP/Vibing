'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('./config');
const { db } = require('./db');

// Files are kept in memory until their contents have been checked, then
// written to disk under a random name. Only real images are accepted.
const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20, fieldSize: 2 * 1024 * 1024 },
});

function detectImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 6 && (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

class UploadError extends Error {}

/**
 * Express middleware that parses a multipart form with at most one file in
 * `fieldName`. Upload problems are reported in `req.uploadError` so the route
 * can show the form again with a helpful message.
 */
function singleImage(fieldName) {
  const parse = multerInstance.single(fieldName);
  return (req, res, next) => {
    parse(req, res, (err) => {
      req.body ??= {};
      if (err) {
        req.uploadError = err.code === 'LIMIT_FILE_SIZE'
          ? `The picture is too large. The maximum size is ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`
          : 'The upload failed. Please try again.';
        req.file = undefined;
      } else if (req.file && req.file.size > 0 && !detectImageType(req.file.buffer)) {
        req.uploadError = 'Only JPEG, PNG, GIF and WebP pictures can be uploaded.';
        req.file = undefined;
      } else if (req.file && req.file.size === 0) {
        req.file = undefined;
      }
      next();
    });
  };
}

/** Writes an already validated upload to disk; returns its public URL. */
function saveImage(file, userId) {
  const ext = detectImageType(file.buffer);
  if (!ext) throw new UploadError('Not an image');
  const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(config.uploadsDir, filename), file.buffer);
  db.prepare('INSERT INTO uploads (filename, user_id) VALUES (?, ?)').run(filename, userId);
  return `/uploads/${filename}`;
}

/** Deletes a file previously returned by saveImage. Ignores anything else. */
function deleteImage(url) {
  if (!url) return;
  const match = /^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|gif|webp))$/.exec(url);
  if (!match) return;
  fs.rm(path.join(config.uploadsDir, match[1]), { force: true }, () => {});
  db.prepare('DELETE FROM uploads WHERE filename = ?').run(match[1]);
}

/** Removes every file uploaded by a user (used when an admin deletes them). */
function deleteAllImagesOfUser(userId) {
  const rows = db.prepare('SELECT filename FROM uploads WHERE user_id = ?').all(userId);
  for (const row of rows) deleteImage(`/uploads/${row.filename}`);
}

module.exports = { singleImage, saveImage, deleteImage, deleteAllImagesOfUser, detectImageType };
