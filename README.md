# Inkwell: a small blogging platform

Anyone can sign up, start a blog, write posts and comment on other people's posts.
You, the owner, get an admin page where you can see everything, remove things and ban users.

## Features

- **Accounts:** sign up with email and password, log in, log out, and reset a forgotten password by email.
- **Profiles:** each user has a name, a short bio and a profile picture they upload.
- **Blogs:** each user can create one blog, with a name, a description and its own web address (`/b/your-blog`).
- **Posts:** a title, an optional cover image, and formatted text: headings, bold, italic, links, quotes, lists, code and pictures.
  Posts start as **drafts**, which only the author can see. Publish them when they are ready. You can also turn a published post back into a draft.
- **Reading and search:** everyone can read published posts and search them by title or text.
- **Comments:** logged-in users can comment, with bold, italic and links.
- **Editing and deleting:** users can edit and delete their own posts and comments. Blog owners can also delete comments under their own posts.
- **Admin page** (`/admin`): see all users, blogs, posts and comments, search them, delete anything, and ban or unban users.
  A banned user is logged out and can't log in again. Their blog, posts and comments are hidden until you unban them.

---

## How to start it on your computer

You only need to do steps 1 and 2 once.

### 1. Install Node.js

Go to <https://nodejs.org>, download the **LTS** version for your computer (Windows or Mac), and install it with the default options.
You need version 22.13 or newer. Any current LTS download is fine.

### 2. Download the site and install its parts

1. Download this project. On GitHub, click the green **Code** button, then **Download ZIP**, and unzip it somewhere, for example into your Documents folder.
2. Open a terminal **in that folder**:
   - **Windows:** open the unzipped folder in File Explorer, click in the address bar, type `cmd` and press Enter.
   - **Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag the unzipped folder onto the Terminal window, and press Enter.
3. Type this and press Enter:

   ```
   npm install
   ```

   It takes a minute. Warnings are normal. It is done when you can type again.

   > **Windows: error "running scripts is disabled on this system"?** You are in PowerShell, which blocks
   > `npm` by default. Either type `npm.cmd` instead of `npm` (for example `npm.cmd install`, `npm.cmd start`),
   > or run this once and answer `Y`: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Then close the
   > window, open a new one, and use `npm` normally.

### 3. Start the site

In the same terminal window, type:

```
npm start
```

When you see `Open http://localhost:3000 in your web browser`, open **http://localhost:3000** in your browser. The site is running.

Keep the terminal window open while you use the site. To stop the site, click in the terminal and press **Ctrl+C**.
Next time, you only need to open a terminal in the folder and type `npm start` again.

### 4. Make yourself the admin (once)

1. On the site, click **Sign up** and create your own account.
2. In the terminal, press **Ctrl+C** to stop the site. Then type this, with your own email address, and press Enter:

   ```
   npm run make-admin -- your@email.com
   ```

3. Start the site again with `npm start` and log in. An **Admin** link now appears in the top menu.

### Trying "forgot password" on your computer

On your computer, the site doesn't send real emails. When someone asks for a password reset, the email, including the reset link,
**is printed in the terminal window**. Copy the link into your browser to try it.
To send real emails (needed once the site is online), see *Settings* below.

### Trying it with several users

Use a second browser, or a private/incognito window, to be logged in as a different user at the same time.

---

## Where your data is kept

Everything is stored in the `data` folder inside the project folder:

- `data/blog.db` is the database (users, blogs, posts, comments).
- `data/uploads/` holds the uploaded pictures.

To **back up** the site, stop it and copy the `data` folder.
To **start over with an empty site**, stop it and delete the `data` folder.

## Settings (optional)

You don't need any settings to try the site. To change the site name or port, or to send real emails,
copy the file `.env.example` to a new file named `.env` and edit the values. The file explains each one.
Restart the site after changing it.

## Putting it online later

When you're ready, the site can run on any host that supports Node.js and keeps files between restarts
(for example a small VPS, Render with a disk, Railway with a volume, or Fly.io with a volume). Things to set up:

- `BASE_URL`: your real address, starting with `https://`. This also switches on secure cookies.
- `TRUST_PROXY=1`: needed on most hosting platforms.
- Email settings (`SMTP_...`), so password reset emails are actually sent.
- A permanent disk or volume for the `data` folder. Otherwise your posts and pictures are lost when the host restarts.
  You can point `DATA_DIR` to where that disk is mounted.
- Regular backups of the `data` folder.

## For developers

- Node.js (22.13+), Express 5, EJS templates, and SQLite through Node's built-in `node:sqlite`, so there are no native modules to compile.
- The editor is [Quill](https://quilljs.com). All HTML from users is cleaned on the server with `sanitize-html`, using a strict allowlist.
- Passwords are hashed with scrypt. Sessions are random tokens, stored hashed. Forms use CSRF tokens.
  Uploads are checked by their file contents: only JPEG, PNG, GIF and WebP up to 5 MB are accepted.
- `npm test` runs the end-to-end test suite in `test/`.

```
server.js            starts the web server
src/app.js           Express setup (security headers, static files, routes)
src/db.js            database tables
src/auth.js          passwords, sessions, CSRF, rate limiting
src/routes/          pages: auth, profile, blogs, posts, comments, admin
views/               HTML templates
public/              CSS and browser JavaScript
scripts/make-admin.js
```
