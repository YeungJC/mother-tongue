// Shared compute-market constants and the agent-side paying client.
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { toClientSvmSigner } from '@x402/svm';
import type { KeyPairSigner } from '@solana/kit';
import { RPC_URL } from '../src/rpc.ts';

/** CAIP-2 id for Solana devnet. */
export const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
/** Circle's devnet USDC (6 decimals). */
export const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;

export const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:8402';

/** Paid thinking, one tier per model family so contestants can be pinned to a model. Each tier
 *  falls back to similar free models when its first choice is rate-limited (server/llm.ts). */
export const TIERS = {
  lite: { model: 'gemini-flash-lite', priceMicroUsdc: 1_000, maxTokens: 1_200 }, // $0.001
  flash: { model: 'gemini-flash', priceMicroUsdc: 2_000, maxTokens: 1_500 }, // $0.002
  gemma: { model: 'gemma-4', priceMicroUsdc: 1_000, maxTokens: 3_000 }, // $0.001
} as const;
export type Tier = keyof typeof TIERS;

/** Saying a line aloud: flat price per line (the audio is only synthesised if someone listens). */
export const SPEAK_PRICE_MICRO_USDC = 2_000; // $0.002

/** A fetch that pays the gateway from this agent's own USDC. */
export function payingFetch(wallet: KeyPairSigner) {
  // Pass our RPC explicitly: the default is the public devnet endpoint, whose rate
  // limits stalled every paid thought (and pointed local runs at the wrong cluster).
  const client = new x402Client().register(DEVNET, new ExactSvmScheme(toClientSvmSigner(wallet as never), { rpcUrl: RPC_URL }));
  return wrapFetchWithPayment(fetch, client);
}

export interface ThinkResult {
  text: string;
  logHash: string | null;
  tier: Tier;
  costMicroUsdc: number;
  model: string;
  tokens: number;
  ms: number;
}

/** At most PAY_CONCURRENCY payments in flight: each one makes several RPC calls, and eight
 *  agents paying at once got rate-limited (429) on the public devnet RPC. */
const PAY_CONCURRENCY = Number(process.env.PAY_CONCURRENCY ?? 2);
let inFlight = 0;
const waiting: (() => void)[] = [];
async function queued<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= PAY_CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try { return await fn(); } finally { inFlight--; waiting.shift()?.(); }
}

/** Retries a paid call when the chain RPC or the gateway is momentarily rate-limited. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (i >= 5 || !/429|Too Many|402|fetch failed|timed out/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, [3000, 6000, 12000, 20000, 30000][i] + Math.random() * 2000));
    }
  }
}

export function think(pay: ReturnType<typeof payingFetch>, agent: string, tier: Tier, messages: { role: string; content: string }[]): Promise<ThinkResult> {
  return withRetry(() => queued(() => thinkOnce(pay, agent, tier, messages)));
}

async function thinkOnce(pay: ReturnType<typeof payingFetch>, agent: string, tier: Tier, messages: { role: string; content: string }[]): Promise<ThinkResult> {
  const t0 = Date.now();
  const res = await pay(`${GATEWAY_URL}/v1/chat/${tier}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent': agent },
    body: JSON.stringify({ messages, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${paymentError(res) ?? (await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string; usage?: { total_tokens?: number } };
  return { text: body.choices?.[0]?.message?.content ?? '', logHash: res.headers.get('x-log-hash'), tier, costMicroUsdc: TIERS[tier].priceMicroUsdc, model: body.model ?? tier, tokens: Number(body.usage?.total_tokens ?? 0), ms: Date.now() - t0 };
}

/** Pays the gateway to voice a line; returns its hash (audio at GET /audio/:hash.mp3). */
export async function speak(pay: ReturnType<typeof payingFetch>, agent: string, voice: string, text: string): Promise<string> {
  const res = await queued(() => pay(`${GATEWAY_URL}/v1/speak`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent': agent },
    body: JSON.stringify({ voice, text }),
  }));
  if (!res.ok) throw new Error(`speak ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json()) as { hash: string }).hash;
}

/** x402 puts the reason a payment was refused in the PAYMENT-REQUIRED header. */
function paymentError(res: Response): string | null {
  const h = res.headers.get('payment-required');
  if (!h) return null;
  try {
    const j = JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
    return `payment refused: ${j.error ?? 'unknown'}`;
  } catch {
    return null;
  }
}
