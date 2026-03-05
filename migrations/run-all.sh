#!/bin/bash
# ============================================
# Prosperus DB Migration Runner — v1.x → v2.0
# ============================================
# Usage: bash migrations/run-all.sh
# Prerequisites: sqlite3 CLI, server stopped
# ============================================

set -e  # Exit on any error

DB_PATH="data/prosperus.db"
BACKUP_PATH="data/prosperus-backup-$(date +%Y%m%d-%H%M%S).db"

echo "============================================"
echo "  Prosperus DB Migration v1.x → v2.0"
echo "============================================"
echo ""

# Check DB exists
if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH"
  echo "Run this script from the mentoria-main directory."
  exit 1
fi

# Check sqlite3 available
if ! command -v sqlite3 &> /dev/null; then
  echo "ERROR: sqlite3 CLI not found. Install it first."
  exit 1
fi

# Create backup
echo "[1/12] Creating backup..."
cp "$DB_PATH" "$BACKUP_PATH"
echo "  Backup saved to: $BACKUP_PATH"
echo "  Size: $(ls -lh "$BACKUP_PATH" | awk '{print $5}')"

# Run migrations
echo ""
echo "[2/12] Running 001_pre_check.sql..."
sqlite3 "$DB_PATH" < migrations/001_pre_check.sql
echo ""

echo "[3/12] Running 002_backup_legacy_data.sql..."
sqlite3 "$DB_PATH" < migrations/002_backup_legacy_data.sql

echo "[4/12] Running 003_add_users_updated_at.sql..."
sqlite3 "$DB_PATH" < migrations/003_add_users_updated_at.sql

echo "[5/12] Running 004_recreate_diagnostic.sql..."
sqlite3 "$DB_PATH" < migrations/004_recreate_diagnostic.sql

echo "[6/12] Running 005_recreate_pipeline.sql..."
sqlite3 "$DB_PATH" < migrations/005_recreate_pipeline.sql

echo "[7/12] Running 006_recreate_audio.sql..."
sqlite3 "$DB_PATH" < migrations/006_recreate_audio.sql

echo "[8/12] Running 007_recreate_files.sql..."
sqlite3 "$DB_PATH" < migrations/007_recreate_files.sql

echo "[9/12] Running 008_drop_legacy_tables.sql..."
sqlite3 "$DB_PATH" < migrations/008_drop_legacy_tables.sql

echo "[10/12] Running 009_create_indexes.sql..."
sqlite3 "$DB_PATH" < migrations/009_create_indexes.sql

echo "[11/12] Running 010_create_triggers.sql..."
sqlite3 "$DB_PATH" < migrations/010_create_triggers.sql

echo ""
echo "[12/12] Running 011_post_verify.sql..."
sqlite3 "$DB_PATH" < migrations/011_post_verify.sql

echo ""
echo "============================================"
echo "  Migration Complete!"
echo "============================================"
echo "  Backup at: $BACKUP_PATH"
echo "  To rollback: cp $BACKUP_PATH $DB_PATH"
echo ""
echo "  NEXT STEPS:"
echo "  1. Update server.cjs (see migration-plan.md Section 8)"
echo "  2. Start the server: node server.cjs"
echo "  3. Test: curl http://localhost:3005/health"
echo "============================================"
