'use strict';
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { syncPostImages } = require('./post-images');

fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  is_banned     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash    TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blogs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  blog_id      INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  cover_image  TEXT,
  content_html TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_blog ON posts(blog_id);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(status, published_at);

CREATE TABLE IF NOT EXISTS comments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_html TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- Every uploaded file, so a user's files can be removed when the user is deleted.
CREATE TABLE IF NOT EXISTS uploads (
  filename   TEXT PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------- migrations for databases created by earlier versions ----------

const migrations = [
  // 1: email verification, and private pictures for drafts.
  () => {
    db.exec(`
      ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
      -- Accounts that existed before email verification was added keep working.
      UPDATE users SET email_verified = 1;

      CREATE TABLE email_verifications (
        token_hash TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE post_images (
        post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        PRIMARY KEY (post_id, filename)
      );
      CREATE INDEX idx_post_images_filename ON post_images(filename);
      CREATE INDEX idx_users_avatar ON users(avatar);
    `);
    for (const post of db.prepare('SELECT id, cover_image, content_html FROM posts').all()) {
      syncPostImages(db, post.id, post.cover_image, post.content_html);
    }
  },
];

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

let version = db.prepare('PRAGMA user_version').get().user_version;
while (version < migrations.length) {
  const next = version + 1;
  transaction(() => {
    migrations[version]();
    db.exec(`PRAGMA user_version = ${next}`);
  });
  version = next;
}

module.exports = { db, transaction };
