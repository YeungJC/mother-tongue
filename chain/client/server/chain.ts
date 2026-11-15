// Where the director plays: the real program in-process on LiteSVM (instant, free, nothing kept;
// for testing and pre-running generations) or a real cluster over RPC (Surfpool or devnet).
// Same program, same instructions, same accounts either way.

import { type Address, type Instruction, type KeyPairSigner, generateKeyPairSigner } from '@solana/kit';
import * as V from '../src/village.ts';
import type { Contestant, Match } from '../src/state.ts';

export interface Chain {
  kind: 'litesvm' | 'rpc';
  /** Label for data folders: "litesvm", "local" or "devnet". */
  cluster: string;
  /** Pays every fee and rent. Agents' own keys only sign. */
  admin: KeyPairSigner;
  /** Sends one transaction (admin pays); throws with the program's error on failure. */
  send(ixs: Instruction[]): Promise<void>;
  match(id: number): Promise<Match | null>;
  /** Whether any account sits at match `id`'s address (an old tournament match counts). */
  matchTaken(id: number): Promise<boolean>;
  contestants(wallets: Address[]): Promise<Contestant[]>;
  /** An agent's keypair: kept on disk for a real cluster, throwaway on LiteSVM. */
  key(label: string): Promise<KeyPairSigner>;
}

export async function liteSvmChain(): Promise<Chain> {
  const { Sim } = await import('../lab/sim.ts');
  const sim = Sim.create();
  const admin = await sim.funded();
  const read = (address: Address) => {
    const a = sim.svm.getAccount(address) as { exists: boolean; data: Uint8Array; lamports: bigint };
    return a?.exists ? a : null; // LiteSVM returns { exists: false } for a missing account
  };
  return {
    kind: 'litesvm',
    cluster: 'litesvm',
    admin,
    send: async (ixs) => { await sim.send(admin, ixs); },
    match: async (id) => {
      const address = await V.matchPda(id);
      const acc = read(address);
      return acc ? { ...V.getMatchDecoder().decode(acc.data), address, lamports: BigInt(acc.lamports) } : null;
    },
    matchTaken: async (id) => read(await V.matchPda(id)) !== null,
    contestants: async (wallets) => {
      const out: Contestant[] = [];
      for (const w of wallets) {
        const address = await V.contestantPda(w);
        const acc = read(address);
        if (acc) out.push({ ...V.getContestantDecoder().decode(acc.data), address });
      }
      return out;
    },
    key: () => generateKeyPairSigner(),
  };
}

export async function rpcChain(): Promise<Chain> {
  const { CLUSTER, exists, loadKeypair, send } = await import('../src/rpc.ts');
  const { fetchContestants, fetchMatch } = await import('../src/state.ts');
  const { agentKey } = await import('./keys.ts');
  const admin = await loadKeypair();
  // Two identical instruction lists under the same recent blockhash are the same transaction
  // (a maker saying "vori" twice in a row): the network would drop the second as a duplicate. A
  // compute-limit instruction with a value that changes every send makes each one unique.
  let nonce = 0;
  const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
  return {
    kind: 'rpc',
    cluster: CLUSTER,
    admin,
    send: async (ixs) => {
      const unique = ixs.some((ix) => ix.programAddress === COMPUTE_BUDGET) ? ixs : [V.computeLimit(400_000 + (nonce++ % 100_000)), ...ixs];
      await send(admin, unique);
    },
    // Accounts left by the retired tournament have the old layout: not ours, never decode them.
    match: async (id) => ((await exists(await V.matchPda(id))) ? fetchMatch(id).catch(() => null) : null),
    matchTaken: async (id) => exists(await V.matchPda(id)),
    contestants: fetchContestants,
    key: (label) => agentKey(label),
  };
}

/** Sends instructions in batches (each signed by its own agents), up to `per` to a transaction.
 *  A batch over the 1232-byte transaction limit (several signers each) is split in half. */
export async function sendBatched(chain: Chain, ixs: Instruction[], per = 4) {
  const go = async (batch: Instruction[]): Promise<void> => {
    try {
      await chain.send(batch);
    } catch (e) {
      if (batch.length > 1 && /too large/i.test(String((e as Error)?.message ?? e))) {
        const h = Math.ceil(batch.length / 2);
        await go(batch.slice(0, h));
        await go(batch.slice(h));
      } else throw e;
    }
  };
  for (let i = 0; i < ixs.length; i += per) await go(ixs.slice(i, i + per));
}

/** The program's error name, from a failed transaction's logs or an RPC error. */
export function errorName(e: unknown): string {
  const s = String((e as Error)?.message ?? e) + JSON.stringify((e as { context?: unknown })?.context ?? '', (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  const m = s.match(/Error Code: (\w+)/) ?? s.match(/"name":"(\w+)"/);
  return m ? m[1] : s.slice(0, 200);
}
