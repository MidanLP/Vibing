'use strict';
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

// Settings can be put in a file called .env next to package.json
// (see .env.example). Values already set in the environment win.
const envFile = path.join(rootDir, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data');
const port = Number(process.env.PORT) || 3000;
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

module.exports = {
  rootDir,
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  dbFile: path.join(dataDir, 'blog.db'),
  port,
  // Set HOST=127.0.0.1 on a server, so that only the web server in front
  // (Caddy) can reach the app directly.
  host: process.env.HOST || undefined,
  baseUrl,
  siteName: process.env.SITE_NAME || 'Inkwell',
  secureCookies: baseUrl.startsWith('https://'),
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost',
  },
  maxUploadBytes: 5 * 1024 * 1024,
  sessionDays: 30,
};
