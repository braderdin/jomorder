#!/usr/bin/env bash
# Start: Supabase Direct DB Query Helper (Fasal 11 Native Binary Fallback)
# Fungsi: Agent boleh jalan SQL terus ke Supabase tanpa copy-paste ke SQL Editor.
# Penggunaan: ./bin/db-query.sh "SELECT 1;"   ATAU   ./bin/db-query.sh < fail.sql
# Secret diasingkan: DB_URL diambil dari .dev.vars (READ-ONLY) secara runtime, tidak di-hardcode.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_VARS="$ROOT/.dev.vars"

if [ ! -f "$DEV_VARS" ]; then
  echo "NO_DEV_VARS"
  exit 1
fi

# Parse DATABASE_URL_DIRECT_UNPOOLED (?pgbouncer=false) dari .dev.vars
DB_URL="$(sed -n 's/^DATABASE_URL_DIRECT_UNPOOLED=\(.*\)/\1/p' "$DEV_VARS" | tr -d '\"')"

if [ -z "$DB_URL" ]; then
  # Fallback ke DIRECT_URL_UNPOOLED
  DB_URL="$(sed -n 's/^DIRECT_URL_UNPOOLED=\(.*\)/\1/p' "$DEV_VARS" | tr -d '\"')"
fi

if [ -z "$DB_URL" ]; then
  echo "NO_DB_URL"
  exit 1
fi

export DB_URL
export NODE_OPTIONS="--dns-result-order=ipv4first"
# Resolve pg dari node_modules projek (Fasal 11: script compile ke /tmp but module di root)
export NODE_PATH="$ROOT/node_modules"

if [ "$#" -ge 1 ]; then
  # Argumen langsung = SQL string
  SQL="$1"
else
  # Tiada argumen = baca dari stdin (untuk fail .sql)
  SQL="$(cat)"
fi

# Compile + run standalone pg script (Fasal 11: tulis ke /tmp, jangan hardcode secret)
cat > "/tmp/db_query_run_$(date +%s%N).js" <<'EOF'
const { Client } = require('pg');
const sql = process.env.RUN_SQL;
(async () => {
  const client = new Client({ connectionString: process.env.DB_URL });
  try {
    await client.connect();
    const res = await client.query(sql);
    if (res.command === 'SELECT' || res.rows) {
      console.log(JSON.stringify(res.rows, null, 2));
    } else {
      console.log('OK|' + res.command + '|rowCount=' + res.rowCount);
    }
    await client.end(); // Pastikan sambungan ditutup
  } catch (e) {
    console.log('SQL_ERR|' + e.message.split('\n')[0]);
    process.exit(2);
  }
})();
EOF

RUN_SQL="$SQL" node "/tmp/db_query_run_$(date +%s%N).js"
# End: Supabase Direct DB Query Helper