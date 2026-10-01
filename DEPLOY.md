# Putting Inkwell online: a step-by-step guide

This guide takes you from "I rented an Ubuntu server" to "my blogging site is online, people can sign up,
I'm the admin, and it keeps running even if the server restarts".

You don't need to know anything about servers. Do the steps **in order** and don't skip any.
Each step tells you exactly what to copy and paste, and what you should see if it worked.

**Time needed:** about 1 hour.

**What you will have at the end:**

- The site runs on your server, behind the **Apache** web server.
- It starts by itself when the server boots, and restarts by itself if it ever crashes.
- A firewall blocks everything except the website and your own login.
- Visitors can open it at `http://YOUR_SERVER_IP`. In step 14 you also get a free secure
  `https://` address, so passwords are sent encrypted.
- Your own admin account.
- An automatic backup every night.

---

## Before you start: how to use this guide

**Read this whole section first.** It explains a few things the guide expects you to know.

### Open this guide in your browser

Open this file on GitHub (it is called `DEPLOY.md` in your project), so you can copy commands from your browser.

### Commands go into a terminal

A *terminal* is a window where you type commands instead of clicking.
You'll use **Windows PowerShell** on your laptop. Through it, you'll type commands on your server.

- **Copying a command:** on GitHub, every grey command box has a small **copy button** in its top-right corner. Click it.
- **Pasting into PowerShell:** **right-click** inside the PowerShell window. (`Ctrl+V` also works in most versions.)
- After pasting, press **Enter** to run the command.
- If a box has **several lines**, copy and paste the whole box at once. The lines run one after another.
- Wait until a command is finished before you paste the next one. It is finished when you see the
  prompt again (the line ending in `$`) and can type.

### Placeholders: words you must replace

Some commands contain words in CAPITAL LETTERS. Replace them with your own information **before** you press Enter:

| Placeholder | Replace with | Example |
|---|---|---|
| `YOUR_SERVER_IP` | your server's IP address | `203.0.113.5` |
| `YOUR_USERNAME` | the username you log in to the server with | `root` or `ubuntu` |
| `YOUR_EMAIL` | your own email address | `nadim@example.com` |

Tip: paste the command into Notepad first, replace the placeholders there, then copy it into PowerShell.

### Passwords are invisible

When the server asks for a password, **nothing appears while you type**: no dots, no stars. That is normal.
Type the password and press Enter.

### `sudo` means "as administrator"

Many commands start with `sudo`. It runs the command with administrator rights.
The first time you use it, the server may ask for **your** password (the one you log in with). If you
log in as `root`, it won't ask.

### If something goes wrong

Don't continue to the next step. Read the error message, then look at **[Troubleshooting](#troubleshooting)**
at the end of this guide. You can always ask Claude: copy the command you ran and everything it printed.

---

## Step 1: Collect your server's details

Your hosting company gave you these when you rented the server, usually in an email or in their website's control panel:

1. The server's **IP address**, four numbers with dots, like `203.0.113.5`.
2. The **username**, often `root` or `ubuntu`.
3. A **password**, or a **key file**.
4. Sometimes a **port** number for SSH. If they don't mention one, it is 22 and you can ignore it.

You said you can already log in with an `ssh ...` command. That command contains the username and IP address:
`ssh root@203.0.113.5` means the username is `root` and the IP address is `203.0.113.5`.
If the command contains `-p` followed by a number (like `-p 2222`), that number is your SSH port. Write it down.

**This guide is written for Ubuntu 22.04 or 24.04.** You'll check the version in step 2.

---

## Step 2: Log in to your server

On your laptop, open **Windows PowerShell**: press the Windows key, type `powershell`, and press Enter.

Type the same command you normally use to log in, for example:

```
ssh YOUR_USERNAME@YOUR_SERVER_IP
```

(If you have an SSH port that is not 22, use `ssh -p PORT YOUR_USERNAME@YOUR_SERVER_IP`.)

**The very first time** you connect, it asks:

```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Type `yes` and press Enter. Then enter your password if it asks (remember: it stays invisible).

**✅ If it worked**, you see a welcome text and a line like this at the bottom:

```
root@my-server:~#
```

or

```
ubuntu@my-server:~$
```

This is the server's prompt. Everything you type in this window now runs **on the server**, not on your laptop.

Now check the Ubuntu version:

```
lsb_release -d
```

**✅ You should see** something like `Description: Ubuntu 24.04.1 LTS` or `Ubuntu 22.04.5 LTS`.

> **Good to know:** If you close this window or lose the connection, nothing is lost. Open PowerShell
> again and log in again with the same `ssh` command. The site keeps running on the server either way.

---

## Step 3: Update the server

New servers often have outdated software. Run this command. It downloads and installs all updates:

```
sudo apt update && sudo apt upgrade -y
```

This can take a few minutes, and lots of text will scroll by.

**While it runs, it may show:**

- **A purple or pink screen** asking which services to restart, or telling you about a newer kernel:
  press **Enter** (or `Tab` until `<Ok>` is highlighted, then Enter).
- **A question about a "configuration file"** (for example `sshd_config`): press **Enter** to keep the
  current version. That is the default.

**✅ It is finished** when you see the prompt again. The last lines often mention
`Processing triggers for ...` or `0 upgraded, 0 newly installed`.

Now restart the server, so all updates are active:

```
sudo reboot
```

Your connection closes. That is expected. **Wait one minute**, then log in again exactly like in step 2:

```
ssh YOUR_USERNAME@YOUR_SERVER_IP
```

**✅ If it worked**, you see the server prompt again.

---

## Step 4: Turn on the firewall

A firewall blocks all connections to the server except the ones you allow. You'll allow three:
logging in (SSH), the website (port 80), and the secure website (port 443).

> ⚠️ **Important:** Run these commands exactly in this order. The first one makes sure you don't
> lock yourself out.
>
> If your SSH port is **not** 22 (see step 1), replace `sudo ufw allow OpenSSH` with
> `sudo ufw allow PORT/tcp`, using your port number, for example `sudo ufw allow 2222/tcp`.

```
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

**✅ You should see** `ufw is already the newest version` (or that it was installed), then `Rules updated` and `Rules updated (v6)` a few times.

Now switch the firewall on:

```
sudo ufw enable
```

It warns: `Command may disrupt existing ssh connections. Proceed with operation (y|n)?`.
Type `y` and press Enter.

**✅ You should see** `Firewall is active and enabled on system startup`.

Check it:

```
sudo ufw status
```

**✅ You should see** a list like this:

```
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
OpenSSH (v6)               ALLOW       Anywhere (v6)
80/tcp (v6)                ALLOW       Anywhere (v6)
443/tcp (v6)               ALLOW       Anywhere (v6)
```

> **Some hosting companies have a second firewall** in their website's control panel (called
> "Firewall", "Security group" or "Network rules"). If they do, open ports **80** and **443** there too.
> If you are not sure, continue. Step 11 shows you whether the site can be reached.

---

## Step 5: Install the basic tools

```
sudo apt install -y git curl unzip sqlite3 ca-certificates
```

**✅ It worked** when the prompt comes back without the word `E:` (that marks an error).
It may say some of them are `already the newest version`. That's fine.

---

## Step 6: Install Node.js

Node.js is the program that runs the site. These commands add the official Node.js download source and install version 22:

```
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
```

Check it:

```
node -v
```

**✅ You should see** a version starting with `v22.`, for example `v22.22.2`. The middle number must be
**13 or higher** (`v22.13.0` or newer). With the commands above, it always is.

---

## Step 7: Create a user and a folder for the site

For safety, the site doesn't run as the administrator. It gets its own user, called `inkwell`, that can
only change the site's data folder.

```
sudo useradd --system --create-home --home-dir /var/lib/inkwell --shell /usr/sbin/nologin inkwell
sudo mkdir -p /var/lib/inkwell/data
sudo chown -R inkwell:inkwell /var/lib/inkwell
sudo chmod 750 /var/lib/inkwell
```

**✅ These commands print nothing if they worked.** Check:

```
id inkwell
```

**✅ You should see** something like `uid=998(inkwell) gid=998(inkwell) groups=998(inkwell)`. The numbers can be different.

The site's data (the database and uploaded pictures) will live in `/var/lib/inkwell/data`.
The site's program files will go into `/opt/inkwell`.

---

## Step 8: Put the site's files on the server

Try **option A** first. If it asks for a username, use **option B** instead.

### Option A: download from GitHub (if your repository is public)

```
sudo git clone --branch claude/blogging-platform-build-rw4005 https://github.com/MidanLP/Vibing.git /opt/inkwell
```

**✅ If it worked**, you see `Cloning into '/opt/inkwell'...` and a few lines ending with `done.`

**❌ If it asks for `Username for 'https://github.com':`**, your repository is private. Press `Ctrl+C`
to cancel and use option B.

(If you merged this branch into `main` on GitHub and deleted the branch, run the same command without
`--branch claude/blogging-platform-build-rw4005`.)

### Option B: upload a ZIP file from your laptop (works for private repositories)

1. On your laptop, open your repository on GitHub, switch to the branch `claude/blogging-platform-build-rw4005`,
   click the green **Code** button and then **Download ZIP**.
   *(Use this fresh download, not your own Vibing folder. Your folder contains your test accounts and other
   files that should not go on the server.)*
2. In your **Downloads** folder, rename the file to `inkwell.zip`. (If Windows hides the `.zip` ending
   in file names, just rename it to `inkwell`.)
3. Open a **second** PowerShell window on your laptop. Don't use the one that is logged in to the server.
   Run this, with your username and IP:

   ```
   scp "$HOME\Downloads\inkwell.zip" YOUR_USERNAME@YOUR_SERVER_IP:/tmp/inkwell.zip
   ```

   (With a special SSH port, use `scp -P PORT ...`. That is a **capital** P here.)
   Enter your password if it asks.

   **✅ You should see** a line like `inkwell.zip   100%   70KB ...`.
   You can close this second window now.

4. Back in the window that is **logged in to the server**, run:

   ```
   rm -rf /tmp/inkwell-unzipped
   unzip -q /tmp/inkwell.zip -d /tmp/inkwell-unzipped
   sudo mv /tmp/inkwell-unzipped/* /opt/inkwell
   ```

### Check, and install the site's parts (for both options)

```
ls /opt/inkwell
```

**✅ You should see** names like `DEPLOY.md  README.md  deploy  package.json  public  scripts  server.js  src  views`.

Now install the parts the site needs:

```
cd /opt/inkwell
sudo npm ci --omit=dev
```

**✅ You should see** `added 106 packages` (the exact number can differ).
Warnings that start with `npm warn` and lines about `funding` or `vulnerability` are normal.

---

## Step 9: Create the settings file

The site reads its settings from a file called `.env`. The first command finds your server's public IP
address by itself:

```
SERVER_IP=$(curl -4 -s https://api.ipify.org)
echo $SERVER_IP
```

**✅ You should see your server's IP address**, the same one you use in your `ssh` command.
If it is a different address or empty, type it yourself instead, like this: `SERVER_IP=203.0.113.5`.

Now create the file. Copy the **whole** box at once:

```
sudo tee /opt/inkwell/.env > /dev/null <<EOF
SITE_NAME=Inkwell
PORT=3000
HOST=127.0.0.1
DATA_DIR=/var/lib/inkwell/data
TRUST_PROXY=1
BASE_URL=http://$SERVER_IP
EOF
sudo chown root:inkwell /opt/inkwell/.env
sudo chmod 640 /opt/inkwell/.env
```

Check it:

```
sudo cat /opt/inkwell/.env
```

**✅ You should see** the six lines, and the last one has your IP address, for example `BASE_URL=http://203.0.113.5`.

**❌ If the last line is just `BASE_URL=http://`**, the IP address was lost (this happens if you logged in
again in between). Run both boxes of this step again.

> Want a different site name? Change `SITE_NAME=Inkwell` in the box above before you paste it.

---

## Step 10: Start the site, and make it start by itself

This installs the site as a *service*. A service starts automatically when the server boots and is
restarted automatically if it crashes.

```
sudo cp /opt/inkwell/deploy/inkwell.service /etc/systemd/system/inkwell.service
sudo systemctl daemon-reload
sudo systemctl enable --now inkwell
```

**✅ You should see** `Created symlink /etc/systemd/system/multi-user.target.wants/inkwell.service → /etc/systemd/system/inkwell.service.`

Check that it is running:

```
sudo systemctl status inkwell --no-pager
```

**✅ You should see** a green **`active (running)`** and, near the bottom, the lines
`Inkwell is running.` and `Open http://YOUR_SERVER_IP in your web browser.`

(It also says `There is no admin yet ...`. You'll do that in step 12.)

One more check. This asks the site for its home page, from the server itself:

```
curl -I http://127.0.0.1:3000
```

**✅ You should see** `HTTP/1.1 200 OK` as the first line.

**❌ If you see `failed` (in red) or `Connection refused`**, see [Troubleshooting](#troubleshooting).

---

## Step 11: Install Apache, which makes the site reachable from the internet

The site only listens *inside* the server. **Apache** is the web server that receives visitors on the
normal web port (80) and passes them on to the site.

Install Apache:

```
sudo apt install -y apache2
```

Switch on the Apache features the site needs:

```
sudo a2enmod proxy proxy_http headers rewrite ssl
```

**✅ You should see** lines like `Enabling module proxy.`, and at the end:
`To activate the new configuration, you need to run: systemctl restart apache2`. You'll do that in a moment.

Give Apache a server name. Without it, Apache shows a harmless but confusing warning:

```
echo "ServerName localhost" | sudo tee /etc/apache2/conf-available/servername.conf
sudo a2enconf servername
```

Now install the site's Apache settings, and switch off Apache's default "It works!" page:

```
sudo cp /opt/inkwell/deploy/apache-http.conf /etc/apache2/sites-available/inkwell.conf
sudo a2dissite 000-default
sudo a2ensite inkwell
```

**✅ You should see** `Site 000-default disabled.` and `Enabling site inkwell.`

Test the settings for mistakes:

```
sudo apache2ctl configtest
```

**✅ You should see** `Syntax OK`.

Restart Apache, so it uses the new settings:

```
sudo systemctl restart apache2
```

**✅ This prints nothing if it worked.** Check:

```
curl -I http://127.0.0.1
```

**✅ You should see** `HTTP/1.1 200 OK` as the first line.

### 🎉 Open your site

On your laptop, open your web browser and go to:

```
http://YOUR_SERVER_IP
```

**✅ You should see your Inkwell home page** ("Stories and ideas from everyone").

The browser shows **"Not secure"** next to the address. That is expected for now. Step 14 fixes it.

**❌ If the page doesn't load** (it keeps loading, or says "took too long to respond"), check your hosting
company's own firewall (see the note at the end of step 4) and then [Troubleshooting](#troubleshooting).

---

## Step 12: Create your admin account

1. On the site, click **Sign up** and create your own account with your real email address.
   (Do this before you share the address with anybody.)
2. Back in the server window, make that account the admin. Replace `YOUR_EMAIL` with the email you just signed up with:

   ```
   cd /opt/inkwell
   sudo -u inkwell npm run make-admin -- YOUR_EMAIL
   ```

   > ⚠️ Type it exactly like this, with `sudo -u inkwell` at the start. It runs the command as the site's
   > own user. If you leave it out, the database could end up owned by the administrator, and the site
   > can't write to it any more.

   **✅ You should see** `Done! ... is now an admin.`

3. In your browser, reload the page. An **Admin** link now appears in the top menu.
   There's no need to restart anything.

---

## Step 13: Set up automatic backups

This makes a backup of the database and all uploaded pictures **every night at 3:30** (server time,
usually UTC). It keeps the last 14 days.

```
echo '30 3 * * * root bash /opt/inkwell/scripts/backup.sh >> /var/log/inkwell-backup.log 2>&1' | sudo tee /etc/cron.d/inkwell-backup
```

**✅ You should see** the same line printed back to you.

Make a first backup right now, to check that it works:

```
sudo bash /opt/inkwell/scripts/backup.sh
```

**✅ You should see** `Backup saved: /var/backups/inkwell/inkwell-2026-10-01_1234.tar.gz`
(with today's date and time).

> These backups are on the same server. If the server itself breaks, they are gone too, so copy one to
> your laptop from time to time. See [Copy a backup to your laptop](#copy-a-backup-to-your-laptop).

---

## Step 14: Make the site secure with HTTPS

Right now, everything between your visitors and the site is sent **unencrypted**, including passwords.
**HTTPS** encrypts it, and browsers stop showing "Not secure".

A free HTTPS certificate needs an address with a name, not just an IP address. You don't have a domain
yet, so you'll use a free service called **sslip.io**. It gives every IP address a name automatically:
`203.0.113.5` becomes `203-0-113-5.sslip.io`. You don't need to sign up for anything.

After this step, your site's address is `https://203-0-113-5.sslip.io` (with your numbers). People who
still type `http://YOUR_SERVER_IP` are sent to the new address automatically.

### 14.1 Work out your new address

```
SITE_HOST=$(curl -4 -s https://api.ipify.org | tr . -).sslip.io
echo $SITE_HOST
```

**✅ You should see** your IP with dashes instead of dots, followed by `.sslip.io`, for example `203-0-113-5.sslip.io`.

Test it: on your laptop, open `http://` followed by that address, for example `http://203-0-113-5.sslip.io`.
**✅ Your site should appear** (still "Not secure" for now).

### 14.2 Get the certificate

Install **certbot**, the free tool that gets certificates from Let's Encrypt:

```
sudo apt install -y certbot
```

Request the certificate. Replace `YOUR_EMAIL` with your email address. Let's Encrypt only uses it to warn
you if something is wrong with your certificate.

```
sudo certbot certonly --webroot -w /var/www/html -d $SITE_HOST --agree-tos --no-eff-email -m YOUR_EMAIL --deploy-hook "systemctl reload apache2"
```

**✅ You should see** `Successfully received certificate.` and
`Certificate is saved at: /etc/letsencrypt/live/203-0-113-5.sslip.io/fullchain.pem`.

**❌ If you see an error mentioning `too many certificates` or `rateLimited`**, sslip.io has hit a limit
that Let's Encrypt sets for each address service. Use the other free service, **nip.io**, instead.
Run this, then the `certbot` command again:

```
SITE_HOST=$(curl -4 -s https://api.ipify.org | tr . -).nip.io
echo $SITE_HOST
```

**❌ If you see `Could not connect` or `Timeout during connect`**, port 80 is blocked. Check step 4 and
your hosting company's firewall.

### 14.3 Switch Apache to HTTPS

Copy this whole box. It installs the HTTPS settings with your address filled in:

```
sed "s/SITE_ADDRESS/$SITE_HOST/g" /opt/inkwell/deploy/apache-https.conf | sudo tee /etc/apache2/sites-available/inkwell.conf > /dev/null
sudo apache2ctl configtest
```

**✅ You should see** `Syntax OK`.

**❌ If you see an error about `SSLCertificateFile` or a file that `does not exist`**, the address was lost
(this happens if you logged in again in between). Run the box from 14.1 again, then this box again.

Now tell the site its new address, and restart both Apache and the site:

```
sudo sed -i "s|^BASE_URL=.*|BASE_URL=https://$SITE_HOST|" /opt/inkwell/.env
sudo grep BASE_URL /opt/inkwell/.env
sudo systemctl reload apache2
sudo systemctl restart inkwell
```

**✅ You should see** `BASE_URL=https://203-0-113-5.sslip.io` (with your address).

### 14.4 Open your secure site

In your browser, go to `https://` followed by your address, for example `https://203-0-113-5.sslip.io`.

**✅ You should see your site with a padlock** (or a "settings" icon) next to the address, and no
"Not secure" warning. Log in again. You were logged out because the address changed.

Also try `http://YOUR_SERVER_IP`. **✅ It should jump to the https address by itself.**

### 14.5 Check that the certificate renews by itself

Certificates are valid for about 3 months, and certbot renews them automatically. Test that renewal will work:

```
sudo certbot renew --dry-run
```

**✅ You should see** `Congratulations, all simulated renewals succeeded`.

### 🎉 You're done!

**Your site is online at `https://YOUR-ADDRESS.sslip.io`.** Share that address with people.
It keeps running when you close PowerShell, and it starts by itself when the server restarts.

To prove it, you can restart the server now with `sudo reboot`. Wait two minutes, then open the site
again. **✅ It should load as before.**

---

## Everyday tasks

To do any of these, first log in to the server (step 2).

### Is the site running?

```
sudo systemctl status inkwell --no-pager
```

Look for a green `active (running)`.

### Restart the site

```
sudo systemctl restart inkwell
```

### See what the site has been doing (logs)

```
sudo journalctl -u inkwell -n 50 --no-pager
```

This shows the last 50 lines. Errors appear here.

### Someone forgot their password

Until you set up email (see the next section), the site can't send emails. Instead, it writes the reset
email into its log. When someone asks you for help:

1. Ask them to click **Forgot your password?** on the site and enter their email.
2. Then run:

   ```
   sudo journalctl -u inkwell --since "1 hour ago" --no-pager | grep reset-password
   ```

3. You'll see a link like `https://.../reset-password/AbC123...`. Make sure it was printed under
   `To: their@email.com` in the full log. Send them the link. It works for one hour.

### Make another admin

```
cd /opt/inkwell
sudo -u inkwell npm run make-admin -- THEIR_EMAIL
```

### Send real emails (for "forgot password")

You need an account with an email-sending service (for example Brevo, Mailgun, Postmark or SendGrid;
many have a free plan). They give you an **SMTP host, port, username and password**.

Open the settings file in the simple text editor `nano`:

```
sudo nano /opt/inkwell/.env
```

Use the arrow keys to go to the end of the file and add these lines, with your provider's values:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
MAIL_FROM=Inkwell <no-reply@example.com>
```

Save with **`Ctrl+O`** and then **Enter**. Close nano with **`Ctrl+X`**. Then restart the site:

```
sudo systemctl restart inkwell
```

Test it with **Forgot your password?** on the site. If no email arrives, look at the logs (see above).

### Update the site to a newer version

First make a backup:

```
sudo bash /opt/inkwell/scripts/backup.sh
```

**If you used option A in step 8 (git):**

```
cd /opt/inkwell
sudo git pull
sudo npm ci --omit=dev
sudo systemctl restart inkwell
```

**If you used option B (ZIP):** upload the new ZIP exactly like in step 8, option B, points 1 to 3. Then run this on the server.
It keeps your settings file:

```
sudo cp /opt/inkwell/.env /root/inkwell.env.saved
sudo rm -rf /opt/inkwell /tmp/inkwell-unzipped
unzip -q /tmp/inkwell.zip -d /tmp/inkwell-unzipped
sudo mv /tmp/inkwell-unzipped/* /opt/inkwell
sudo cp /root/inkwell.env.saved /opt/inkwell/.env
sudo chown root:inkwell /opt/inkwell/.env
sudo chmod 640 /opt/inkwell/.env
cd /opt/inkwell
sudo npm ci --omit=dev
sudo systemctl restart inkwell
```

Your posts, users and pictures are not touched by an update. They live in `/var/lib/inkwell/data`.

### Copy a backup to your laptop

On the **server**, copy the newest backup to a place you are allowed to download from:

```
sudo sh -c 'cp "$(ls -1 /var/backups/inkwell/inkwell-*.tar.gz | tail -n 1)" /tmp/latest-backup.tar.gz'
sudo chmod 644 /tmp/latest-backup.tar.gz
```

On your **laptop**, in a **new** PowerShell window (not logged in to the server):

```
scp YOUR_USERNAME@YOUR_SERVER_IP:/tmp/latest-backup.tar.gz "$HOME\Downloads\"
```

**✅ The file is now in your Downloads folder.** Back on the server, delete the temporary copy:

```
sudo rm /tmp/latest-backup.tar.gz
```

### Restore a backup

Only do this if something went badly wrong and you want to go back to the state of a backup.
Everything that happened after that backup is lost. Your current data is kept in a separate folder, just in case.

List the backups:

```
sudo ls -1 /var/backups/inkwell
```

Pick one and put its name into the first line below, instead of `BACKUP_FILE_NAME`:

```
BACKUP=/var/backups/inkwell/BACKUP_FILE_NAME
sudo systemctl stop inkwell
sudo mv /var/lib/inkwell/data /var/lib/inkwell/data-before-restore-$(date +%Y%m%d-%H%M)
sudo mkdir /var/lib/inkwell/data
sudo tar -xzf "$BACKUP" -C /var/lib/inkwell/data
sudo chown -R inkwell:inkwell /var/lib/inkwell/data
sudo systemctl start inkwell
```

**✅ Check** with `sudo systemctl status inkwell --no-pager` (green `active (running)`) and open the site.

### Later: use your own domain name

When you buy a domain (for example `myblog.com`):

1. In your domain company's control panel, create an **A record** for `myblog.com` that points to your
   server's IP address. Wait until it works: `http://myblog.com` should show your site.
2. Log in to the server and do **step 14** again, with one change: instead of the box in 14.1, run
   `SITE_HOST=myblog.com` (with your domain).

---

## Troubleshooting

**`ssh: connect to host ... Connection timed out`**
The IP address is wrong, the server is switched off, or your SSH port isn't 22. Check the details from
your hosting company (step 1). If this started right after step 4, see "Locked out" below.

**`Permission denied (publickey)`**
Your server uses a key file instead of a password. Log in the way your hosting company describes.
Usually that's `ssh -i path\to\keyfile YOUR_USERNAME@YOUR_SERVER_IP`.

**`WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!`**
This happens if the server was reinstalled. On your laptop, run `ssh-keygen -R YOUR_SERVER_IP`, then log in again.

**Locked out after turning on the firewall**
Most hosting companies have a **"Console"** or **"VNC"** button in their control panel that opens the
server in your browser. Log in there and run `sudo ufw allow OpenSSH` (or `sudo ufw allow PORT/tcp` for
a special SSH port).

**`sudo systemctl status inkwell` shows `failed` or `activating (auto-restart)`**
Look at the logs to see why:

```
sudo journalctl -u inkwell -n 30 --no-pager
```

- `Cannot find module 'express'`: step 8's `sudo npm ci --omit=dev` is missing. Run it, then
  `sudo systemctl restart inkwell`.
- `EACCES`, `SQLITE_CANTOPEN`, `readonly database` or `permission denied`: the data folder belongs to the
  wrong user. Fix it, then restart:

  ```
  sudo chown -R inkwell:inkwell /var/lib/inkwell
  sudo systemctl restart inkwell
  ```

- `EADDRINUSE`: something else already uses port 3000. Restart the server with `sudo reboot`.
- `bad option: --disable-warning` or `No such built-in module: node:sqlite`: Node.js is too old.
  Do step 6 again.

**The browser shows `Service Unavailable` or `Bad Gateway`**
Apache works, but the site isn't running. See the previous problem.

**The browser can't reach the site at all (loads forever or "took too long")**
- Is Apache running? `sudo systemctl status apache2 --no-pager` should show `active (running)`.
- Is the firewall open? `sudo ufw status` should list `80/tcp` and `443/tcp`.
- Does your hosting company have its own firewall in its control panel? Open ports 80 and 443 there.

**The browser shows Apache's "It works!" page instead of your site**
The default page is still on. Run `sudo a2dissite 000-default` and `sudo systemctl reload apache2`.

**`Form expired` when you log in or post something**
Reload the page and try again. If it keeps happening after step 14, make sure you are using the
`https://...sslip.io` address. Close the tab and open the address fresh.

**`sudo apache2ctl configtest` doesn't say `Syntax OK`**
Read the line it prints. It names the file and line number. If it is about `/etc/letsencrypt/...`, see
step 14.3. To go back to the working plain-HTTP setup at any time, run:

```
sudo cp /opt/inkwell/deploy/apache-http.conf /etc/apache2/sites-available/inkwell.conf
sudo systemctl reload apache2
```

If you also changed `BASE_URL` in step 14.3, set it back:

```
sudo sed -i "s|^BASE_URL=.*|BASE_URL=http://$(curl -4 -s https://api.ipify.org)|" /opt/inkwell/.env
sudo systemctl restart inkwell
```

---

## Where everything is on the server

| What | Where |
|---|---|
| The site's program files | `/opt/inkwell` |
| Settings | `/opt/inkwell/.env` |
| Database and uploaded pictures | `/var/lib/inkwell/data` |
| Backups | `/var/backups/inkwell` |
| The service that keeps the site running | `/etc/systemd/system/inkwell.service` |
| Apache settings for the site | `/etc/apache2/sites-available/inkwell.conf` |
| Apache logs | `/var/log/apache2/inkwell-access.log` and `inkwell-error.log` |
| HTTPS certificate | `/etc/letsencrypt/live/` |
