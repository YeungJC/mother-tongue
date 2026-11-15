// Reading the tournament from chain. No getProgramAccounts (slow, rate-limited, and the program
// still owns the retired world's accounts): we know every address we need and batch-read them.
import type { Address } from '@solana/kit';
import * as V from './village.ts';
import { rpc, retry } from './rpc.ts';

export type Match = V.Match & { address: Address; lamports: bigint };
export type Contestant = V.Contestant & { address: Address };

const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));

async function many(addresses: Address[]) {
  const out: ({ data: Uint8Array; lamports: bigint } | null)[] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    const { value } = await retry(() => rpc.getMultipleAccounts(addresses.slice(i, i + 100), { encoding: 'base64', commitment: 'confirmed' }).send());
    out.push(...value.map((v) => (v ? { data: bytes(v.data[0]), lamports: BigInt(v.lamports) } : null)));
  }
  return out;
}

/** One match: a single, cheap account read. */
export async function fetchMatch(id: number): Promise<Match | null> {
  const address = await V.matchPda(id);
  const { value } = await retry(() => rpc.getAccountInfo(address, { encoding: 'base64', commitment: 'confirmed' }).send());
  if (!value) return null;
  return { ...V.getMatchDecoder().decode(bytes(value.data[0])), address, lamports: BigInt(value.lamports) };
}

export async function fetchMatches(ids: number[]): Promise<Match[]> {
  const addrs = await Promise.all(ids.map((id) => V.matchPda(id)));
  const raw = await many(addrs);
  return raw.flatMap((r, i) => (r ? [{ ...V.getMatchDecoder().decode(r.data), address: addrs[i], lamports: r.lamports }] : []));
}

/** Contestant accounts for the given contestant wallets (missing ones are skipped). */
export async function fetchContestants(wallets: Address[]): Promise<Contestant[]> {
  const addrs = await Promise.all(wallets.map((w) => V.contestantPda(w)));
  const raw = await many(addrs);
  return raw.flatMap((r, i) => (r ? [{ ...V.getContestantDecoder().decode(r.data), address: addrs[i] }] : []));
}

/** Highest match id that exists, probing upwards from `from` (ids are sequential). */
export async function latestMatchId(from = 1): Promise<number> {
  let last = from - 1;
  for (;;) {
    const ids = Array.from({ length: 20 }, (_, k) => last + 1 + k);
    const found = await fetchMatches(ids);
    if (!found.length) return last;
    last = Math.max(...found.map((m) => m.id));
    if (found.length < 20) return last;
  }
}
