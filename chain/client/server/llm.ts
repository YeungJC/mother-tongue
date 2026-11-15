// One upstream LLM caller for everything off-chain (gateway, commentator, analyst).
// Free models only, from any provider whose key file exists:
//   ~/.groq_key        Groq (fast open models: Llama, GPT-OSS, Qwen)       model ids "groq/<id>"
//   ~/.gemini_key      Google AI Studio (Gemini, Gemma)                     model ids "<id>"
//   ~/.cerebras_key    Cerebras (optional extra free capacity)              model ids "cerebras/<id>"
// Automatic fallback when a model is overloaded (5xx) or rate-limited (429), and a shared
// per-minute budget so the tournament can't exhaust a free tier in one burst.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

interface Provider { url: string; keyFile: string }
const PROVIDERS: Record<string, Provider> = {
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', keyFile: '.gemini_key' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', keyFile: '.groq_key' },
  cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions', keyFile: '.cerebras_key' },
};
const keys = new Map<string, string | null>();
function keyOf(p: string): string | null {
  if (!keys.has(p)) {
    const f = `${homedir()}/${PROVIDERS[p].keyFile}`;
    keys.set(p, existsSync(f) ? readFileSync(f, 'utf8').trim() || null : null);
  }
  return keys.get(p)!;
}
const split = (m: string) => (m.includes('/') && PROVIDERS[m.split('/')[0]] ? { provider: m.split('/')[0], model: m.slice(m.indexOf('/') + 1) } : { provider: 'gemini', model: m });
export const available = (m: string) => !!keyOf(split(m).provider);

/** Fallback chains, best first; models whose provider has no key are skipped.
 *  Tiers: "lite" = the shared workhorse every strategy archetype uses (so strategy is the only
 *  variable between them), "flash" = a stronger model, "gemma" = a different open model. */
const ALL_CHAINS = {
  lite: ['gemini-3.1-flash-lite', 'groq/openai/gpt-oss-20b', 'gemini-flash-lite-latest', 'groq/qwen/qwen3.8-27b', 'gemma-4-26b-a4b-it'],
  flash: ['groq/openai/gpt-oss-120b', 'gemini-flash-latest', 'gemini-3.5-flash', 'groq/openai/gpt-oss-20b', 'gemma-4-31b-it'],
  gemma: ['groq/qwen/qwen3.8-27b', 'gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'groq/openai/gpt-oss-20b'],
  quick: ['gemini-3.1-flash-lite', 'groq/openai/gpt-oss-20b', 'gemini-flash-lite-latest', 'gemma-4-26b-a4b-it'],
  deliberate: ['groq/openai/gpt-oss-120b', 'gemini-flash-latest', 'gemini-3.5-flash', 'groq/openai/gpt-oss-20b', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it'],
} as const;
export type Chain = keyof typeof ALL_CHAINS;
export const CHAINS = Object.fromEntries(Object.entries(ALL_CHAINS).map(([k, v]) => [k, v.filter(available)])) as unknown as Record<Chain, readonly string[]>;
/** The model a tier will try first, for labels ("llama-3.3-70b · trader"). */
export const primaryModel = (c: Chain) => (CHAINS[c][0] ?? ALL_CHAINS[c][0]).split('/').pop()!.replace(/-versatile|-it$|-latest$|-instruct$/g, '');

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export interface LlmResult { text: string; model: string; raw: unknown; usage?: { prompt: number; completion: number }; ms?: number }
const usageOf = (raw: any) => (raw?.usage ? { prompt: Number(raw.usage.prompt_tokens ?? 0), completion: Number(raw.usage.completion_tokens ?? 0) } : undefined);

/** Requests per minute we allow ourselves across all models (env LLM_RPM). */
const RPM = Number(process.env.LLM_RPM ?? 40);
const stamps: number[] = [];
const cooldown = new Map<string, number>(); // model → retry-after epoch ms

export class BudgetExceeded extends Error {}

function takeBudget() {
  const now = Date.now();
  while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
  if (stamps.length >= RPM) throw new BudgetExceeded('LLM budget for this minute is spent');
  stamps.push(now);
}

const isGemma = (m: string) => split(m).model.startsWith('gemma');

export async function chat(chain: Chain, messages: Msg[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<LlmResult> {
  takeBudget();
  const models = CHAINS[chain];
  if (!models.length) throw new Error(`no LLM provider key for ${chain} (add ~/.groq_key or ~/.gemini_key)`);
  // If every model is cooling down after a rate limit, wait for the first to come back (≤65 s).
  const soonest = Math.min(...models.map((m) => cooldown.get(m) ?? 0));
  if (soonest > Date.now()) await new Promise((r) => setTimeout(r, Math.min(65_000, soonest - Date.now() + 500)));
  let lastErr = '';
  for (const id of models) {
    if ((cooldown.get(id) ?? 0) > Date.now()) continue;
    const { provider, model } = split(id);
    // Gemma on Google's endpoint takes no system role and no JSON mode: fold them into the prompt.
    const msgs: Msg[] = isGemma(id)
      ? [{ role: 'user', content: messages.map((m) => (m.role === 'system' ? `Instructions:\n${m.content}` : m.content)).join('\n\n') + (opts.json ? '\n\nReply with only a JSON object.' : '') }]
      : messages;
    // Thinking models reason before answering: give them room so the JSON isn't cut off.
    const thinks = isGemma(id) || model.includes('gpt-oss') || model.includes('qwen3');
    const body: Record<string, unknown> = { model, messages: msgs, max_tokens: thinks ? Math.max(3000, opts.maxTokens ?? 900) : opts.maxTokens ?? 900 };
    if (opts.json && !isGemma(id)) body.response_format = { type: 'json_object' };
    if (provider === 'groq' && model.includes('qwen3')) body.reasoning_format = 'hidden';
    // gpt-oss reasons at length before answering (~2k hidden tokens a call): free tiers cap tokens per day.
    if (model.includes('gpt-oss')) body.reasoning_effort = 'low';
    try {
      const res = await fetch(PROVIDERS[provider].url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${keyOf(provider)}` }, body: JSON.stringify(body) });
      if (res.status === 429 || res.status >= 500) {
        const quota = res.status === 429 && /quota|per day|RPD|TPD/i.test(await res.text().catch(() => ''));
        cooldown.set(id, Date.now() + (quota ? 30 * 60_000 : res.status === 429 ? 60_000 : 20_000));
        lastErr = `${id} ${res.status}${quota ? ' (daily quota)' : ''}`;
        continue;
      }
      const raw = await res.json();
      if (!res.ok) {
        if (res.status === 404 || res.status === 400) cooldown.set(id, Date.now() + 3_600_000); // not available to this key
        lastErr = `${id} ${res.status} ${JSON.stringify(raw).slice(0, 160)}`;
        continue;
      }
      const text = (raw as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
      return { text, model: id, raw, usage: usageOf(raw) };
    } catch (e) {
      lastErr = `${id} ${String((e as Error).message ?? e).slice(0, 100)}`;
    }
  }
  throw new Error(`all models failed: ${lastErr}`);
}

/**
 * One specific model, no fallback: for experiments, where silently swapping models would
 * confound the comparison. Waits out per-minute rate limits (free tiers allow ~8k tokens/min)
 * instead of moving on; gives up only on a daily quota or after `tries`.
 */
export async function chatPinned(id: string, messages: Msg[], opts: { json?: boolean; maxTokens?: number; tries?: number } = {}): Promise<LlmResult> {
  const { provider, model } = split(id);
  if (!keyOf(provider)) throw new Error(`no key for ${provider}`);
  const msgs: Msg[] = isGemma(id)
    ? [{ role: 'user', content: messages.map((m) => (m.role === 'system' ? `Instructions:\n${m.content}` : m.content)).join('\n\n') + (opts.json ? '\n\nReply with only a JSON object.' : '') }]
    : messages;
  const thinks = isGemma(id) || model.includes('gpt-oss') || model.includes('qwen3');
  const body: Record<string, unknown> = { model, messages: msgs, max_tokens: thinks ? Math.max(3000, opts.maxTokens ?? 900) : opts.maxTokens ?? 900 };
  if (opts.json && !isGemma(id)) body.response_format = { type: 'json_object' };
  if (provider === 'groq' && model.includes('qwen3')) body.reasoning_format = 'hidden';
  if (model.includes('gpt-oss')) body.reasoning_effort = 'low';
  let last = '';
  for (let k = 0; k < (opts.tries ?? 12); k++) {
    const t0 = Date.now();
    try {
      const res = await fetch(PROVIDERS[provider].url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${keyOf(provider)}` }, body: JSON.stringify(body) });
      if (res.ok) {
        const raw = await res.json();
        const text = (raw as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
        if (text.trim()) return { text, model: id, raw, usage: usageOf(raw), ms: Date.now() - t0 };
        last = 'empty reply';
      } else {
        const err = await res.text().catch(() => '');
        last = `${res.status} ${err.slice(0, 160)}`;
        if (res.status === 429 && /per day|RPD|TPD|quota/i.test(err)) throw new Error(`${id} daily quota: ${err.slice(0, 120)}`);
        if (res.status === 400 && /json_validate_failed|failed to generate/i.test(err)) { /* retry: model produced bad JSON */ }
        else if (res.status !== 429 && res.status < 500) throw new Error(`${id} ${last}`);
        const after = Number(res.headers.get('retry-after')) || 0;
        await new Promise((r) => setTimeout(r, Math.min(60_000, Math.max(after * 1000, 2000 * 2 ** Math.min(k, 4))) + Math.random() * 1000));
        continue;
      }
    } catch (e) {
      if (/daily quota|^\S+ 4\d\d/.test(String((e as Error).message))) throw e;
      last = String((e as Error).message ?? e).slice(0, 160);
    }
    await new Promise((r) => setTimeout(r, 2000 * (k + 1)));
  }
  throw new Error(`${id} failed: ${last}`);
}

/** Parses a JSON object out of model text (tolerates code fences, preambles and thinking). */
export function parseJson<T = Record<string, unknown>>(text: string): T {
  const t = text.replace(/<(thought|think)>[\s\S]*?<\/\1>/gi, '').replace(/```(json)?/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t) as T;
}
