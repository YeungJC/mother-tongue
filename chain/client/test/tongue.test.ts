// The Mother Tongue program on LiteSVM: the rules the director's normal play doesn't exercise.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountRole, type KeyPairSigner, generateKeyPairSigner } from '@solana/kit';
import * as V from '../src/village.ts';
import { Sim } from '../lab/sim.ts';

const NO_MEMO = V.NO_MEMO;

async function rejects(p: Promise<unknown>, name: string) {
  await assert.rejects(p, (e: Error) => { assert.match(e.message, new RegExp(name)); return true; });
}

/** A running lifetime with `jobs` agents ([town, job] each), registered as founders. */
async function island(jobs: [number, number][], days = 5) {
  const sim = Sim.create();
  const admin = await sim.funded();
  const send = (ixs: Parameters<typeof sim.send>[1]) => sim.send(admin, ixs);
  const agents: KeyPairSigner[] = [];
  for (const [home, job] of jobs) {
    const w = await generateKeyPairSigner();
    await send([await V.getRegisterFounderInstructionAsync({ payer: admin, wallet: w, name: V.bytes24(`a${agents.length}`), brain: V.bytes32('test'), skillHash: new Uint8Array(32), owner: V.NOBODY, home, job })]);
    agents.push(w);
  }
  const id = 1;
  await send([await V.getCreateMatchInstructionAsync({ admin, id, seed: 1n, days, daySecs: 30 })]);
  const game = await V.matchPda(id);
  for (const w of agents) await send([await V.getJoinMatchInstructionAsync({ wallet: w, game })]);
  await send([V.getStartMatchInstruction({ admin, game })]);
  return { sim, admin, send, agents, game, id, m: () => sim.match(id) };
}

const W = V.TOWNS.indexOf('Wrenford');
const S = V.TOWNS.indexOf('Saltmere');

test('a job must belong to its town', async () => {
  const sim = Sim.create();
  const admin = await sim.funded();
  const w = await generateKeyPairSigner();
  await rejects(sim.send(admin, [await V.getRegisterFounderInstructionAsync({ payer: admin, wallet: w, name: V.bytes24('x'), brain: V.bytes32('t'), skillHash: new Uint8Array(32), owner: V.NOBODY, home: S, job: V.Job.Miner })]), 'BadJob');
});

test('the table: what you give is escrowed, what you want is only words', async () => {
  const { send, agents: [a, b, c], game, m } = await island([[W, V.Job.Farmer], [W, V.Job.Smith], [W, V.Job.Carpenter]]);
  const intent = await V.intentOf(V.Good.Tools, 2, 'salt');
  await send([V.getShowInstruction({ wallet: a, game, slot: 0, giveKind: V.Good.Food, giveQty: 3, intent, words: 'tavo rii' })]);
  let s = await m();
  assert.equal(s.agents[0].inv[V.Good.Food], 8 - 3, 'food is on the table, not in the hand');
  assert.equal(s.tables[0].maker, 0);
  assert.equal(s.tables[0].giveQty, 3);
  // Nothing on-chain says what the maker wants.
  assert.ok(!('wantKind' in s.tables[0]));

  // Bad words, own table, wrong good: refused.
  await rejects(send([V.getBidInstruction({ wallet: b, game, slot: 1, table: 0, kind: V.Good.Tools, qty: 1, words: 'Give Me Tools' })]), 'BadWords');
  await rejects(send([V.getBidInstruction({ wallet: a, game, slot: 0, table: 0, kind: V.Good.Tools, qty: 1, words: '' })]), 'BadTable');
  await rejects(send([V.getBidInstruction({ wallet: b, game, slot: 1, table: 0, kind: V.Good.Food, qty: 1, words: '' })]), 'BadBid');

  await send([V.getBidInstruction({ wallet: b, game, slot: 1, table: 0, kind: V.Good.Tools, qty: 2, words: 'kel kel' })]);
  await send([V.getBidInstruction({ wallet: c, game, slot: 2, table: 0, kind: V.Good.Planks, qty: 1, words: 'mo' })]);
  await rejects(send([V.getBidInstruction({ wallet: b, game, slot: 1, table: 0, kind: V.Good.Tools, qty: 1, words: '' })]), 'AlreadyBid');
  s = await m();
  assert.equal(s.agents[1].inv[V.Good.Tools], 0, 'bids are escrowed too');

  // Only the maker accepts; the taken bid swaps, the other goes back.
  const bid = s.bids.findIndex((x) => x.table === 0 && x.bidder === 1);
  await rejects(send([V.getAcceptInstruction({ wallet: b, game, slot: 1, table: 0, bid, words: '' })]), 'BadTable');
  await send([V.getAcceptInstruction({ wallet: a, game, slot: 0, table: 0, bid, words: 'su' })]);
  s = await m();
  assert.equal(s.agents[0].inv[V.Good.Tools], 2);
  assert.equal(s.agents[1].inv[V.Good.Food], 6 + 3);
  assert.equal(s.agents[2].inv[V.Good.Planks], 2, 'the losing bid went back');
  assert.ok(s.tables.every((t) => t.maker === V.NONE));
  assert.ok(s.bids.every((x) => x.table === V.NONE));
});

test('reject returns bids and keeps the table; the day end returns everything', async () => {
  const { send, agents: [a, b], game, m } = await island([[W, V.Job.Farmer], [W, V.Job.Smith]]);
  await send([V.getShowInstruction({ wallet: a, game, slot: 0, giveKind: V.Good.Food, giveQty: 2, intent: new Uint8Array(32), words: '' })]);
  await rejects(send([V.getShowInstruction({ wallet: a, game, slot: 0, giveKind: V.Good.Food, giveQty: 1, intent: new Uint8Array(32), words: '' })]), 'TableOpen');
  await send([V.getBidInstruction({ wallet: b, game, slot: 1, table: 0, kind: V.Good.Tools, qty: 1, words: '' })]);
  await send([V.getRejectInstruction({ wallet: a, game, slot: 0, table: 0, words: 'vek' })]);
  let s = await m();
  assert.equal(s.agents[1].inv[V.Good.Tools], 2, 'rejected bid returned');
  assert.equal(s.tables[0].rejects, 1, 'table still open');
  // Can't leave town with goods on the table.
  await rejects(send([V.getTravelInstruction({ wallet: a, game, slot: 0, dest: S, memo: NO_MEMO })]), 'TableOpen');
  await send([V.getRestInstruction({ wallet: a, game, slot: 0 }), V.getRestInstruction({ wallet: b, game, slot: 1 })]);
  await send([V.getAdvanceDayInstruction({ game })]);
  s = await m();
  assert.equal(s.agents[0].inv[V.Good.Food], 8 - 1, 'goods home, minus a day of eating');
  assert.ok(s.tables.every((t) => t.maker === V.NONE));
});

test('work only at home; one main action a day', async () => {
  const { send, agents: [a, b], game, m } = await island([[W, V.Job.Farmer], [S, V.Job.Woodcutter]]);
  await send([V.getWorkInstruction({ wallet: a, game, slot: 0, memo: NO_MEMO })]);
  await rejects(send([V.getWorkInstruction({ wallet: a, game, slot: 0, memo: NO_MEMO })]), 'AlreadyActed');
  await send([V.getTravelInstruction({ wallet: b, game, slot: 1, dest: W, memo: NO_MEMO })]);
  await send([V.getAdvanceDayInstruction({ game })]);
  const s = await m();
  assert.equal(s.agents[0].inv[V.Good.Food], 8 + 4 - 1);
  assert.equal(s.agents[1].location, W, 'Saltmere → Wrenford is one day');
  await rejects(send([V.getWorkInstruction({ wallet: b, game, slot: 1, memo: NO_MEMO })]), 'WrongPlace');
});

test('crafts use up their input; without it a work day yields nothing', async () => {
  const { send, agents: [smith, farmer], game, m } = await island([[W, V.Job.Smith], [W, V.Job.Farmer]]);
  let s = await m();
  assert.equal(s.agents[0].inv[V.Good.Ore], V.START_INPUT, 'a crafter starts with some input');
  for (let d = 0; d < 3; d++) {
    assert.deepEqual(V.workYield(s, 0), { kind: V.Good.Tools, qty: d < 2 ? 2 : 0 }, 'the TypeScript mirror agrees');
    await send([V.getWorkInstruction({ wallet: smith, game, slot: 0, memo: NO_MEMO }), V.getRestInstruction({ wallet: farmer, game, slot: 1 })]);
    await send([V.getAdvanceDayInstruction({ game })]);
    s = await m();
  }
  assert.equal(s.agents[0].inv[V.Good.Ore], 0, 'one ore per work day');
  assert.equal(s.agents[0].inv[V.Good.Tools], 2 + 2 + 2, 'two days of tools, then nothing without ore');
});

test('children: earned by place, signed by the parent, one life each', async () => {
  const { sim, admin, send, agents, game, m } = await island([[W, V.Job.Farmer], [W, V.Job.Smith], [S, V.Job.Farmer]], 5);
  for (let d = 0; d < 5; d++) {
    await send(agents.map((w, slot) => V.getRestInstruction({ wallet: w, game, slot })));
    await send([V.getAdvanceDayInstruction({ game })]);
  }
  const pdas = await Promise.all(agents.map((w) => V.contestantPda(w.address)));
  const fin = V.getFinalizeMatchInstruction({ game });
  await send([V.computeLimit(600_000), { ...fin, accounts: [...fin.accounts, ...pdas.map((address) => ({ address, role: AccountRole.WRITABLE }))] }]);
  const s = await m();
  assert.equal(s.status, V.MatchStatus.Finalized);
  // Three survivors: 12 seats shared out, best place first.
  const allowed = [0, 1, 2].map((p) => V.childrenAllowed(p, 3));
  assert.deepEqual(allowed, [4, 4, 4]);
  const best = s.ranking[0];
  const child = async (parentSlot: number, parent: KeyPairSigner, signer: KeyPairSigner = parent) => {
    const w = await generateKeyPairSigner();
    return sim.send(admin, [await V.getRegisterChildInstructionAsync({ payer: admin, wallet: w, parentWallet: signer, game, name: V.bytes24('kid'), brain: V.bytes32('t'), skillHash: new Uint8Array(32), owner: V.NOBODY, home: S, job: V.Job.Woodcutter, parentSlot })]);
  };
  // Someone else's key can't claim this parent's child.
  await rejects(child(best, agents[best], agents[(best + 1) % 3]), 'NotParent|ConstraintSeeds');
  for (let k = 0; k < allowed[0]; k++) await child(best, agents[best]);
  await rejects(child(best, agents[best]), 'NoChildrenLeft');
  const c = (await sim.svm.getAccount(await V.contestantPda(agents[best].address))) as unknown as { data: Uint8Array };
  const parent = V.getContestantDecoder().decode(c.data);
  assert.equal(parent.children, allowed[0]);
  assert.equal(parent.lived, true);
  // A contestant lives once.
  const again = 2;
  await send([await V.getCreateMatchInstructionAsync({ admin, id: again, seed: 2n, days: 5, daySecs: 30 })]);
  await rejects(send([await V.getJoinMatchInstructionAsync({ wallet: agents[0], game: await V.matchPda(again) })]), 'AlreadyLived');
});

test('places go by standing within a trade, not by raw wealth', async () => {
  const O = V.TOWNS.indexOf('Oakhollow');
  const { send, agents, game, m } = await island([[W, V.Job.Farmer], [W, V.Job.Carpenter], [O, V.Job.Carpenter]], 5);
  for (let d = 0; d < 5; d++) {
    // The Wrenford carpenter works; the other two rest. Carpenters are rich by trade.
    await send([V.getWorkInstruction({ wallet: agents[1], game, slot: 1, memo: NO_MEMO }), V.getRestInstruction({ wallet: agents[0], game, slot: 0 }), V.getRestInstruction({ wallet: agents[2], game, slot: 2 })]);
    await send([V.getAdvanceDayInstruction({ game })]);
  }
  const pdas = await Promise.all(agents.map((w) => V.contestantPda(w.address)));
  const fin = V.getFinalizeMatchInstruction({ game });
  await send([V.computeLimit(600_000), { ...fin, accounts: [...fin.accounts, ...pdas.map((address) => ({ address, role: AccountRole.WRITABLE }))] }]);
  const s = await m();
  const scores = Array.from(s.scores).slice(0, 3).map(Number);
  assert.ok(scores[2] > scores[0], 'the idle carpenter is still richer than the farmer');
  const ranking = Array.from(s.ranking).slice(0, 3);
  assert.deepEqual(ranking, [1, 0, 2], 'the farmer, alone in her trade, outranks the carpenter who did worse than his peer');
  assert.deepEqual(ranking, V.rankByStanding(scores, s.agents.slice(0, 3).map((a) => a.job), s.agents.slice(0, 3).map((a) => a.alive)), 'the TypeScript mirror agrees with the program');
});
