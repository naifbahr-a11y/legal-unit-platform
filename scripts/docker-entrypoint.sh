#!/bin/sh
set -e

echo "[entrypoint] Waiting for database..."
TRIES=0
until node -e "
const mysql = require('mysql2/promise');
mysql.createConnection(process.env.DATABASE_URL)
  .then(c => c.ping().then(() => c.end()))
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
" 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge 30 ]; then
    echo "[entrypoint] Database not ready after 60s"
    exit 1
  fi
  sleep 2
done

if [ -f "scripts/apply-pending-migrations.mjs" ]; then
  echo "[entrypoint] Applying migrations..."
  node scripts/apply-pending-migrations.mjs || echo "[entrypoint] Migration warning"
fi

if [ "$SEED_ADMIN_ON_START" = "1" ] && [ -f "scripts/seed-admin.mjs" ]; then
  echo "[entrypoint] Seeding admin (if missing)..."
  node scripts/seed-admin.mjs || echo "[entrypoint] Seed warning"
fi

echo "[entrypoint] Starting application..."
exec node dist/index.js
