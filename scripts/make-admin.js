'use strict';
// Usage: npm run make-admin -- someone@example.com
// Gives an existing account access to the admin page (/admin).
const { db } = require('../src/db');

const email = (process.argv[2] || '').trim();
if (!email) {
  console.log('Usage: npm run make-admin -- your@email.com');
  process.exit(1);
}

const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
if (!user) {
  console.log(`No account with the email "${email}" was found. Sign up on the site first, then run this again.`);
  process.exit(1);
}

db.prepare('UPDATE users SET is_admin = 1, is_banned = 0 WHERE id = ?').run(user.id);
console.log(`Done! ${user.name} (${email}) is now an admin. Log in and open /admin (the "Admin" link in the menu).`);
