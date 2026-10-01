# Putting Inkwell online: step-by-step guide

This guide puts your blogging site on your Ubuntu server, so anyone can open it in their browser.
It takes about **30 minutes**. You don't need to know anything about servers. Just go through the steps in order.

When you're done:

- The site runs on your server and **starts again by itself** if the server restarts or the site crashes.
- People can open it with your server's IP address. You also get a free secure `https://` address.
- **Apache** is the web server that receives visitors and passes them on to your site.
- You have an **admin account**.
- A **backup** is made every night.

---

## Before you start

**You need:**

1. **Your server's IP address**, for example `203.0.113.5`. Your server provider shows it in their control panel or in the welcome email.
2. **The username and password** for logging in to the server. The username is often `root` or `ubuntu`.
3. **Your laptop**, with **PowerShell**. Click the Start button, type `PowerShell` and open it.
4. **Your email address.** It's used for your admin account and for the free security certificate.

**How to use this guide:**

- **Copying:** open this file on GitHub (`DEPLOY.md` in your repository) so you can copy commands from the browser.
- **Pasting:** in PowerShell, **right-click** to paste. `Ctrl+V` usually works too. Then press **Enter**.
- **One box at a time:** copy and run one grey box at a time. Then compare what you see with **"You should see"**.
- **Words in CAPITALS** like `YOUR_SERVER_IP` or `YOUR_EMAIL` are placeholders. Replace them with your own values before pressing Enter.
- **Passwords are invisible:** when you type a password in the terminal, **nothing appears on screen**, not even dots. That's normal. Type it and press Enter.
- **If something looks different** from what this guide says, don't continue. Look in [Troubleshooting](#troubleshooting) at the end.

---

## Step 1: Connect to your server

In PowerShell on your laptop, type this. Replace `USERNAME` and `YOUR_SERVER_IP` with your own values, for example `ssh root@203.0.113.5`:

```
ssh USERNAME@YOUR_SERVER_IP
```

The first time, it asks:

```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Type `yes` and press Enter. Then type your password (invisible) and press Enter.

**You should see** a welcome text and then a line ending in `$` or `#`, like:

```
root@my-server:~#
```

You are now "inside" your server. **Every command in Steps 2 to 11 is typed in this window**, unless the step says *on your laptop*.

> If you close this window by accident, just run the `ssh` command again. Your site keeps running.

---

## Step 2: Install the software

This updates the server and installs Apache, Node.js (which runs your site) and a few small tools. It takes 2 to 5 minutes, and lots of text will scroll by.

Copy and run these one at a time:

```
sudo apt update
```

```
sudo DEBIAN_FRONTEND=noninteractive apt -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
```

```
sudo DEBIAN_FRONTEND=noninteractive apt install -y apache2 git curl unzip sqlite3 certbot ufw
```

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
```

```
sudo apt install -y nodejs
```

```
node -v
```

**You should see** a version number starting with `v22.`, for example `v22.20.0`.
(The number after `22.` must be 13 or higher. With this method it always is.)

> If the server asks for your password after a `sudo` command, type your login password.

---

## Step 3: Turn on the firewall

The firewall blocks everything except logging in (SSH) and the website (Apache).

```
sudo ufw allow OpenSSH
sudo ufw allow "Apache Full"
sudo ufw --force enable
sudo ufw status
```

**You should see:**

```
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
Apache Full                ALLOW       Anywhere
...
```

> ⚠️ **Only if your `ssh` command in Step 1 had `-p` and a number** (for example `ssh -p 2222 ...`): also run `sudo ufw allow 2222/tcp`, using your number, **before** you close this window. Otherwise you can't log in again.

---

## Step 4: Download the site to the server

There are two ways. **Try option A first.**

### Option A: download directly from GitHub

```
sudo git clone --branch claude/blogging-platform-build-rw4005 https://github.com/MidanLP/Vibing.git /opt/inkwell
```

**You should see** `Cloning into '/opt/inkwell'...` and, a few seconds later, the `$`/`#` line again.

- **If it asks for `Username for 'https://github.com'`:** your repository is private. Press `Ctrl+C` and use **option B** instead.
- **If it says `Remote branch ... not found`:** you merged the code into your main branch. Run the same command without `--branch claude/blogging-platform-build-rw4005`.

### Option B: upload the files from your laptop (only if option A didn't work)

1. **On your laptop**, in your browser, open
   https://github.com/MidanLP/Vibing/tree/claude/blogging-platform-build-rw4005.
   Click the green **Code** button, then **Download ZIP**.
   - Use this download, **not** the folder on your laptop. That folder contains your test accounts.
2. In your **Downloads** folder, rename the downloaded file to `inkwell.zip`.
   If you don't see `.zip` at the end of file names, rename it to just `inkwell`.
3. **On your laptop**, open a **second** PowerShell window and run (replace `USERNAME` and `YOUR_SERVER_IP`):

   ```
   scp "$HOME\Downloads\inkwell.zip" USERNAME@YOUR_SERVER_IP:/tmp/inkwell.zip
   ```

   Type your server password.
   **You should see** a line like `inkwell.zip   100%   70KB ...`. You can close this second window.
4. Back in the **server window**, run:

   ```
   rm -rf /tmp/inkwell-unzipped
   unzip -q /tmp/inkwell.zip -d /tmp/inkwell-unzipped
   sudo mv /tmp/inkwell-unzipped/* /opt/inkwell
   ```

### Then, for both options, install the site's parts

```
cd /opt/inkwell
sudo npm ci --omit=dev
```

**You should see** `added 106 packages` (the number can differ a little). Lines with `warn` or `vulnerability` are normal.

---

## Step 5: Create the settings

These commands create a separate, locked-down user account that runs the site, and a folder for the site's data:

```
sudo useradd --system --create-home --home-dir /var/lib/inkwell --shell /usr/sbin/nologin inkwell
sudo mkdir -p /var/lib/inkwell/data
sudo chown -R inkwell:inkwell /var/lib/inkwell
```

**You should see** nothing, just the `$`/`#` line again. That means it worked.

Now find your server's public IP address:

```
SERVER_IP=$(curl -4 -s https://api.ipify.org)
echo $SERVER_IP
```

**You should see** your server's IP address, the same one you used in Step 1.
(If it shows a different address, type `SERVER_IP=YOUR_SERVER_IP` with your real address and press Enter.)

Now create the settings file. Copy the **whole box** at once and paste it:

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
sudo cat /opt/inkwell/.env
```

**You should see** the six settings. The last line should show your IP, for example `BASE_URL=http://203.0.113.5`.
If it only says `BASE_URL=http://`, run the `SERVER_IP=...` command above again, then this box again.

---

## Step 6: Start the site and keep it running

This sets the site up as a *service*: Ubuntu starts it when the server boots and restarts it if it ever crashes.

```
sudo cp /opt/inkwell/deploy/inkwell.service /etc/systemd/system/inkwell.service
sudo systemctl daemon-reload
sudo systemctl enable --now inkwell
sudo systemctl status inkwell --no-pager
```

**You should see** (among other lines):

```
Active: active (running)
...
Inkwell is running.
```

Check that the site answers:

```
curl -I http://127.0.0.1:3000
```

**You should see** `HTTP/1.1 200 OK` as the first line.

---

## Step 7: Set up Apache

Apache receives the visitors and passes them on to your site.

```
sudo a2enmod proxy proxy_http
sudo cp /opt/inkwell/deploy/apache-http.conf /etc/apache2/sites-available/inkwell.conf
sudo a2dissite 000-default
sudo a2ensite inkwell
sudo apache2ctl configtest
```

**You should see** `Syntax OK` at the end.
(A line starting with `AH00558: apache2: Could not reliably determine the server's fully qualified domain name` is harmless. Ignore it.)

```
sudo systemctl restart apache2
```

**Now open your site:** on your laptop, open your browser and go to `http://YOUR_SERVER_IP`, for example `http://203.0.113.5`.

**You should see** your Inkwell home page with *"Stories and ideas from everyone."* 🎉
The browser shows "Not secure" next to the address. Step 9 fixes that.

---

## Step 8: Create your admin account

1. On the site, click **Sign up** and create your account with your real email address and a **strong password**.
2. Back in the **server window**, run this (replace `YOUR_EMAIL` with the email you just signed up with):

   ```
   cd /opt/inkwell
   sudo -u inkwell npm run make-admin -- YOUR_EMAIL
   ```

   **You should see:** `Done! YOUR NAME (your@email) is now an admin.`

3. Reload the page in your browser. An **Admin** link now appears in the top menu.

> Always run this command exactly as shown, with `sudo -u inkwell`. Run as `root` instead, it can create database files the site isn't allowed to open.

---

## Step 9: Make it secure with HTTPS (strongly recommended)

Without HTTPS, passwords travel over the internet unprotected. Anyone on the same Wi-Fi as a visitor could read them.
HTTPS needs a name instead of a bare IP address. Without a domain, you can use a **free address** that already points to your IP:
`203-0-113-5.sslip.io` (your IP with dashes instead of dots). This step gets a free certificate for it from *Let's Encrypt*.

Work out your free address:

```
SITE_HOST=$(curl -4 -s https://api.ipify.org | tr . -).sslip.io
echo $SITE_HOST
```

**You should see** something like `203-0-113-5.sslip.io` (with your own numbers).
To check it, open `http://` followed by that address in your browser. It should show your site.

Get the certificate (replace `YOUR_EMAIL`):

```
sudo certbot certonly --webroot -w /var/www/html -d $SITE_HOST --agree-tos --no-eff-email -n -m YOUR_EMAIL --deploy-hook "systemctl reload apache2"
```

**You should see** `Successfully received certificate.`

Switch Apache and the site to HTTPS:

```
sudo a2enmod ssl rewrite headers
sed "s/SITE_HOST/$SITE_HOST/g" /opt/inkwell/deploy/apache-https.conf | sudo tee /etc/apache2/sites-available/inkwell.conf > /dev/null
sudo apache2ctl configtest
```

**You should see** `Syntax OK`.

```
sudo systemctl restart apache2
sudo sed -i "s|^BASE_URL=.*|BASE_URL=https://$SITE_HOST|" /opt/inkwell/.env
sudo systemctl restart inkwell
sudo grep BASE_URL /opt/inkwell/.env
```

**You should see** `BASE_URL=https://203-0-113-5.sslip.io` (with your numbers).

**Now open** `https://` followed by your address, for example `https://203-0-113-5.sslip.io`.
**You should see** your site with a **lock icon** next to the address. People who type `http://YOUR_SERVER_IP` are sent there automatically.
**This is your site's address now.** Share it with people.

The certificate renews itself automatically. To check that renewal works, run:

```
sudo certbot renew --dry-run
```

**You should see** `Congratulations, all simulated renewals succeeded`.

> If you closed the server window during this step, run the `SITE_HOST=...` command again before continuing. The other commands need it.

---

## Step 10: Turn on nightly backups

This makes a backup of all posts, users and pictures every night at 3:30 (server time). Backups older than 14 days are deleted.

```
echo '30 3 * * * root bash /opt/inkwell/scripts/backup.sh >> /var/log/inkwell-backup.log 2>&1' | sudo tee /etc/cron.d/inkwell-backup
sudo bash /opt/inkwell/scripts/backup.sh
```

**You should see** `Backup saved: /var/backups/inkwell/inkwell-2026-...tar.gz`.

These backups are on the same server. Download a copy to your laptop now and then (see [Everyday tasks](#everyday-tasks)).

---

## Step 11: Test a server restart

Check that everything comes back on its own:

```
sudo reboot
```

The connection closes; that's expected. Wait **2 minutes**, then open your site in the browser.
**You should see** your site as normal.

**You're done!** 🎉 Your site is online.

---

## Everyday tasks

First connect to the server, as in Step 1: `ssh USERNAME@YOUR_SERVER_IP`.

**Is the site running?**

```
sudo systemctl status inkwell --no-pager
```

It should say `Active: active (running)`.

**Restart the site**, for example after changing settings:

```
sudo systemctl restart inkwell
```

**See the site's latest messages and errors:**

```
sudo journalctl -u inkwell -n 50 --no-pager
```

**Someone forgot their password** (until you set up email, below): the reset email is written into the site's messages instead of being sent.
After the person has used *Forgot password?* on the site, run:

```
sudo journalctl -u inkwell --since "1 hour ago" --no-pager | grep reset-password
```

Send the link that appears **only to the email address of that account**. Anyone with the link can change the password.

**Set up real emails** for password resets. You need an account with an email-sending service, for example Brevo, Mailgun or Postmark. They give you a "SMTP server", "port", "username" and "password".
Open the settings file:

```
sudo nano /opt/inkwell/.env
```

Use the arrow keys to go to the end of the file and add these lines with your own values:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password
MAIL_FROM=Inkwell <no-reply@example.com>
```

Save with `Ctrl+O`, then `Enter`. Close with `Ctrl+X`. Then run `sudo systemctl restart inkwell`.
Test it by using *Forgot password?* on the site with your own email.

**Change the site name:** open the settings file in the same way (`sudo nano /opt/inkwell/.env`), change `SITE_NAME=Inkwell`, save, then restart the site.

**Make someone else an admin:**

```
cd /opt/inkwell
sudo -u inkwell npm run make-admin -- THEIR_EMAIL
```

**Update the site to a newer version.** Make a backup first: `sudo bash /opt/inkwell/scripts/backup.sh`.

- **If you used option A in Step 4:**

  ```
  cd /opt/inkwell
  sudo git pull
  sudo npm ci --omit=dev
  sudo systemctl restart inkwell
  ```

- **If you used option B in Step 4:** first upload the new `inkwell.zip` as in Step 4, option B, points 1 to 3. Then run:

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

**Download the newest backup to your laptop.** On the server:

```
sudo sh -c 'cp "$(ls -1 /var/backups/inkwell/*.tar.gz | tail -1)" /tmp/latest-backup.tar.gz'
sudo chmod 644 /tmp/latest-backup.tar.gz
```

Then, **on your laptop** in a new PowerShell window:

```
scp USERNAME@YOUR_SERVER_IP:/tmp/latest-backup.tar.gz "$HOME\Downloads\"
```

The backup is now in your Downloads folder. Then, on the server, delete the temporary copy: `sudo rm /tmp/latest-backup.tar.gz`.

**Restore a backup.** This replaces the site's current content with the backup. To see the available backups:

```
sudo ls /var/backups/inkwell
```

Then run this, replacing `BACKUP_FILE` with one of the listed names. The current data is kept in a folder named `data-before-restore-...`, just in case.

```
sudo systemctl stop inkwell
sudo mv /var/lib/inkwell/data /var/lib/inkwell/data-before-restore-$(date +%Y%m%d%H%M)
sudo mkdir /var/lib/inkwell/data
sudo tar -xzf /var/backups/inkwell/BACKUP_FILE -C /var/lib/inkwell/data
sudo chown -R inkwell:inkwell /var/lib/inkwell/data
sudo systemctl start inkwell
```

**When you buy a domain name** (for example `myblog.com`):

1. In your domain provider's settings, create an **A record** for `myblog.com` that points to your server's IP address. It can take up to an hour to work.
2. On the server, run `SITE_HOST=myblog.com` (with your domain).
3. Then repeat Step 9 from the `sudo certbot ...` command onwards.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| `ssh: connect to host ... Connection timed out` | Check the IP address. Check in your provider's control panel that the server is switched on. |
| `Permission denied (publickey)` | Your provider uses a key file instead of a password. Their help pages explain how to log in with it. Then use the same login here. |
| `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED` | Happens after the server was reinstalled. On your laptop run `ssh-keygen -R YOUR_SERVER_IP`, then connect again. |
| `sudo: command not found` | You are logged in as `root`. Leave out the word `sudo` from the commands. In Step 8, use `runuser -u inkwell -- npm run make-admin -- YOUR_EMAIL` instead. |
| `node -v` shows a version below `v22.13` | Run the two Node.js commands of Step 2 again (`curl ... setup_22.x ...` and `sudo apt install -y nodejs`). |
| The browser can't open `http://YOUR_SERVER_IP` at all | 1) Run `sudo systemctl status apache2 --no-pager`; it should say `active (running)`. 2) Run `sudo ufw status`; it should list `Apache Full`. 3) Many providers have an **extra firewall in their control panel** (called "Firewall", "Security group" or "Network rules"). Allow ports **80** and **443** there. |
| The browser shows the Apache page "It works!" | The default site is still on. Run `sudo a2dissite 000-default` and `sudo systemctl restart apache2`. |
| `503 Service Unavailable` or `502 Bad Gateway` | Apache works, but the site isn't running. Run `sudo journalctl -u inkwell -n 50 --no-pager` and look at the last lines. `Cannot find module` means you forgot `sudo npm ci --omit=dev` (Step 4). Then run `sudo systemctl restart inkwell`. |
| The site's status says `failed` and the messages mention `SQLITE` or `permission denied` | Run `sudo chown -R inkwell:inkwell /var/lib/inkwell` and `sudo systemctl restart inkwell`. |
| `make-admin` says `No account with the email ... was found` | Sign up on the site first, and use exactly the same email address. |
| `certbot` says `too many certificates` or `rateLimited` | The free sslip.io address is popular. Use the other free service: run `SITE_HOST=$(curl -4 -s https://api.ipify.org \| tr . -).nip.io`, then repeat Step 9 from the `sudo certbot ...` command. |
| `certbot` says `Timeout`, `Connection refused` or `unauthorized` | Port 80 isn't reachable from the internet. Check the provider firewall (see above), and that `http://YOUR_SERVER_IP` opens your site. Then try again. |
| After Step 9, the site says **"Form expired"** when logging in | Close the tab and open the `https://` address freshly. Don't use an old `http://` tab. |
| Something else | Run `sudo journalctl -u inkwell -n 50 --no-pager` and `sudo tail -n 20 /var/log/apache2/inkwell-error.log` and look at the last lines. They usually say what's wrong. |

## Where everything is on the server

| What | Where |
|---|---|
| The site's program files | `/opt/inkwell` |
| Settings | `/opt/inkwell/.env` |
| Database and uploaded pictures | `/var/lib/inkwell/data` |
| Backups | `/var/backups/inkwell` |
| Apache settings for the site | `/etc/apache2/sites-available/inkwell.conf` |
| Service settings (auto-start) | `/etc/systemd/system/inkwell.service` |
