// Start: Live DB connection check (Fasal 2 Output Capture Guard)
const { Client } = require('pg');
const fs = require('fs');
const connStr = 'postgresql://postgres:Sakurasasuke11%40%40@db.mafoxsvnfxqoujvotsfi.supabase.co:5432/postgres';
const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 15000 });
(async () => {
  try {
    await client.connect();
    const res = await client.query('SELECT 1 AS conn_ok;');
    fs.writeFileSync('/tmp/pg_test.log', 'CONNECTED\n' + JSON.stringify(res.rows) + '\n');
    await client.end();
    process.exit(0);
  } catch (e) {
    fs.writeFileSync('/tmp/pg_test.log', 'FAILED\n' + String(e.message).split('\n')[0] + '\n');
    process.exit(1);
  }
})();
// End: Live DB connection check