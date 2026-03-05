#!/bin/bash
echo "=== Configurando backup automatico do Prosperus ==="

mkdir -p /var/backups/prosperus-mentor

cp /var/www/prosperus-mentor-diagnosis/scripts/backup-prosperus-db.sh /usr/local/bin/backup-prosperus-db.sh
chmod +x /usr/local/bin/backup-prosperus-db.sh

(crontab -l 2>/dev/null | grep -v prosperus; echo "0 3 * * * /usr/local/bin/backup-prosperus-db.sh >> /var/log/prosperus-backup.log 2>&1") | crontab -

/usr/local/bin/backup-prosperus-db.sh

echo ""
echo "=== Backup configurado com sucesso! ==="
echo "Agendado: todo dia as 3h da manha"
echo "Pasta: /var/backups/prosperus-mentor/"
ls -la /var/backups/prosperus-mentor/
