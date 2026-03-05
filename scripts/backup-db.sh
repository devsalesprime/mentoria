#!/bin/bash
# Daily SQLite backup — run via cron or PM2
DB_PATH="$(dirname "$0")/../data/prosperus.db"
BACKUP_DIR="$(dirname "$0")/../data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/prosperus_$TIMESTAMP.db'"

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/prosperus_*.db 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null

echo "Backup created: prosperus_$TIMESTAMP.db"
