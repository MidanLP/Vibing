'use strict';
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const auth = require('./auth');
const helpers = require('./helpers');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(config.rootDir, 'views'));
if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      'upgrade-insecure-requests': config.secureCookies ? [] : null,
    },
  },
  strictTransportSecurity: config.secureCookies,
  crossOriginEmbedderPolicy: false,
}));

app.use('/static', express.static(path.join(config.rootDir, 'public'), { maxAge: '1h' }));
app.use('/vendor/quill', express.static(path.join(config.rootDir, 'node_modules/quill/dist'), { maxAge: '1d' }));
app.use('/uploads', express.static(config.uploadsDir, {
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'"),
}));

app.use((req, res, next) => {
  res.locals.siteName = config.siteName;
  res.locals.h = helpers;
  res.locals.path = req.path;
  res.locals.query = req.query;
  // Safe defaults, so that error pages can be shown at any point.
  res.locals.currentUser = null;
  res.locals.flash = null;
  res.locals.csrfToken = '';
  next();
});

app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '3mb' }));
app.use(express.json({ limit: '100kb' }));

app.use(auth.csrfToken);
app.use(auth.flash);
app.use(auth.loadUser);
app.use(auth.csrfProtect);

app.use(require('./routes/auth'));
app.use(require('./routes/profile'));
app.use(require('./routes/blogs'));
app.use(require('./routes/posts'));
app.use(require('./routes/comments'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'This page does not exist.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).render('error', { title: 'Too large', message: 'That was too much text to save at once.' });
  }
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error happened. Please try again.' });
});

module.exports = app;
