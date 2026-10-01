#!/bin/bash
# Makes a backup of the database and the uploaded pictures into one file.
# Used on the server, see DEPLOY.md, step 13.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/inkwell/data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/inkwell}"
KEEP_DAYS="${KEEP_DAYS:-14}"

stamp=$(date +%Y-%m-%d_%H%M)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# A safe copy of the database, even while the site is running. It is made as
# the user that owns the database, so that no files owned by root are left
# behind in the data folder (the site could not open them).
owner=$(stat -c %U "$DATA_DIR/blog.db")
if [ "$(id -u)" = 0 ] && [ "$owner" != root ]; then
  chown "$owner" "$tmp"
  runuser -u "$owner" -- sqlite3 "$DATA_DIR/blog.db" ".backup '$tmp/blog.db'"
else
  sqlite3 "$DATA_DIR/blog.db" ".backup '$tmp/blog.db'"
fi
cp -a "$DATA_DIR/uploads" "$tmp/uploads"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/inkwell-$stamp.tar.gz" -C "$tmp" blog.db uploads
find "$BACKUP_DIR" -name 'inkwell-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup saved: $BACKUP_DIR/inkwell-$stamp.tar.gz"
