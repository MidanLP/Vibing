'use strict';
// Remembers which uploaded pictures each post uses (its cover image and the
// pictures in its text), so that pictures of drafts can be kept private.

const UPLOAD_URL_RE = /\/uploads\/([a-f0-9]{32}\.(?:jpg|png|gif|webp))\b/g;

function filenamesIn(...texts) {
  const names = new Set();
  for (const text of texts) {
    for (const match of String(text || '').matchAll(UPLOAD_URL_RE)) names.add(match[1]);
  }
  return [...names];
}

// Only pictures uploaded by the post's own author are recorded. Otherwise
// someone could make another person's private picture public by putting
// its address into a post of their own.
function syncPostImages(db, postId, coverImage, contentHtml) {
  db.prepare('DELETE FROM post_images WHERE post_id = ?').run(postId);
  const insert = db.prepare(`
    INSERT INTO post_images (post_id, filename)
    SELECT p.id, up.filename
    FROM posts p JOIN blogs b ON b.id = p.blog_id JOIN uploads up ON up.user_id = b.user_id
    WHERE p.id = ? AND up.filename = ?`);
  for (const name of filenamesIn(coverImage, contentHtml)) insert.run(postId, name);
}

module.exports = { filenamesIn, syncPostImages };
