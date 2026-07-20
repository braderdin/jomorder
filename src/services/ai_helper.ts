// Start: Phase 68 - AI Helper Round-Robin Engine (Fasal 18 resilience)
// Baca senarai HELPER01-20 secara DINAMIK dari env (satu sumber benar).
// Skip model kosong + skip model dalam Redis cooldown jo:helper:fail:{model}.
// Round-robin dengan fallback ke model seterusnya. openrouter/free = last resort.
import { Env } from '../types';
import { getRedis, setRedis } from '../redis';

interface HelperModel {
  idx: number;
  name: string;
  ctx: number;
  out: number;
  reason: boolean;
  tool: boolean;
  vision: boolean;
}

const COOLDOWN_KEY = (m: string) => `jo:helper:fail:${m}`;
const COOLDOWN_TTL = 3600; // 1 jam

/** Parse satu entri MODEL_AI_HELPERxx -> HelperModel | null. */
function parseHelper(idx: number, raw: string | undefined): HelperModel | null {
  if (!raw || !raw.trim()) return null;
  const [namePart, traitPart] = raw.split('|');
  const name = (namePart || '').trim();
  if (!name) return null;
  const traits = (traitPart || '').toLowerCase();
  const num = (label: string): number => {
    const m = traits.match(new RegExp(`${label}:(\\d+)`));
    return m ? Number(m[1]) : 0;
  };
  const flag = (label: string): boolean => traits.includes(`${label}:yes`);
  return {
    idx,
    name,
    ctx: num('ctx'),
    out: num('out'),
    reason: flag('reason'),
    tool: flag('tool'),
    vision: flag('vision'),
  };
}

/** Bina senarai helper dari env secara dinamik. */
export function listHelpers(env: Env): HelperModel[] {
  const out: HelperModel[] = [];
  for (let i = 1; i <= 20; i++) {
    const key = `MODEL_AI_HELPER${String(i).padStart(2, '0')}` as keyof Env;
    const raw = env[key] as unknown as string | undefined;
    const m = parseHelper(i, raw);
    if (m) out.push(m);
  }
  return out;
}

/** Semak model dalam cooldown Redis. */
async function isCooledDown(env: Env, name: string): Promise<boolean> {
  try {
    const v = await getRedis(env, COOLDOWN_KEY(name));
    return Boolean(v);
  } catch {
    return false;
  }
}

/** Tandakan model gagal (masuk cooldown 1 jam). */
async function markFailed(env: Env, name: string): Promise<void> {
  try {
    await setRedis(env, COOLDOWN_KEY(name), '1', COOLDOWN_TTL);
  } catch {
    /* soft-fail */
  }
}

export interface HelperCallOpts {
  prompt: string;
  needReason?: boolean;
  needVision?: boolean;
  maxTokens?: number;
}

export interface HelperResult {
  ok: boolean;
  model?: string;
  text?: string;
  error?: string;
}

/**
 * callHelperRoundRobin
 * Loop HELPER01..20, pilih model pertama yang:
 *  - tak dalam cooldown
 *  - memenuhi trait (reason/vision) jika diminta
 *  - openrouter/free sebagai last resort
 * Pada error/timeout, markFailed + cuba model seterusnya.
 */
export async function callHelperRoundRobin(env: Env, opts: HelperCallOpts): Promise<HelperResult> {
  const helpers = listHelpers(env);
  if (helpers.length === 0) {
    return { ok: false, error: 'Tiada HELPER dikonfigurasi' };
  }
  // Susun: yang ada trait dulu, openrouter/free ke tepi
  const sorted = [...helpers].sort((a, b) => {
    const aLast = a.name.includes('openrouter/free') ? 1 : 0;
    const bLast = b.name.includes('openrouter/free') ? 1 : 0;
    return aLast - bLast;
  });
  let lastErr = '';
  for (const h of sorted) {
    if (opts.needReason && !h.reason) continue;
    if (opts.needVision && !h.vision) continue;
    if (await isCooledDown(env, h.name)) continue;
    try {
      const res = await fetch(`${env.BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY || 'sk-or-v1-dummy'}`,
        },
        body: JSON.stringify({
          model: h.name,
          messages: [{ role: 'user', content: opts.prompt }],
          max_tokens: opts.maxTokens || Math.min(h.out || 8000, 16000),
        }),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        await markFailed(env, h.name);
        continue;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content || '';
      return { ok: true, model: h.name, text };
    } catch (e) {
      lastErr = String(e);
      await markFailed(env, h.name);
    }
  }
  return { ok: false, error: lastErr || 'Semua HELPER gagal' };
}
// End: Phase 68 - AI Helper Round-Robin Engine