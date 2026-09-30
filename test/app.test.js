'use strict';
// End-to-end tests: starts the app on a random port with a throw-away
// database and drives it over HTTP like a browser would.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-test-'));
process.env.DATA_DIR = dataDir;
process.env.SMTP_HOST = '';

const app = require('../src/app');
const { db } = require('../src/db');
const { recentlyPrinted } = require('../src/mail');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// A tiny browser: keeps cookies and knows the CSRF token.
class Browser {
  constructor() { this.cookies = new Map(); }

  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }

  async request(method, url, { form, multipart, headers = {} } = {}) {
    const init = { method, redirect: 'manual', headers: { cookie: this.cookieHeader(), ...headers } };
    if (form) {
      init.body = new URLSearchParams(form);
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (multipart) {
      init.body = multipart;
    }
    const res = await fetch(base + url, init);
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const [name, value] = pair.split('=');
      const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a) || /max-age=0\b/i.test(a));
      if (expired || value === '') this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
    res.text_ = await res.text();
    return res;
  }

  get(url) { return this.request('GET', url); }

  async csrf() {
    if (!this.cookies.get('csrf')) await this.get('/');
    return this.cookies.get('csrf');
  }

  async post(url, form = {}) {
    return this.request('POST', url, { form: { _csrf: await this.csrf(), ...form } });
  }

  async postMultipart(url, fields = {}, file) {
    const fd = new FormData();
    fd.append('_csrf', await this.csrf());
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    if (file) fd.append(file.field, new Blob([file.data], { type: file.type || 'application/octet-stream' }), file.name);
    return this.request('POST', url, { multipart: fd });
  }
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function signup(name, email, password = 'password123') {
  const b = new Browser();
  const res = await b.post('/signup', { name, email, password, password2: password });
  assert.equal(res.status, 302, `signup of ${email} failed: ${res.text_.slice(0, 300)}`);
  return b;
}

let alice; let bob; let admin; let alicePostId; let draftId;

test('sign up, log out and log in', async () => {
  alice = await signup('Alice', 'alice@example.com');
  const me = await alice.get('/settings');
  assert.match(me.text_, /alice@example\.com/);

  const dup = await new Browser().post('/signup', { name: 'X', email: 'ALICE@example.com', password: 'password123', password2: 'password123' });
  assert.equal(dup.status, 400);
  assert.match(dup.text_, /already exists/);

  await alice.post('/logout');
  assert.equal((await alice.get('/settings')).status, 302);

  const wrong = await alice.post('/login', { email: 'alice@example.com', password: 'nope-nope' });
  assert.equal(wrong.status, 400);
  const ok = await alice.post('/login', { email: 'Alice@Example.com', password: 'password123' });
  assert.equal(ok.status, 302);
  assert.equal((await alice.get('/settings')).status, 200);
});

test('forms without the CSRF token are rejected', async () => {
  const res = await alice.request('POST', '/my-blog', { form: { name: 'Hacked' } });
  assert.equal(res.status, 403);
  const multipart = new FormData();
  multipart.append('name', 'Hacked');
  const res2 = await alice.request('POST', '/settings', { multipart });
  assert.equal(res2.status, 403);
});

test('profile with bio and picture upload; non-images are refused', async () => {
  const bad = await alice.postMultipart('/settings', { name: 'Alice A.', bio: 'Hi' }, { field: 'avatar', name: 'x.png', data: Buffer.from('<svg onload=alert(1)>') });
  assert.equal(bad.status, 400);
  assert.match(bad.text_, /Only JPEG, PNG, GIF and WebP/);

  const res = await alice.postMultipart('/settings', { name: 'Alice A.', bio: 'I write about <b>food</b>' }, { field: 'avatar', name: 'me.png', data: PNG, type: 'image/png' });
  assert.equal(res.status, 302);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('alice@example.com');
  assert.equal(user.name, 'Alice A.');
  assert.match(user.avatar, /^\/uploads\/[a-f0-9]{32}\.png$/);
  const img = await fetch(base + user.avatar);
  assert.equal(img.status, 200);
  const profile = await alice.get(`/u/${user.id}`);
  assert.match(profile.text_, /I write about &lt;b&gt;food&lt;\/b&gt;/);
});

test('create a blog', async () => {
  const taken = await alice.post('/my-blog', { name: 'Admin', slug: 'admin' });
  assert.equal(taken.status, 400);
  const res = await alice.post('/my-blog', { name: "Alice's Kitchen", description: 'Recipes', slug: '' });
  assert.equal(res.status, 302);
  const blog = db.prepare('SELECT * FROM blogs').get();
  assert.equal(blog.slug, 'alice-s-kitchen');
  assert.equal((await new Browser().get('/b/alice-s-kitchen')).status, 200);
});

test('drafts are only visible to their author', async () => {
  const res = await alice.postMultipart('/posts', {
    title: 'Secret draft', content: '<p>Not yet <strong>ready</strong></p>', action: 'save',
  });
  assert.equal(res.status, 302);
  draftId = Number(res.headers.get('location').match(/\/posts\/(\d+)/)[1]);

  assert.equal((await alice.get(`/posts/${draftId}`)).status, 200);
  assert.equal((await new Browser().get(`/posts/${draftId}`)).status, 404);
  bob = await signup('Bob', 'bob@example.com');
  assert.equal((await bob.get(`/posts/${draftId}`)).status, 404);
  assert.equal((await bob.get(`/posts/${draftId}/edit`)).status, 404);
  const search = await new Browser().get('/search?q=Secret');
  assert.doesNotMatch(search.text_, /Secret draft/);
  assert.doesNotMatch((await new Browser().get('/')).text_, /Secret draft/);
  assert.doesNotMatch((await new Browser().get('/b/alice-s-kitchen')).text_, /Secret draft/);
});

test('publish a post with cover image and formatted text; dangerous HTML is removed', async () => {
  const content = '<h2>Heading</h2><p>Some <strong>bold</strong> and <a href="https://example.com">a link</a>'
    + '<img src="/uploads/x.png" onerror="alert(1)"></p><script>alert(1)</script>'
    + '<p><a href="javascript:alert(1)">bad</a></p><iframe src="https://evil"></iframe>';
  const res = await alice.postMultipart('/posts', { title: 'Tomato soup', content, action: 'publish' },
    { field: 'cover', name: 'c.png', data: PNG, type: 'image/png' });
  assert.equal(res.status, 302);
  alicePostId = Number(res.headers.get('location').match(/\/posts\/(\d+)/)[1]);

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(alicePostId);
  assert.equal(post.status, 'published');
  assert.match(post.cover_image, /^\/uploads\/.+\.png$/);
  assert.match(post.content_html, /<h2>Heading<\/h2>/);
  assert.match(post.content_html, /<strong>bold<\/strong>/);
  assert.match(post.content_html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer nofollow ugc">/);
  assert.match(post.content_html, /<img src="\/uploads\/x.png" \/>/);
  assert.doesNotMatch(post.content_html, /script|onerror|javascript:|iframe/);

  const page = await new Browser().get(`/posts/${alicePostId}`);
  assert.equal(page.status, 200);
  assert.match(page.text_, /Tomato soup/);
  assert.match(page.text_, /to leave a comment/);
});

test('publishing an empty post is refused', async () => {
  const res = await alice.postMultipart('/posts', { title: 'Empty', content: '<p><br></p>', action: 'publish' });
  assert.equal(res.status, 400);
  assert.match(res.text_, /Your post is empty/);
});

test('search finds published posts by title and text', async () => {
  const anon = new Browser();
  assert.match((await anon.get('/search?q=tomato')).text_, /Tomato soup/);
  assert.match((await anon.get('/search?q=bold')).text_, /Tomato soup/);
  assert.doesNotMatch((await anon.get('/search?q=%25')).text_, /Tomato soup/);
  assert.doesNotMatch((await anon.get('/search?q=zucchini')).text_, /Tomato soup/);
});

test('inline image upload for the editor', async () => {
  const fd = new FormData();
  fd.append('image', new Blob([PNG], { type: 'image/png' }), 'i.png');
  const res = await alice.request('POST', '/uploads/image', { multipart: fd, headers: { 'x-csrf-token': await alice.csrf() } });
  assert.equal(res.status, 200);
  assert.match(JSON.parse(res.text_).url, /^\/uploads\/[a-f0-9]{32}\.png$/);

  const noToken = await alice.request('POST', '/uploads/image', { multipart: fd });
  assert.equal(noToken.status, 403);
  const anon = await new Browser().request('POST', '/uploads/image', { multipart: fd });
  assert.equal(anon.status, 302);
});

test('only the author can edit or delete a post; drafts can be published later', async () => {
  const hijack = await bob.postMultipart(`/posts/${alicePostId}`, { title: 'Hacked', content: '<p>x</p>', action: 'save' });
  assert.equal(hijack.status, 404);
  assert.equal((await bob.post(`/posts/${alicePostId}/delete`)).status, 404);

  const pub = await alice.postMultipart(`/posts/${draftId}`, { title: 'Now ready', content: '<p>Done</p>', action: 'publish' });
  assert.equal(pub.status, 302);
  assert.equal((await new Browser().get(`/posts/${draftId}`)).status, 200);

  const unpub = await alice.postMultipart(`/posts/${draftId}`, { title: 'Now ready', content: '<p>Done</p>', action: 'unpublish' });
  assert.equal(unpub.status, 302);
  assert.equal((await new Browser().get(`/posts/${draftId}`)).status, 404);
});

let bobCommentId;

test('logged-in users can comment with simple formatting', async () => {
  const anon = await new Browser().post(`/posts/${alicePostId}/comments`, { content: '<p>hi</p>' });
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location'), /^\/login/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 0);

  const res = await bob.post(`/posts/${alicePostId}/comments`, {
    content: '<p>Great <strong>soup</strong> <a href="https://x.test">link</a></p><h1>big</h1><img src=x onerror=alert(1)>',
  });
  assert.equal(res.status, 302);
  const c = db.prepare('SELECT * FROM comments').get();
  bobCommentId = c.id;
  assert.match(c.content_html, /<strong>soup<\/strong>/);
  assert.match(c.content_html, /<a href="https:\/\/x.test"/);
  assert.doesNotMatch(c.content_html, /<h1>|<img|onerror/);

  assert.equal((await bob.post(`/posts/${draftId}/comments`, { content: '<p>on a draft</p>' })).status, 404);
  assert.equal((await bob.post(`/posts/${alicePostId}/comments`, { content: '<p> </p>' })).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 1);
});

test('comment editing and deleting permissions', async () => {
  const carol = await signup('Carol', 'carol@example.com');
  assert.equal((await carol.post(`/comments/${bobCommentId}`, { content: '<p>edited by carol</p>' })).status, 404);
  assert.equal((await carol.post(`/comments/${bobCommentId}/delete`)).status, 404);
  // The blog owner cannot edit other people's comments...
  assert.equal((await alice.post(`/comments/${bobCommentId}`, { content: '<p>edited by alice</p>' })).status, 404);

  assert.equal((await bob.post(`/comments/${bobCommentId}`, { content: '<p>edited by bob</p>' })).status, 302);
  assert.match(db.prepare('SELECT content_html FROM comments WHERE id = ?').get(bobCommentId).content_html, /edited by bob/);

  // ...but can delete comments under their own posts.
  assert.equal((await alice.post(`/comments/${bobCommentId}/delete`)).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 0);

  await bob.post(`/posts/${alicePostId}/comments`, { content: '<p>again</p>' });
  const id = db.prepare('SELECT id FROM comments').get().id;
  assert.equal((await bob.post(`/comments/${id}/delete`)).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 0);
});

test('password reset by email link', async () => {
  const anon = new Browser();
  const unknown = await anon.post('/forgot-password', { email: 'nobody@example.com' });
  assert.equal(unknown.status, 200);
  assert.equal(recentlyPrinted.length, 0);

  const res = await anon.post('/forgot-password', { email: 'bob@example.com' });
  assert.match(res.text_, /If an account with that email exists/);
  const mail = recentlyPrinted.pop();
  assert.equal(mail.to, 'bob@example.com');
  const link = mail.text.match(/https?:\/\/\S+\/reset-password\/(\S+)/);
  assert.ok(link);
  const url = `/reset-password/${link[1]}`;

  assert.match((await anon.get(url)).text_, /New password/);
  const mismatch = await anon.post(url, { password: 'newpassword1', password2: 'different1' });
  assert.equal(mismatch.status, 400);
  assert.equal((await anon.post(url, { password: 'newpassword1', password2: 'newpassword1' })).status, 302);

  // The old session was logged out, the link cannot be reused, the new password works.
  assert.equal((await bob.get('/settings')).status, 302);
  assert.match((await anon.get(url)).text_, /invalid or has expired/);
  assert.equal((await new Browser().post('/login', { email: 'bob@example.com', password: 'password123' })).status, 400);
  bob = new Browser();
  assert.equal((await bob.post('/login', { email: 'bob@example.com', password: 'newpassword1' })).status, 302);
});

test('admin page: only for admins; ban, unban and delete', async () => {
  assert.equal((await alice.get('/admin')).status, 404);
  admin = await signup('Owner', 'owner@example.com');
  db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run('owner@example.com');

  for (const tab of ['', '/users', '/blogs', '/posts', '/comments']) {
    const res = await admin.get(`/admin${tab}`);
    assert.equal(res.status, 200, tab);
  }
  assert.match((await admin.get('/admin/users?q=alice')).text_, /alice@example\.com/);

  await bob.post(`/posts/${alicePostId}/comments`, { content: '<p>by bob</p>' });
  const aliceId = db.prepare('SELECT id FROM users WHERE email = ?').get('alice@example.com').id;
  const bobId = db.prepare('SELECT id FROM users WHERE email = ?').get('bob@example.com').id;

  // Ban Alice: she is logged out, cannot log in, and her blog and posts disappear.
  assert.equal((await admin.post(`/admin/users/${aliceId}/ban`)).status, 302);
  assert.equal((await alice.get('/settings')).status, 302);
  const login = await new Browser().post('/login', { email: 'alice@example.com', password: 'password123' });
  assert.match(login.text_, /banned/);
  assert.equal((await new Browser().get(`/posts/${alicePostId}`)).status, 404);
  assert.equal((await new Browser().get('/b/alice-s-kitchen')).status, 404);

  assert.equal((await admin.post(`/admin/users/${aliceId}/unban`)).status, 302);
  assert.equal((await new Browser().get(`/posts/${alicePostId}`)).status, 200);

  // Admin can delete any comment and any post.
  const commentId = db.prepare('SELECT id FROM comments').get().id;
  assert.equal((await admin.post(`/admin/comments/${commentId}/delete`)).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 0);
  assert.equal((await admin.post(`/admin/posts/${draftId}/delete`)).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE id = ?').get(draftId).n, 0);

  // Admin cannot ban themself.
  const adminId = db.prepare('SELECT id FROM users WHERE email = ?').get('owner@example.com').id;
  await admin.post(`/admin/users/${adminId}/ban`);
  assert.equal(db.prepare('SELECT is_banned FROM users WHERE id = ?').get(adminId).is_banned, 0);

  // Deleting a user removes their blog, posts, comments and uploaded files.
  const files = db.prepare('SELECT filename FROM uploads WHERE user_id = ?').all(aliceId);
  assert.ok(files.length > 0);
  assert.equal((await admin.post(`/admin/users/${aliceId}/delete`)).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blogs').get().n, 0);
  await new Promise((r) => setTimeout(r, 50));
  for (const f of files) assert.equal(fs.existsSync(path.join(dataDir, 'uploads', f.filename)), false);

  // Admin can delete a blog.
  await bob.post('/my-blog', { name: 'Bob blog' });
  const blogId = db.prepare('SELECT id FROM blogs WHERE user_id = ?').get(bobId).id;
  assert.equal((await admin.post(`/admin/blogs/${blogId}/delete`)).status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blogs').get().n, 0);
});

test('login redirect only goes to pages on this site', async () => {
  const b = new Browser();
  const res = await b.post('/login', { email: 'owner@example.com', password: 'password123', next: '//evil.example' });
  assert.equal(res.headers.get('location'), '/');
});
