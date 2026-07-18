// Start: Phase 35 - Explicit ExecutionContext Global Shim (Fasal 4 TS strict)
// Fasal 4 (TS strict) + Fasal 11 (no external type drift).
// Deklarasi global ExecutionContext diiktiraf sebagai module + declare global
// supaya ctx.waitUntil() type-check lulus tanpa amaran di bawah raw serverless.
export {};
declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }
}
// End: Phase 35 - Explicit ExecutionContext Global Shim