'use strict';
const config = require('./src/config');
const app = require('./src/app');
const { purgeExpired } = require('./src/auth');
const { db } = require('./src/db');

purgeExpired();
setInterval(purgeExpired, 60 * 60 * 1000).unref();

app.listen(config.port, config.host, () => {
  const admins = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
  console.log(`\n${config.siteName} is running.`);
  console.log(`Open ${config.baseUrl} in your web browser.`);
  if (!admins) {
    console.log('\nThere is no admin yet. Sign up on the site, then stop the server (Ctrl+C) and run:');
    console.log('  npm run make-admin -- your@email.com');
  }
  console.log('\nPress Ctrl+C to stop the server.\n');
});
