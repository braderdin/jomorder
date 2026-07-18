// Start: Phase 35 - Explicit ExecutionContext Global Shim (Fasal 4 TS strict)
// Fasal 4 (TS strict) + Fasal 11 (no external type drift).
// Deklarasi global ExecutionContext diiktiraf sebagai module + declare global
// supaya ctx.waitUntil() type-check lulus tanpa amaran di bawah raw serverless.
export {};
import type { Env } from './types';
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

// Start: Phase 38 - Global Worker Runtime Variable Standardization (Fasal 4 strict)
// Seragamkan pembolehubah global Cloudflare supaya implicit any / execution error
// dapat dipintas semasa type-check. peta Env sebenar + cf metadata pada Request.
declare global {
  // Alias Env sebenar supaya handler tidak guna Record<string, unknown> longgar.
  type WorkerEnv = Env;

  // Cf metadata pada setiap Request (colo/country) untuk telemetri + routing geo.
  interface Request {
    cf?: {
      colo: string;
      country?: string;
      city?: string;
      clientTcpRtt?: number;
      asOrganization?: string;
      timezone?: string;
    };
  }

  // Global self typing untuk Worker entry (ctx + env terikat).
  interface WorkerGlobalScope {
    addEventListener(
      type: 'fetch',
      handler: (event: { request: Request; respondWith(r: Response | Promise<Response>): void }) => void
    ): void;
  }
}
// End: Phase 38 - Global Worker Runtime Variable Standardization
