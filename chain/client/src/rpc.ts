import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
// Minimal Kit RPC plumbing for scripts and services.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  type Instruction,
  type KeyPairSigner,
  type Signature,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';

// A private RPC (e.g. Helius free devnet) in ~/.helius_rpc is used automatically: the
// public endpoint rate-limits a 40-villager world.
const PRIVATE_RPC = (() => {
  try { return readFileSync(`${homedir()}/.helius_rpc`, 'utf8').trim() || undefined; } catch { return undefined; }
})();
export const RPC_URL = process.env.RPC_URL ?? PRIVATE_RPC ?? 'https://api.devnet.solana.com';
export const WS_URL = process.env.WS_URL ?? (/127\.0\.0\.1|localhost/.test(RPC_URL) ? RPC_URL.replace(/^http/, 'ws').replace(/:(\d+)/, (_m, p) => `:${Number(p) + 1}`) : RPC_URL.replace(/^http/, 'ws'));
/** Which network we're on: data files are kept apart per cluster. */
export const CLUSTER = /devnet/.test(RPC_URL) ? 'devnet' : /127\.0\.0\.1|localhost/.test(RPC_URL) ? 'local' : 'devnet';

export const rpc = createSolanaRpc(RPC_URL);
export const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

/** The admin wallet: $SOLANA_KEYPAIR, else the Solana CLI's configured keypair
 *  (`solana config set --keypair ...`), else ~/.config/solana/id.json. */
export function defaultKeypairPath(): string {
  if (process.env.SOLANA_KEYPAIR) return process.env.SOLANA_KEYPAIR;
  try {
    const m = readFileSync(`${homedir()}/.config/solana/cli/config.yml`, 'utf8').match(/^keypair_path:\s*['"]?([^'"\n]+)['"]?\s*$/m);
    if (m) return m[1].trim().replace(/^~(?=\/)/, homedir());
  } catch { /* no CLI config: fall through */ }
  return `${homedir()}/.config/solana/id.json`;
}

export async function loadKeypair(path = defaultKeypairPath()): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let bhCache: { value: Awaited<ReturnType<ReturnType<typeof rpc.getLatestBlockhash>['send']>>['value']; at: number } | null = null;
/** Reuses a blockhash for 20 s (they stay valid for ~60 s); a retry always fetches a new one. */
async function freshBlockhash(force: boolean) {
  if (force || !bhCache || Date.now() - bhCache.at > 20_000) {
    const { value } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    bhCache = { value, at: Date.now() };
  }
  return bhCache.value;
}

/** Retries on rate limits (429) and transient network errors, with exponential backoff. */
export async function retry<T>(fn: () => Promise<T>, tries = 8): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String((e as Error)?.message ?? e) + JSON.stringify((e as { context?: unknown })?.context ?? '', (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      const transient = /429|Too Many Requests|fetch failed|ECONNRESET|ETIMEDOUT|block height exceeded|socket/i.test(msg);
      if (!transient || i >= tries - 1) throw e;
      await sleep(Math.min(15_000, 500 * 2 ** i) + Math.random() * 300);
    }
  }
}

/**
 * Sends and confirms, retrying transient failures. Before each resend it checks
 * whether a previous attempt actually landed (a 429 during *confirmation* must not
 * cause a duplicate send).
 */
export async function send(payer: KeyPairSigner, ixs: Instruction[]): Promise<Signature> {
  const sent: Signature[] = [];
  return retry(async () => {
    if (sent.length) {
      // A previous attempt may still be propagating: give it a few seconds to show up.
      for (let k = 0; k < 4; k++) {
        const { value } = await rpc.getSignatureStatuses(sent, { searchTransactionHistory: true }).send();
        const i = value.findIndex((s) => s && !s.err && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized'));
        if (i >= 0) return sent[i];
        if (value.some((s) => s && s.err)) break; // it landed and failed: a real error, resend to surface it
        await sleep(1500);
      }
    }
    const blockhash = await freshBlockhash(sent.length > 0);
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m),
    );
    const tx = await signTransactionMessageWithSigners(msg);
    const sig = getSignatureFromTransaction(tx);
    sent.push(sig);
    const t0 = Date.now();
    await sendAndConfirm(tx as Parameters<typeof sendAndConfirm>[0], { commitment: 'confirmed' });
    recordTx(Date.now() - t0, Object.keys(tx.signatures).length);
    return sig;
  });
}

export async function exists(address: Parameters<typeof rpc.getAccountInfo>[0]): Promise<boolean> {
  const { value } = await retry(() => rpc.getAccountInfo(address, { encoding: 'base64', commitment: 'confirmed' }).send());
  return value !== null;
}

// ---- live chain stats: confirmation time and fee per transaction we send ----
const TX_STATS = new URL(`../data/${CLUSTER}/tx-stats.jsonl`, import.meta.url).pathname;
function recordTx(ms: number, signers: number) {
  try {
    mkdirSync(dirname(TX_STATS), { recursive: true });
    appendFileSync(TX_STATS, JSON.stringify({ at: Date.now(), ms, fee: 5000 * signers }) + '\n');
  } catch { /* stats are best-effort */ }
}
