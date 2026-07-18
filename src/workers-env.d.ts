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

// Start: Phase 36 - Advanced Serverless Routing Shims (Fasal 4 TS strict)
// Selamatkan type properties di bawah skop routing lanjutan (cron/scheduled
// + request router). Pastikan ScheduledController dan FetchHandler global
// diiktiraf supaya index.ts type-check lulus tanpa amaran external.
declare global {
  interface ScheduledController {
    cron: string;
    scheduledTime: number;
    noRetry(): void;
  }
  type FetchHandler = (
    request: Request,
    env: Record<string, unknown>,
    ctx: ExecutionContext
  ) => Response | Promise<Response>;

  // Start: Phase 37 - Global Env Binding Hardening (Fasal 11 + Fasal 4 SOA)
  // Cegah implicit any semasa event loop serverless: paksa fetch global &
  // structuredClone diiktiraf sebagai module standard Workers runtime.
  interface RequestInit {
    cf?: unknown;
  }
  interface CacheStorage {
    default: Cache;
  }
  // End: Phase 37 - Global Env Binding Hardening
}
// End: Phase 36 - Advanced Serverless Routing Shims
