#!/bin/bash
BACKUP_DIR="/var/backups/prosperus-mentor"
DB_PATH="/var/www/prosperus-mentor-diagnosis/data/prosperus.db"
DATE=$(date +%Y-%m-%d_%H%M)

sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/prosperus_${DATE}.db'"

ls -t ${BACKUP_DIR}/prosperus_*.db | tail -n +31 | xargs rm -f 2>/dev/null

echo "[$(date)] Backup realizado: prosperus_${DATE}.db"
