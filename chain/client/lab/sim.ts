// The lab's chain: the real village program (target/deploy/village.so) running in-process on
// LiteSVM. Same rules, same instructions, same accounts as devnet, but instant, free and
// deterministic: with the slot pinned at 0 the match seed is exactly the one we choose, so an
// experiment can replay the identical island with one thing changed.
import { fileURLToPath } from 'node:url';
import {
  type Instruction, type KeyPairSigner, appendTransactionMessageInstructions, createTransactionMessage, generateKeyPairSigner,
  lamports, pipe, setTransactionMessageFeePayerSigner, signTransactionMessageWithSigners,
} from '@solana/kit';
import { FailedTransactionMetadata, LiteSVM } from 'litesvm';
import * as V from '../src/village.ts';
import type { Match } from '../src/state.ts';

const SO = process.env.VILLAGE_SO ?? fileURLToPath(new URL('../../target/deploy/village.so', import.meta.url)); // VILLAGE_SO: a program variant (RESEARCH.md §10)

export class Sim {
  private constructor(readonly svm: LiteSVM) {}

  static create(): Sim {
    const svm = new LiteSVM();
    svm.addProgramFromFile(V.VILLAGE_PROGRAM_ADDRESS, SO);
    const c = svm.getClock();
    c.slot = 0n; // seed ^ slot·k = seed
    svm.setClock(c);
    return new Sim(svm);
  }

  async funded(): Promise<KeyPairSigner> {
    const k = await generateKeyPairSigner();
    this.svm.airdrop(k.address, lamports(100_000_000_000n));
    return k;
  }

  /** Sends one transaction; failures throw with the program logs (so errorName() works). */
  send = async (payer: KeyPairSigner, ixs: Instruction[]) => {
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => this.svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
      (m) => appendTransactionMessageInstructions(ixs, m),
    );
    const res = this.svm.sendTransaction(await signTransactionMessageWithSigners(msg));
    this.svm.expireBlockhash();
    if (res instanceof FailedTransactionMetadata) throw new Error(`tx failed: ${res.meta().logs().join('\n')}`);
    return res;
  };

  async match(id: number): Promise<Match> {
    const address = await V.matchPda(id);
    const acc = this.svm.getAccount(address) as { data: Uint8Array; lamports: bigint } | null;
    if (!acc) throw new Error(`no match ${id}`);
    return { ...V.getMatchDecoder().decode(acc.data), address, lamports: BigInt(acc.lamports) };
  }
}
