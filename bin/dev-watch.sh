#!/usr/bin/env bash
# Start: Phase 50 - Local Dev Watch Helper (bantu pantau worker + tsc)
# Jalankan wrangler dev di background + tsc --noEmit watch.
# Fail-safe: bukan chaining panjang; spawn wrangler sahaja.
set -e
echo "[dev-watch] Mulakan wrangler dev di port 8787..."
nohup npx wrangler dev --port 8787 > /tmp/jomorder-wrangler.log 2>&1 &
echo "[dev-watch] wrangler dev DIMULAKAN (pid $!). Log: /tmp/jomorder-wrangler.log"
echo "[dev-watch] Untuk hentikan: fuser -k 8787/tcp"
# End: Phase 50 - Local Dev Watch Helper