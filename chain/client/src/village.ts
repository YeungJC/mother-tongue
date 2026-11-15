// Hand-written helpers on top of the Codama-generated client (src/generated), plus a TypeScript
// mirror of the rules (LANGUAGE.md, programs/village/src) for the director, indexer and viewer.

import { type Address, type Instruction, getAddressEncoder, getProgramDerivedAddress, getU32Encoder } from '@solana/kit';
import { type AgentSlot, type Match, VILLAGE_PROGRAM_ADDRESS } from './generated/index.ts';

export * from './generated/index.ts';

// ---- mirrors constants.rs ----
export const MAX_AGENTS = 12;
export const Good = { Food: 0, Wood: 1, Ore: 2, Tools: 3, Planks: 4 } as const;
export const GOODS = ['food', 'wood', 'ore', 'tools', 'planks'] as const;
export const VALUES = [2, 3, 4, 3, 9];
export const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere'] as const;
export const TRAVEL = [[0, 2, 2, 1], [2, 0, 3, 2], [2, 3, 0, 3], [1, 2, 3, 0]];
export const Job = { Farmer: 0, Woodcutter: 1, Miner: 2, Smith: 3, Carpenter: 4 } as const;
export const JOBS = ['farmer', 'woodcutter', 'miner', 'smith', 'carpenter'] as const;
export const JOB_GOOD = [0, 1, 2, 3, 4];
export const JOB_YIELD = [4, 3, 2, 2, 1];
/** Mirrors JOB_INPUT: what a day's work uses up (smith ore, carpenter wood); NO_INPUT for none. */
export const NO_INPUT = 255;
// NO_CRAFTS=1 must match a program without inputs (village.pre-crafts.so; RESEARCH.md §10 exploration).
export const JOB_INPUT = process.env.NO_CRAFTS === '1' ? [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT] : [NO_INPUT, NO_INPUT, NO_INPUT, 2, 1];
export const START_INPUT = 2;
/** Jobs per town, in the order a town hands them out. Ore is only mined in Ironcrag. */
// LAYOUT=balanced must match a program built with `--features balanced` (RESEARCH.md §10).
export const TOWN_JOBS: number[][] = process.env.LAYOUT === 'balanced'
  ? [[0, 4, 1], [1, 4, 0], [2, 3, 0], [2, 3, 0]]
  : [[0, 4, 3], [1, 4, 0], [2, 3, 0], [0, 1]];
export const Building = { Empty: 0, Workshop: 1, Manor: 2 } as const;
export const BUILDINGS = ['empty', 'workshop', 'manor'] as const;
export const BUILDING_VALUE = [0, 40, 150];
export const BUILD_COST: Record<number, number[]> = { 1: [0, 0, 0, 2, 4], 2: [0, 0, 6, 6, 8] };
export const CHILDREN_BY_PLACE = [3, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0];
/** Mirrors state.rs children_allowed: by place among the survivors; refills the island to 12. */
export function childrenAllowed(place: number, survivors: number): number {
  if (place >= survivors) return 0;
  if (survivors >= 8) return CHILDREN_BY_PLACE[place];
  const spare = MAX_AGENTS - survivors;
  const top = Math.min(3, survivors);
  return 1 + (place < top ? Math.floor(spare / top) + (place < spare % top ? 1 : 0) : 0);
}
/** Mirrors state.rs standing: wealth ÷ the mean wealth of the living agents in the same trade, ×1000. */
export function standing(scores: number[], jobs: number[], alive: boolean[]): number[] {
  return scores.map((s, i) => {
    if (!alive[i] || s <= 0) return 0;
    let sum = 0, cnt = 0;
    for (let j = 0; j < scores.length; j++) if (alive[j] && jobs[j] === jobs[i]) { sum += Math.max(0, scores[j]); cnt++; }
    return Math.floor((s * 1000 * cnt) / sum);
  });
}
/** Mirrors state.rs rank_by_standing: slots best first, by standing, then wealth, then slot. */
export function rankByStanding(scores: number[], jobs: number[], alive: boolean[]): number[] {
  const st = standing(scores, jobs, alive);
  return scores.map((_, i) => i).sort((a, b) => st[b] - st[a] || scores[b] - scores[a] || a - b);
}
export const MatchStatus = { Open: 0, Running: 1, Ended: 2, Finalized: 3 } as const;
export const EventKind = { Drought: 0, Boom: 1, Frost: 2, Storm: 3 } as const;
export const EVENTS = ['drought', 'boom', 'frost', 'storm'] as const;
export const NONE = 255;
export const NOBODY = '11111111111111111111111111111111' as Address;
export const HUNGER_LIMIT = 3;
export const MAX_WORDS = 48;

const te = new TextEncoder();
const td = new TextDecoder();

/** Fixed-size, zero-padded string fields. */
export function bytesN(s: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  out.set(te.encode(s).slice(0, n));
  return out;
}
export const bytes24 = (s: string) => bytesN(s, 24);
export const bytes32 = (s: string) => bytesN(s, 32);
export function strN(b: ArrayLike<number>): string {
  const arr = Uint8Array.from(b);
  const end = arr.indexOf(0);
  return td.decode(end < 0 ? arr : arr.slice(0, end));
}
export const str24 = strN;

/** SHA-256 of a reasoning log or strategy: the on-chain `memo` / `skill_hash` commitment. */
export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const d = typeof data === 'string' ? te.encode(data) : Uint8Array.from(data);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', d));
}
export const memoOf = sha256;
export const NO_MEMO = new Uint8Array(32);

/** ComputeBudget SetComputeUnitLimit: finalizing 8 contestants (pairwise Elo) needs more than the default 200k. */
export function computeLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: 'ComputeBudget111111111111111111111111111111' as Address, accounts: [], data };
}

// ---- PDAs ----
const pda = async (seeds: (string | Uint8Array)[]) => (await getProgramDerivedAddress({ programAddress: VILLAGE_PROGRAM_ADDRESS, seeds }))[0];
const addr = (a: Address) => getAddressEncoder().encode(a) as Uint8Array;
export const matchPda = (id: number) => pda(['match', getU32Encoder().encode(id) as Uint8Array]);
export const contestantPda = (wallet: Address) => pda(['contestant', addr(wallet)]);

// ---- rules mirror ----
export const travelling = (a: AgentSlot, day: number) => a.arriveDay > day;
export const eventActive = (e: Match['events'][number], day: number) => e.start !== 65535 && day >= e.start && day < e.start + e.len;
export const eventOn = (m: Match, kind: number, town: number) => m.events.some((e) => e.kind === kind && eventActive(e, m.day) && (e.town === NONE || e.town === town));
export const jobAllowed = (town: number, job: number) => TOWN_JOBS[town]?.includes(job) ?? false;

/** What a day's work at home would yield for agent `i` (does not consume the tool). */
export function workYield(m: Match, i: number): { kind: number; qty: number } {
  const a = m.agents[i];
  const kind = JOB_GOOD[a.job];
  const input = JOB_INPUT[a.job];
  if (input !== NO_INPUT && a.inv[input] === 0) return { kind, qty: 0 };
  let q = JOB_YIELD[a.job];
  if (a.inv[Good.Tools] > 0 && kind !== Good.Tools) q += 2;
  if (m.plots[a.location].some((p) => p.kind === Building.Workshop && p.owner === i)) q += 3;
  if (kind === Good.Food && eventOn(m, EventKind.Drought, a.location)) q = Math.floor(q / 2);
  if (eventOn(m, EventKind.Boom, a.location)) q *= 2;
  return { kind, qty: q };
}

/** Mirrors Match::score: goods at fixed values plus buildings; the dead score 0. Goods on a
 *  table or under a bid still belong to the agent until the trade happens. */
export function scoreOf(m: Match, i: number): number {
  const a = m.agents[i];
  if (!a.alive) return 0;
  let s = 0;
  for (let g = 0; g < 5; g++) s += a.inv[g] * VALUES[g];
  for (const t of m.plots) for (const p of t) if (p.owner === i) s += BUILDING_VALUE[p.kind];
  for (const t of m.tables) if (t.maker === i) s += t.giveQty * VALUES[t.giveKind];
  for (const b of m.bids) if (b.table !== NONE && b.bidder === i) s += b.qty * VALUES[b.kind];
  return s;
}

/** The intent commitment on `show`: SHA-256 of "want_kind:want_qty:salt". */
export const intentOf = (wantKind: number, wantQty: number, salt: string) => sha256(`${wantKind}:${wantQty}:${salt}`);
