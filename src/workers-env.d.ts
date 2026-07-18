// Start: Phase 34 - Minimal Cloudflare Workers global type shim
// Fasal 4 (TS strict) + Fasal 11 (no external type drift).
// Deklarasi global ExecutionContext supaya ctx.waitUntil() type-check lulus
// tanpa menambah dependency @cloudflare/workers-types ke projek.
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
// End: Phase 34 - Minimal Cloudflare Workers global type shim