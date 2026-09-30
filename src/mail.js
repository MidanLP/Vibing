'use strict';
const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

/**
 * Sends an email. Without a mail server configured (the normal case when
 * trying the site on your own computer) the email is printed in the
 * terminal window instead, so you can still click the link.
 */
const recentlyPrinted = []; // used by the tests

async function sendMail({ to, subject, text }) {
  if (!transport) {
    recentlyPrinted.push({ to, subject, text });
    if (recentlyPrinted.length > 20) recentlyPrinted.shift();
    console.log('\n' + '='.repeat(70));
    console.log('EMAIL (not sent, no mail server is set up - see README)');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}\n`);
    console.log(text);
    console.log('='.repeat(70) + '\n');
    return;
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
}

module.exports = { sendMail, recentlyPrinted };
