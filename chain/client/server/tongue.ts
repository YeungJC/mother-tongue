// Mother Tongue: the director. Runs lifetimes back to back on Solana, and the generations
// between them.
//   npx tsx server/tongue.ts --litesvm --gens 3     in-process chain: instant, nothing kept
//   RPC_URL=http://127.0.0.1:8899 npx tsx server/tongue.ts --gens 2    Surfpool (local fork)
//   npx tsx server/tongue.ts                          devnet, resumes where it left off
// Flags: --fresh (forget everyone and start a new island), --seed N, --gens N (default: forever),
//   --flex X (chance a maker takes a bid that is not what it asked for: 0.5 lenient, 0 strict),
//   --live (with --litesvm --data live: paced for watching, see below).
// Live mode: after every table the director sleeps `tableMs` (data/<label>/tongue/control.json,
// written by the viewer's speed buttons through the indexer; default 1200 ms), writes a heartbeat
// to live.json, and never waits long for an LLM thinker (a rate limit means fewer thoughts, not a
// stalled island).
//
// A lifetime: founders (or children) join a match. Every day: work or travel, then each agent
// gets a turn at its town's table (show, bids, accept or reject: every step a transaction with
// words in it), then travellers head home and the day ends. After the last day the program ranks
// everyone by standing within their trade (wealth against the others in the same job); the
// best-placed may have children, who learn their language from a sample of what their parent saw.
// Agents learn ONLY from what they observe. Viewers get the truth: what each maker meant is
// committed on-chain as a hash and revealed after its lifetime.

import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { AccountRole, type Address, type Instruction, type KeyPairSigner } from '@solana/kit';
import * as V from '../src/village.ts';
import type { Match } from '../src/state.ts';
import { DEFAULT_LANG, GOODS, Lexicon, MEANING_NAMES, N_MEANINGS, NUM, inherit, makePhonology, mulberry32, type Rng } from '../lang/engine.ts';
import { FOOD, freshMult } from '../lang/habit.ts';
import { TableTalk, type TableBid, type Trader } from '../lang/table.ts';
import { measure } from '../lang/measure.ts';
import { type Chain, errorName, liteSvmChain, rpcChain, sendBatched } from './chain.ts';
import { NARRATOR_VOICE, TONE, spoken, voice } from './voices.ts';
import { Budget, type Thought, linguist, plan } from './mind.ts';
import { registerLine, stripTags } from './voice.ts';
import { NAMES, type Person, type Store, openStore, saveStore } from './people.ts';

// ---------------------------------------------------------------- settings
const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const P = { ...DEFAULT_LANG, ...(opt('--child-sample') ? { childSample: Number(opt('--child-sample')) } : {}) }; // --child-sample N: the transmission bottleneck (RESEARCH.md §10)
const S = {
  days: Number(process.env.DAYS ?? 20),
  daySecs: Number(process.env.DAY_SECS ?? 120),
  rounds: Number(opt('--rounds') ?? 1), // bid rounds per table: 1 since RESEARCH.md §10 (a misunderstanding costs the deal)
  pTravel: 0.03,
  pMigrate: 0.05,
  pFlexible: Math.min(1, Math.max(0, Number(opt('--flex') ?? 0.5))),
  memory: 600,
  perTown: 3,
};
const BRAINS = { habit: 'habit · mother tongue v1', thinker: 'thinker · llm · mother tongue v1' } as const;
const THINKERS = !flag('--no-thinkers');
const THOUGHTS_PER_LIFE = Number(process.env.THOUGHTS ?? 60);

const chain: Chain = flag('--litesvm') ? await liteSvmChain() : await rpcChain();
// --data <label>: keep this island's records under data/<label>/ (replications run side by side).
const store: Store = openStore(opt('--data') ?? chain.cluster, flag('--fresh') || chain.kind === 'litesvm');
if (opt('--seed')) store.state.seed = Number(opt('--seed'));
const rng: Rng = mulberry32(store.state.seed * 7919 + store.state.nextMatch);
const log = (...a: unknown[]) => console.log(chain.kind === 'litesvm' ? '' : new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const desc = (g: number, q: number) => `${q} ${GOODS[g]}`;

// ---------------------------------------------------------------- live mode (watchable pacing)
const LIVE = flag('--live');
/** Where the island is now, for the heartbeat. */
const now = { gen: 0, day: 0, done: false };
/** Milliseconds between tables: the viewer's speed control (control.json), clamped 0–5000. */
function tableMs() {
  try {
    const c = JSON.parse(readFileSync(`${store.dir}control.json`, 'utf8')) as { tableMs?: number };
    if (Number.isFinite(c.tableMs)) return Math.min(5000, Math.max(0, Number(c.tableMs)));
  } catch { /* no control file yet: the default */ }
  return 1200;
}
/** The heartbeat: the indexer calls the island live while this is fresh. */
function heartbeat() {
  if (!LIVE) return;
  writeFileSync(`${store.dir}live.json`, JSON.stringify({ pid: process.pid, at: Date.now(), gen: now.gen, day: now.day, market: S.pFlexible, tableMs: tableMs(), done: now.done }));
}
if (LIVE) setInterval(heartbeat, 3000).unref();

interface Reveal { intent: string; maker: string; want: number; wantQ: number; salt: string }

/** A mind at a moment, meaning by meaning: the word it believes in most, and how sure it is. */
const topsOf = (lex: Lexicon) => Array.from({ length: N_MEANINGS }, (_, mm) => { const b = lex.best(mm); return b.w ? [b.w, Math.round(b.s * 1000) / 1000] as [string, number] : null; });

/** Founding families in order: each gets its own voice, inherited by every descendant. */
const familyOrder = () => [...store.people.values()].filter((p) => p.generation === 1).map((p) => p.name);
const HISTORIAN = flag('--historian') || (chain.kind === 'rpc' && !flag('--no-historian'));

// ---------------------------------------------------------------- keys
const signers = new Map<string, KeyPairSigner>();
async function signer(key: string) {
  if (!signers.has(key)) signers.set(key, await chain.key(key));
  return signers.get(key)!;
}

// ---------------------------------------------------------------- the living
interface Live extends Trader {
  person: Person;
  slot: number;
  signer: KeyPairSigner;
  home: number;
  job: number;
  location: number;
  travelling: boolean;
  acted: boolean;
  thinker: boolean;
  /** A thinker's plan: a trip to make and whether to build when it can. */
  plannedTrip: number | null;
  wantBuild: boolean;
  focus: number | null;
}

function asLive(person: Person, slot: number, s: KeyPairSigner): Live {
  const mind = store.minds.get(person.key)!;
  return {
    person, slot, signer: s, name: person.name, lex: mind.lex, memory: mind.memory, phon: person.phon,
    inv: [0, 0, 0, 0, 0], mult: freshMult(rng), greed: person.greed, alive: true,
    home: person.home, job: person.job, location: person.home, travelling: false, acted: false,
    thinker: THINKERS && person.brain === 'thinker', plannedTrip: null, wantBuild: false, focus: null,
  };
}

/** Copies the chain into each agent's view of itself. Goods it has escrowed still count as its own. */
function sync(m: Match, live: Live[]) {
  for (const x of live) {
    const a = m.agents[x.slot];
    x.inv = [...a.inv].map(Number);
    for (const t of m.tables) if (t.maker === x.slot) x.inv[t.giveKind] += Number(t.giveQty);
    for (const b of m.bids) if (b.table !== V.NONE && b.bidder === x.slot) x.inv[b.kind] += Number(b.qty);
    x.alive = a.alive;
    x.location = a.location;
    x.travelling = V.travelling(a, m.day);
    x.acted = a.actedDay === m.day;
  }
}

async function fetchMatch(id: number) {
  const m = await chain.match(id);
  if (!m) throw new Error(`match ${id} missing`);
  return m;
}

/** Words as the program takes them: tokens joined by spaces, at most 48 bytes. */
function utter(tokens: string[]) {
  let t = [...tokens];
  while (t.join(' ').length > V.MAX_WORDS) t = t.slice(0, -1);
  return t.join(' ');
}

// ---------------------------------------------------------------- births
async function registerPeople(people: { p: Person; ix: (s: KeyPairSigner) => Promise<Instruction> }[]) {
  const ixs: Instruction[] = [];
  for (const { p, ix } of people) ixs.push(await ix(await signer(p.key)));
  await sendBatched(chain, ixs, 3);
}

async function founders(): Promise<string[]> {
  const phon = V.TOWNS.map(() => makePhonology(rng));
  const made: Person[] = [];
  for (let t = 0; t < 4; t++) {
    for (let i = 0; i < S.perTown; i++) {
      const id = store.people.size;
      const name = NAMES[id % NAMES.length];
      const key = `mt-${store.state.seed}-g1-${id}-${name.toLowerCase()}`;
      const s = await signer(key);
      const p: Person = { key, wallet: s.address, name, family: name, generation: 1, home: t, job: V.TOWN_JOBS[t][i % V.TOWN_JOBS[t].length], parent: null, phon: phon[t], greed: 0.05 + rng() * 0.25, brain: THINKERS && id % 2 === 0 ? 'thinker' : 'habit', lived: null, place: null, score: null, survived: null };
      store.people.set(key, p);
      store.minds.set(key, { lex: new Lexicon(), memory: [] });
      made.push(p);
    }
  }
  await registerPeople(await Promise.all(made.map(async (p) => {
    const brain = BRAINS[p.brain ?? 'habit'];
    const skill = await V.sha256(brain);
    return { p, ix: async (w: KeyPairSigner) => V.getRegisterFounderInstructionAsync({ payer: chain.admin, wallet: w, name: V.bytes24(p.name), brain: V.bytes32(brain), skillHash: skill, owner: V.NOBODY, home: p.home, job: p.job }) };
  })));
  log(`🌱 12 founders, born speaking nothing: ${made.map((p) => `${p.name} (${V.JOBS[p.job]}, ${V.TOWNS[p.home]}${p.brain === 'thinker' ? ', thinker' : ''})`).join(', ')}`);
  return made.map((p) => p.key);
}

/**
 * Children for the next generation. The program decides how many each parent may have (by final
 * place; the dead have none). Here we decide where they're raised: mostly at the parent's home,
 * three to a town, with a few raised elsewhere (migration), and in the town's trades.
 */
async function births(m: Match, live: Live[], gen: number): Promise<string[]> {
  const n = m.n;
  const ranking = [...m.ranking].slice(0, n);
  const allowance = new Map<Live, number>();
  const survivor = (slot: number) => m.agents[slot].alive && Number(m.scores[slot]) > 0;
  const survivors = ranking.filter(survivor).length;
  ranking.forEach((slot, place) => {
    const x = live.find((l) => l.slot === slot)!;
    allowance.set(x, survivor(slot) ? V.childrenAllowed(place, survivors) : 0);
  });
  const byPlace = ranking.map((s) => live.find((l) => l.slot === s)!);
  const total = [...allowance.values()].reduce((a, b) => a + b, 0);
  const seats = Math.min(total, V.MAX_AGENTS);
  const plan: { parent: Live; town: number }[] = [];
  const take = (pool: Live[]) => { const p = pool.find((x) => (allowance.get(x) ?? 0) > 0); if (p) allowance.set(p, allowance.get(p)! - 1); return p; };
  // Round-robin over towns so each gets its share, best-placed parents first.
  for (let pass = 0; pass < S.perTown && plan.length < seats; pass++) {
    for (let t = 0; t < 4 && plan.length < seats; t++) {
      const local = byPlace.filter((x) => x.home === t);
      const parent = rng() >= S.pMigrate ? take(local) ?? take(byPlace) : take(byPlace) ?? take(local);
      if (parent) plan.push({ parent, town: t });
    }
  }
  const made: { p: Person; parent: Live }[] = [];
  const perTownCount = [0, 0, 0, 0];
  for (const { parent, town } of plan) {
    const id = store.people.size + made.length;
    const name = `${NAMES[id % NAMES.length]}·${gen + 1}`;
    const key = `mt-${store.state.seed}-g${gen + 1}-${id}-${NAMES[id % NAMES.length].toLowerCase()}`;
    const s = await signer(key);
    const job = V.TOWN_JOBS[town][perTownCount[town]++ % V.TOWN_JOBS[town].length];
    const before = new Set(store.registry.words.keys());
    const lex = inherit(parent.memory, name, { rng, reg: store.registry, P, gen: gen + 1, day: 0, town });
    const misheard = [...store.registry.words.values()].filter((o) => !before.has(o.form) && o.kind === 'misheard' && o.by === name).map((o) => ({ from: o.from, to: o.form }));
    appendFileSync(`${store.dir}births.jsonl`, JSON.stringify({
      gen: gen + 1, child: key, name, parent: parent.person.key, parentName: parent.name, town, parentHome: parent.home,
      heard: Math.min(P.childSample, parent.memory.length), parentMemory: parent.memory.length, misheard,
      inherited: topsOf(lex), parentTops: topsOf(parent.lex),
    }) + '\n');
    // A child is the same kind of mind as its parent, with a 10% chance of the other kind.
    const inherited = parent.person.brain ?? 'habit';
    const brain: 'habit' | 'thinker' = !THINKERS ? 'habit' : rng() < 0.1 ? (inherited === 'thinker' ? 'habit' : 'thinker') : inherited;
    const p: Person = { key, wallet: s.address, name, family: parent.person.family, generation: gen + 1, home: town, job, parent: parent.person.key, phon: parent.person.phon, greed: Math.min(0.4, Math.max(0, parent.person.greed + (rng() - 0.5) * 0.1)), brain, lived: null, place: null, score: null, survived: null };
    store.people.set(key, p);
    store.minds.set(key, { lex, memory: [] });
    made.push({ p, parent });
  }
  await registerPeople(made.map(({ p, parent }) => ({
    p,
    ix: async (w) => V.getRegisterChildInstructionAsync({
      payer: chain.admin, wallet: w, parentWallet: parent.signer, game: m.address, name: V.bytes24(p.name), brain: V.bytes32(BRAINS[p.brain ?? 'habit']), skillHash: await V.sha256(BRAINS[p.brain ?? 'habit']),
      owner: V.NOBODY, home: p.home, job: p.job, parentSlot: parent.slot,
    }),
  })));
  const counts = new Map<string, number>();
  for (const { parent } of made) counts.set(parent.name, (counts.get(parent.name) ?? 0) + 1);
  log(`👶 ${made.length} children: ${[...counts].map(([k, v]) => `${k} ×${v}`).join(', ')}${made.some(({ p, parent }) => p.home !== parent.home) ? ` · raised elsewhere: ${made.filter(({ p, parent }) => p.home !== parent.home).map(({ p }) => `${p.name} → ${V.TOWNS[p.home]}`).join(', ')}` : ''}`);
  return made.map(({ p }) => p.key);
}

// ---------------------------------------------------------------- a lifetime
interface Counters { tables: number; spoke: number; firstBids: number; firstRight: number; ctxRight: number; deals: number; exact: number; txs: number; trips: number }
const zero = (): Counters => ({ tables: 0, spoke: 0, firstBids: 0, firstRight: 0, ctxRight: 0, deals: 0, exact: 0, txs: 0, trips: 0 });

async function lifetime(keys: string[], gen: number) {
  const id = store.state.nextMatch;
  const people = keys.map((k) => store.people.get(k)!);
  let m = await chain.match(id);
  if (!m) {
    await chain.send([await V.getCreateMatchInstructionAsync({ admin: chain.admin, id, seed: BigInt(Math.floor(rng() * 2 ** 48)), days: S.days, daySecs: S.daySecs })]);
    m = await fetchMatch(id);
  }
  if (m.status === V.MatchStatus.Open) {
    const joined = new Set(m.agents.slice(0, m.n).map((a) => a.wallet as string));
    const ixs: Instruction[] = [];
    for (const p of people) if (!joined.has(p.wallet)) ixs.push(await V.getJoinMatchInstructionAsync({ wallet: await signer(p.key), game: m.address }));
    await sendBatched(chain, ixs, 4);
    await chain.send([V.getStartMatchInstruction({ admin: chain.admin, game: m.address })]);
    m = await fetchMatch(id);
  }
  const bySlot = new Map(m.agents.slice(0, m.n).map((a, slot) => [a.wallet as string, slot]));
  const live: Live[] = [];
  for (const p of people) live.push(asLive(p, bySlot.get(p.wallet)!, await signer(p.key)));
  live.sort((a, b) => a.slot - b.slot);
  const c = zero();
  // What each maker meant, kept privately as it happens (so a restart loses nothing) and
  // published as intents/<id>.json once the lifetime is over.
  const pending = `${store.dir}intents/${id}.pending.jsonl`;
  const reveal = { add: (r: Reveal) => appendFileSync(pending, JSON.stringify(r) + '\n') };
  const talkFile = `${store.dir}talk/${id}.jsonl`;
  const events = m.events.filter((e) => e.start !== 65535).map((e) => ({ kind: V.EVENTS[e.kind], town: e.town === V.NONE ? null : V.TOWNS[e.town], start: e.start, len: e.len }));
  budget = new Budget(THOUGHTS_PER_LIFE);
  log(`\n════ generation ${gen} · lifetime (match) ${id} · ${live.map((x) => `${x.name}${x.thinker ? '*' : ''}`).join(', ')}   (* thinker)`);
  log(`   events: ${events.map((e) => `${e.kind}${e.town ? ` in ${e.town}` : ''} days ${e.start}–${e.start + e.len - 1}`).join(', ')}`);

  while (m.status === V.MatchStatus.Running) {
    await day(m, live, gen, c, reveal, talkFile);
    m = await fetchMatch(id);
  }

  // The end of a life: the program ranks everyone.
  const pdas = await Promise.all(live.map((x) => V.contestantPda(x.signer.address)));
  if (m.status === V.MatchStatus.Ended) {
    const ix = V.getFinalizeMatchInstruction({ game: m.address });
    await chain.send([V.computeLimit(600_000), { ...ix, accounts: [...ix.accounts, ...pdas.map((address) => ({ address, role: AccountRole.WRITABLE }))] }]);
    m = await fetchMatch(id);
  }
  // The program ranks; our mirror (village.ts) must agree, or the off-chain sim has drifted.
  const scoresNow = Array.from(m.scores).slice(0, m.n).map(Number);
  const mirror = V.rankByStanding(scoresNow, m.agents.slice(0, m.n).map((a) => a.job), m.agents.slice(0, m.n).map((a) => a.alive));
  if (mirror.join() !== Array.from(m.ranking).slice(0, m.n).join()) throw new Error(`ranking mirror disagrees with the program: ${mirror} vs ${Array.from(m.ranking).slice(0, m.n)}`);
  m.ranking.slice(0, m.n).forEach((slot, place) => {
    const x = live.find((l) => l.slot === slot)!;
    Object.assign(x.person, { lived: id, place, score: Number(m!.scores[slot]), survived: m!.agents[slot].alive });
  });
  // The reveal: what every maker really meant, now that its life is over.
  const all = existsSync(pending) ? readFileSync(pending, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  writeFileSync(`${store.dir}intents/${id}.json`, JSON.stringify(all, null, 1));
  if (existsSync(pending)) rmSync(pending);

  // How they speak now.
  for (const x of live) x.lex.prune();
  const lm = measure(live, P.theta);
  const rec = {
    gen, match: id, cluster: chain.cluster, market: S.pFlexible, ...c,
    understood: c.firstBids ? c.firstRight / c.firstBids : 0, contextOnly: c.firstBids ? c.ctxRight / c.firstBids : 0,
    deaths: live.filter((x) => !x.alive).length, known: lm.known, withinTown: lm.withinTown, betweenTowns: lm.betweenTowns, vocab: lm.vocab,
    events, dialect: lm.dialect, ranking: Array.from(m.ranking).slice(0, m.n).map((s) => ({ name: live.find((l) => l.slot === s)!.name, score: Number(m!.scores[s]), alive: m!.agents[s].alive })),
  };
  appendFileSync(`${store.dir}generations.jsonl`, JSON.stringify(rec) + '\n');
  if (HISTORIAN) {
    const told = historian(rec, live).catch((e) => log('historian:', String((e as Error).message ?? e).slice(0, 120)));
    if (!LIVE) await told; // live: the next lifetime doesn't wait for the story of the last
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  log(`🏁 lifetime ${id} over · ${c.txs} transactions · ${c.tables} tables, understood ${pct(rec.understood)} (context alone ${pct(rec.contextOnly)}), deals ${c.deals} (${c.exact} as meant) · deaths ${rec.deaths}`);
  log(`   ranking: ${rec.ranking.map((r, i) => `${i + 1}. ${r.name} ${r.score}${r.alive ? '' : ' †'}`).join(' · ')}`);
  log(`   words: ${[0, 1, 2, 3, 4, NUM(2), NUM(3), 11, 12].map((mm) => `${MEANING_NAMES[mm]} ${V.TOWNS.map((_, t) => lm.dialect[t][mm]?.word ?? '-').join('/')}`).join(' · ')}`);
  return { m, live };
}

let budget = new Budget(THOUGHTS_PER_LIFE);
const pondered = new Map<string, string[]>();
/** Thinkers think: plans every five days, and now and then a linguist moment about a word. */
async function think(m: Match, live: Live[], gen: number, frostDays: number) {
  const thinkers = live.filter((x) => x.thinker && x.alive && !x.travelling);
  if (!thinkers.length) return;
  const makersOf = Object.fromEntries(V.GOODS.map((g, gi) => [g, V.TOWNS.filter((_, t) => live.some((b) => b.alive && b.home === t && V.JOB_GOOD[b.job] === gi))]));
  const jobs: Promise<void>[] = [];
  const record = (x: Live, t: Thought) => appendFileSync(`${store.dir}thoughts.jsonl`, JSON.stringify({ match: m.id, gen, day: m.day, key: x.person.key, name: x.name, ...t }) + '\n');
  for (const x of thinkers) {
    if (m.day % 5 === 1 && budget.take()) jobs.push(plan({ name: x.name, job: V.JOBS[x.job], home: x.home, location: x.location, day: m.day, days: m.days, inv: x.inv, hunger: m.agents[x.slot].hunger, frostSoon: frostDays, makersOf })
      .then((p) => {
        if (!p) return;
        x.focus = p.focus; x.mult[p.focus] *= 2; x.plannedTrip = x.location === x.home ? p.travel : null; x.wantBuild = p.build;
        record(x, { kind: 'plan', thought: p.thought, model: p.model, focus: V.GOODS[p.focus], travel: p.travel === null ? null : V.TOWNS[p.travel], build: p.build });
      }).catch(() => {}));
    else if (rng() < 0.3 && budget.take()) {
      const recent = pondered.get(x.person.key) ?? [];
      jobs.push(linguist(x.name, x.lex, x.memory, P, recent).then((t) => {
        if (!t) return;
        pondered.set(x.person.key, [...recent, t.word!].slice(-3)); // think about something else next time
        record(x, t);
        log(`   💭 ${x.name}: ${t.thought}`);
      }).catch(() => {}));
    }
  }
  // Live: wait a moment for quick answers (at most 5 s, less when the viewer is in a hurry), then
  // carry on; a plan that arrives later is applied when it arrives. Recorded research waits.
  if (LIVE) await Promise.race([Promise.all(jobs), sleep(Math.min(5000, tableMs() * 3))]);
  else await Promise.all(jobs);
}

/** The historian: an English account of the lifetime just ended, for listeners. */
async function historian(rec: { gen: number; match: number; understood: number; contextOnly: number; deaths: number; deals: number; exact: number; dialect: ({ word: string; share: number } | null)[][]; ranking: { name: string; score: number; alive: boolean }[] }, live: Live[]) {
  const prev = (await import('node:fs')).readFileSync(`${store.dir}generations.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((g) => g.gen === rec.gen - 1).pop();
  const changes: string[] = [];
  if (prev) for (let t = 0; t < 4; t++) for (let mm = 0; mm < N_MEANINGS; mm++) {
    const a = prev.dialect[t]?.[mm]?.word, b = rec.dialect[t]?.[mm]?.word;
    if (a && b && a !== b) changes.push(`in ${V.TOWNS[t]}, "${MEANING_NAMES[mm]}" changed from "${a}" to "${b}"`);
  }
  const shared = [0, 1, 2, 3, 4].map((mm) => ({ m: MEANING_NAMES[mm], ws: new Set(rec.dialect.map((t) => t?.[mm]?.word).filter(Boolean)) })).filter((x) => x.ws.size === 1).map((x) => `"${[...x.ws][0]}" means ${x.m} everywhere`);
  const dead = live.filter((x) => !x.alive).map((x) => x.name);
  const families = new Set(live.map((x) => x.person.family));
  const facts = [
    `Generation ${rec.gen} (lifetime ${rec.match}) is over.`,
    `Listeners guessed what speakers meant ${Math.round(rec.understood * 100)}% of the time (context alone would give ${Math.round(rec.contextOnly * 100)}%).`,
    `${rec.deals} trades, ${rec.exact} of them understood as meant.`,
    dead.length ? `Starved: ${dead.join(', ')}.` : 'No one starved.',
    `Best placed: ${rec.ranking.slice(0, 2).map((r) => r.name).join(' and ')}, who will have the most children.`,
    `${families.size} founding families still have living members.`,
    changes.length ? `Language change: ${changes.slice(0, 3).join('; ')}.` : 'No town changed its words this generation.',
    shared.length ? `Shared across the island: ${shared.slice(0, 2).join('; ')}.` : '',
  ].filter(Boolean);
  let text = facts.slice(1, 6).join(' ');
  try {
    const { chat } = await import('./llm.ts');
    const out = await chat('quick', [
      { role: 'system', content: 'You are the historian of an island where AI agents were born speaking no language and invented one to trade. Narrate the generation that just ended in AT MOST 70 spoken words: warm, curious, a little wry, like a nature documentary. Use ONLY the facts given: do not invent places, ages, weather, rivers or events. Quote the invented words exactly. Use one audio tag in square brackets where it fits, e.g. [thoughtfully], [amused], [softly]. No lists, no markdown.' },
      { role: 'user', content: facts.join('\n') },
    ], { maxTokens: 400 });
    if (out.text.trim()) text = out.text.trim().replace(/^"|"$/g, '');
    // Keep it short enough to listen to: cut at a sentence boundary under ~100 words.
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    let kept = '';
    for (const x of sentences) { if ((kept + x).split(/\s+/).length > 100 && kept) break; kept += x; }
    text = kept.trim();
  } catch { /* no free model available: the plain facts will do */ }
  const line = registerLine(NARRATOR_VOICE, text, 'historian', 'commentary');
  appendFileSync(`${store.dir}history.jsonl`, JSON.stringify({ gen: rec.gen, lifetime: rec.match, text: stripTags(line.text), hash: line.hash, facts, at: Date.now() }) + '\n');
  log(`📜 ${stripTags(line.text).slice(0, 140)}…`);
}

async function day(m0: Match, live: Live[], gen: number, c: Counters, reveal: { add: (r: Reveal) => void }, talkFile: string) {
  const d = m0.day;
  now.gen = gen; now.day = d; heartbeat();
  sync(m0, live);
  if (d % 5 === 1) for (const x of live) x.mult = freshMult(rng);
  // What's coming: frosts are public from the start. Within six days of one, keep a day's wood
  // for every frost day still ahead.
  const frostDays = m0.events.filter((e) => e.kind === V.EventKind.Frost && e.start !== 65535)
    .reduce((n, e) => n + Array.from({ length: e.len }, (_, k) => e.start + k).filter((x) => x >= d && x <= d + 6).length, 0);
  for (const x of live) {
    x.need = [0, frostDays, 0, 0, 0];
    const input = V.JOB_INPUT[x.job]; // a crafter keeps a couple of its input (RESEARCH.md §9)
    if (input !== V.NO_INPUT) x.need[input] += 2;
  }
  await think(m0, live, gen, frostDays);

  // Morning: work at home, or set off. Agents abroad trade today and head home tonight.
  const morning: Instruction[] = [];
  const memo = V.NO_MEMO;
  for (const x of live) {
    if (!x.alive || x.travelling || x.acted || x.location !== x.home) continue;
    const dest = chooseTrip(x, live);
    const plot = m0.plots[x.home].findIndex((pl) => pl.kind === V.Building.Empty);
    const hasWorkshop = m0.plots[x.home].some((pl) => pl.kind === V.Building.Workshop && pl.owner === x.slot);
    if (dest >= 0) { morning.push(V.getTravelInstruction({ wallet: x.signer, game: m0.address, slot: x.slot, dest, memo })); c.trips++; }
    else if (x.wantBuild && !hasWorkshop && plot >= 0 && x.inv[V.Good.Tools] >= 2 && x.inv[V.Good.Planks] >= 4) {
      morning.push(V.getBuildInstruction({ wallet: x.signer, game: m0.address, slot: x.slot, plot, kind: V.Building.Workshop, memo }));
      x.wantBuild = false;
      log(`   🔨 ${x.name} builds a workshop in ${V.TOWNS[x.home]}`);
    } else morning.push(V.getWorkInstruction({ wallet: x.signer, game: m0.address, slot: x.slot, memo }));
  }
  await sendBatched(chain, morning, 4);
  c.txs += Math.ceil(morning.length / 4);
  let m = await fetchMatch(m0.id);
  sync(m, live);

  // After a restart: tables our agents left open mid-trade are closed (goods and bids go back).
  const stale = m.tables.map((t, k) => ({ t, k })).filter(({ t }) => t.maker !== V.NONE && live.some((x) => x.slot === t.maker));
  if (stale.length) {
    await sendBatched(chain, stale.map(({ t, k }) => V.getCloseTableInstruction({ wallet: live.find((x) => x.slot === t.maker)!.signer, game: m.address, slot: t.maker, table: k })), 4);
    m = await fetchMatch(m0.id);
    sync(m, live);
  }

  // The market: in each town, everyone present gets a turn at the table.
  const towns = [0, 1, 2, 3];
  const run = (t: number) => market(t, m.address, m.id, d, live, gen, c, reveal, talkFile);
  if (chain.kind === 'litesvm') for (const t of towns) await run(t);
  else await Promise.all(towns.map(run));

  // Evening: travellers head home; everyone else who hasn't acted rests.
  m = await fetchMatch(m0.id);
  sync(m, live);
  const evening: Instruction[] = [];
  for (const x of live) {
    if (!x.alive || x.travelling || x.acted) continue;
    if (x.location !== x.home) evening.push(V.getTravelInstruction({ wallet: x.signer, game: m.address, slot: x.slot, dest: x.home, memo }));
    else evening.push(V.getRestInstruction({ wallet: x.signer, game: m.address, slot: x.slot }));
  }
  await sendBatched(chain, evening, 4);
  c.txs += Math.ceil(evening.length / 4);
  for (let k = 0; ; k++) {
    try {
      await chain.send([V.getAdvanceDayInstruction({ game: m.address })]);
      c.txs++;
      break;
    } catch (e) {
      if (errorName(e) !== 'TooEarly' || k > 60) throw e;
      await sleep(2000);
    }
  }
  saveStore(store, live.map((x) => x.person.key)); // minds as of tonight (viewers, and restarts)
  const snap = live.map((x) => JSON.stringify({ match: m0.id, gen, day: d, key: x.person.key, home: x.home, location: x.location, alive: x.alive, words: x.lex.a.size, tops: topsOf(x.lex) }));
  appendFileSync(`${store.dir}lexicon/${m0.id}.jsonl`, snap.join('\n') + '\n');
  const after = await fetchMatch(m0.id);
  // The day in numbers (scoreboard, race, moments): each agent's wealth, holdings, hunger, place.
  appendFileSync(`${store.dir}days.jsonl`, JSON.stringify({
    match: m0.id, gen, day: d, events: after.events.filter((e) => e.start !== 65535 && d >= e.start && d < e.start + e.len).map((e) => ({ kind: V.EVENTS[e.kind], town: e.town === V.NONE ? null : V.TOWNS[e.town] })),
    agents: live.map((x) => { const a = after.agents[x.slot]; return { key: x.person.key, score: V.scoreOf(after, x.slot), alive: a.alive, hunger: a.hunger, inv: Array.from(a.inv), loc: a.location, dest: a.dest, travelling: V.travelling(a, after.day), trades: a.trades, builds: a.builds }; }),
  }) + '\n');
  const died = live.filter((x) => x.alive && !after.agents[x.slot].alive);
  if (died.length) log(`   ✝ day ${d}: ${died.map((x) => `${x.name} (${V.JOBS[x.job]}, ${V.TOWNS[x.home]}; wood ${x.inv[V.Good.Wood]}, food ${x.inv[FOOD]})`).join(', ')}`);
}

/** Hungry with no farmer at home: go where the food is. Otherwise, now and then, a trading trip. */
function chooseTrip(x: Live, live: Live[]): number {
  if (x.plannedTrip !== null) { const t = x.plannedTrip; x.plannedTrip = null; return t; } // a thinker's plan
  const farmerHome = live.some((b) => b !== x && b.alive && b.home === x.home && b.job === V.Job.Farmer);
  if (x.inv[FOOD] < 3 && !farmerHome && x.job !== V.Job.Farmer) {
    const foodTowns = [0, 1, 3].filter((t) => t !== x.home && live.some((b) => b.alive && b.home === t && b.job === V.Job.Farmer));
    foodTowns.sort((a, b) => V.TRAVEL[x.home][a] - V.TRAVEL[x.home][b]);
    if (foodTowns.length) return foodTowns[0];
  }
  // Something it urgently needs that nobody at home makes: go to the nearest town that does.
  for (let g = 0; g < 5; g++) {
    if ((x.need?.[g] ?? 0) <= x.inv[g] || g === FOOD) continue;
    const makes = (t: number) => live.some((b) => b.alive && b.home === t && V.JOB_GOOD[b.job] === g);
    if (makes(x.home)) continue;
    const towns = [0, 1, 2, 3].filter((t) => t !== x.home && makes(t)).sort((a, b) => V.TRAVEL[x.home][a] - V.TRAVEL[x.home][b]);
    if (towns.length) return towns[0];
  }
  if (rng() < S.pTravel) {
    const w = V.TOWNS.map((_, t) => (t === x.home ? 0 : 1 / V.TRAVEL[x.home][t]));
    let r = rng() * w.reduce((a, b) => a + b, 0);
    return w.findIndex((v) => (r -= v) <= 0);
  }
  return -1;
}

async function market(town: number, game: Address, id: number, d: number, live: Live[], gen: number, c: Counters, reveal: { add: (r: Reveal) => void }, talkFile: string) {
  const here = live.filter((x) => x.alive && !x.travelling && x.location === town).sort(() => rng() - 0.5);
  for (const maker of here) {
    if (!maker.alive || !here.some((b) => b !== maker && b.alive)) continue;
    sync(await fetchMatch(id), live);
    const talk = TableTalk.open(maker, here, { rng, reg: store.registry, P, gen, day: d, town, pFlexible: S.pFlexible, memory: S.memory });
    if (!talk) continue;
    c.tables++;
    if (talk.said.length) c.spoke++;
    const salt = hex(randomBytes(16));
    const intent = await V.intentOf(talk.want, talk.wantQ, salt);
    reveal.add({ intent: hex(intent), maker: maker.name, want: talk.want, wantQ: talk.wantQ, salt });
    const words = utter(talk.said);
    await chain.send([V.getShowInstruction({ wallet: maker.signer, game, slot: maker.slot, giveKind: talk.give, giveQty: talk.giveQ, intent, words })]);
    c.txs++;
    let m = await fetchMatch(id);
    const k = m.tables.findIndex((t) => t.maker === maker.slot);
    const entry = {
      match: id, gen, day: d, town, table: k, maker: maker.name, makerKey: maker.person.key, makerHome: maker.home,
      give: talk.give, giveQ: talk.giveQ, shows: desc(talk.give, talk.giveQ), said: words, intent: hex(intent),
      present: here.filter((x) => x.alive).map((x) => x.person.key),
      rounds: [] as unknown[], result: 'no deal', guesses: {} as Record<string, [number, number][]>,
    };

    const fams = familyOrder();
    const say = (who: Live, text: string) => voice(who.person.family, text, who.person.key, fams);
    const [showTone, showEnd] = TONE.show(maker.inv[FOOD] <= 2, talk.want === FOOD);
    const showVoice = say(maker, spoken(words, showTone, showEnd));
    Object.assign(entry, { voice: showVoice, tone: showTone });

    let done = false;
    for (let r = 1; r <= S.rounds && !done; r++) {
      const bids = talk.round(r);
      if (!bids.length) break;
      await sendBatched(chain, bids.map((b) => V.getBidInstruction({ wallet: b.b.signer, game, slot: b.b.slot, table: k, kind: b.g, qty: b.q, words: utter(b.said) })), 4);
      c.txs += Math.ceil(bids.length / 4);
      m = await fetchMatch(id);
      talk.heard(bids);
      const taken: TableBid<Live> | null = talk.choose(bids);
      // A bidder sounds sure if it knows a word the maker said; hesitant if it's guessing.
      const sure = (b: TableBid<Live>) => talk.said.some((w) => (b.b.lex.meanings(w)[0]?.s ?? 0) >= 0.5);
      const round = {
        bids: bids.map((b) => { const [t, e] = TONE.bid(sure(b)); return { who: b.b.name, key: b.b.person.key, said: utter(b.said), g: b.g, q: b.q, offered: desc(b.g, b.q), tone: t, voice: say(b.b, spoken(utter(b.said), t, e)) }; }),
        outcome: '', reaction: '', taken: null as string | null, tone: '', voice: null as ReturnType<typeof say>,
      };
      if (taken) {
        const bidIndex = m.bids.findIndex((b) => b.table === k && b.bidder === taken.b.slot);
        const { yes, understood } = talk.accepted(taken);
        await chain.send([V.getAcceptInstruction({ wallet: maker.signer, game, slot: maker.slot, table: k, bid: bidIndex, words: yes ?? '' })]);
        c.txs++;
        c.deals++;
        if (understood) c.exact++;
        round.outcome = `${maker.name} accepts ${taken.b.name}'s ${desc(taken.g, taken.q)}`;
        round.reaction = yes ?? '';
        round.taken = taken.b.person.key;
        [round.tone] = TONE.accept(understood);
        round.voice = say(maker, spoken(yes ?? '', round.tone, TONE.accept(understood)[1]));
        entry.result = understood ? 'understood' : 'traded, but misunderstood';
        done = true;
      } else {
        const no = talk.rejected(bids);
        await chain.send([V.getRejectInstruction({ wallet: maker.signer, game, slot: maker.slot, table: k, words: no ?? '' })]);
        c.txs++;
        round.outcome = 'rejects every bid';
        round.reaction = no ?? '';
        [round.tone] = TONE.reject(r);
        round.voice = say(maker, spoken(no ?? '', round.tone, TONE.reject(r)[1]));
      }
      entry.rounds.push(round);
    }
    if (!done) { await chain.send([V.getCloseTableInstruction({ wallet: maker.signer, game, slot: maker.slot, table: k })]); c.txs++; }
    c.firstBids += talk.firstBids; c.firstRight += talk.firstRight; c.ctxRight += talk.ctxRight;
    for (const [x, gs] of talk.guesses) entry.guesses[x.person.key] = gs.map((gq) => [gq.g, gq.q]);
    // Would the best guess from context alone (what's on the table, what the maker lacks) have
    // been right? 1/0, or null if nobody guessed: the "guessing blind" baseline, table by table.
    Object.assign(entry, { blind: talk.firstBids ? talk.ctxRight / talk.firstBids : null });
    appendFileSync(talkFile, JSON.stringify(entry) + '\n');
    if (LIVE) { heartbeat(); await sleep(tableMs()); }
  }
}

// ---------------------------------------------------------------- main loop
const gens = Number(opt('--gens') ?? (LIVE ? 40 : Infinity));
log(`Mother Tongue director on ${chain.cluster} (program ${V.VILLAGE_PROGRAM_ADDRESS}), seed ${store.state.seed}`);
let current = store.state.current.filter((k) => store.people.has(k));
let gen = store.state.generation;
if (!current.length) {
  // A new island: its first lifetime takes the first match id nobody has used (the retired
  // tournament's matches still sit at the low ids on devnet).
  while (await chain.matchTaken(store.state.nextMatch)) store.state.nextMatch++;
  current = await founders(); gen = 1; store.state.generation = 1; store.state.current = current; saveStore(store);
}
for (let played = 0; played < gens; played++) {
  const t0 = Date.now();
  const { m, live } = await lifetime(current, gen);
  const next = await births(m, live, gen);
  await chain.send([V.getCloseMatchInstruction({ admin: chain.admin, game: m.address })]).catch((e) => log('close', errorName(e)));
  store.state.nextMatch = m.id + 1;
  store.state.generation = gen + 1;
  store.state.current = next;
  saveStore(store);
  log(`   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (next.length < 2) { log('the island is empty: no one left to have children'); break; }
  current = next;
  gen++;
}
if (LIVE) {
  // The run is over: keep the heartbeat (the island stays "live", and viewers loop back to
  // generation 1) until stopped.
  now.done = true;
  heartbeat();
  log(`live run finished after ${gens} generations; idling (Ctrl-C to stop)`);
  setInterval(heartbeat, 3000);
}
