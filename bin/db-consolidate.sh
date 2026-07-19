#!/usr/bin/env bash
# Start: Phase 55 - DB Consolidate Wrapper (auto-run 022 via postgres MCP)
# Fasal 11 (IPv4 pooler ?pgbouncer=false) + Fasal 11a (postgres MCP auto-execute).
# Fail ini compile SQL 022 ke node pg script di /tmp/ dan jalankan.
# READ-ONLY akses .dev.vars untuk connection string (Fasal 11 Strict Secret RO).
# End: Phase 55 - header

set -e
cd /home/braderdin/jomorder

# Parse Supabase connection dari .dev.vars (READ-ONLY, jangan edit).
SUPABASE_DB_URL=$(grep '^SUPABASE_DB_URL=' .dev.vars | cut -d'=' -f2- | tr -d '\"' || true)
if [ -z "$SUPABASE_DB_URL" ]; then
  # Fallback: build dari pooler IPv4 + service role (Fasal 11 IPv4 mandate).
  SUPABASE_DB_URL="postgresql://postgres:$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .dev.vars | cut -d'=' -f2- | tr -d '\"' | head -c 20)@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?pgbouncer=false"
fi

echo "[db-consolidate] Target: $SUPABASE_DB_URL" > /tmp/db022.log
echo "[db-consolidate] Running 022_consolidated_safe_drift_repair.sql ..." >> /tmp/db022.log

node -e '
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const url = process.env.SUPABASE_DB_URL;
const sql = fs.readFileSync("src/db/migrations/022_consolidated_safe_drift_repair.sql", "utf8");
(async () => {
  const c = new Client({ connectionString: url });
  try {
    await c.connect();
    await c.query(sql);
    console.log("MIGRATION_022_OK");
    fs.appendFileSync("/tmp/db022.log", "MIGRATION_022_OK\n");
  } catch (e) {
    console.error("MIGRATION_022_FAIL:", e.message);
    fs.appendFileSync("/tmp/db022.log", "MIGRATION_022_FAIL: " + e.message + "\n");
    process.exit(1);
  } finally {
    await c.end();
  }
})();
' SUPABASE_DB_URL="$SUPABASE_DB_URL" >> /tmp/db022.log 2>&1

echo "[db-consolidate] Done. See /tmp/db022.log"