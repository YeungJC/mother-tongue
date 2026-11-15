// Mother Tongue indexer: the chain and the director's records → the viewer and the research.
//   npx tsx server/indexer.ts                          devnet (follows the program live)
//   TONGUE_DATA=litesvm npx tsx server/indexer.ts      a recorded island, files only
// GET /stream (SSE): state, utterance (live, from chain logs), table, generation, birth, research
// GET /state /people /mind/:key /talk?lifetime=&from= /lexicon?lifetime= /generations /words
//     /research /replication /conditions /dataset/:table.csv|.json
// POST /control {tableMs} (localhost only): the live director's pace (the viewer's speed buttons).
import { createServer, type ServerResponse } from 'node:http';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { getBase64Encoder } from '@solana/kit';
import * as V from '../src/village.ts';
import { CLUSTER, rpcSubscriptions } from '../src/rpc.ts';
import { DEFAULT_LANG, MEANING_NAMES, N_MEANINGS, NUM } from '../lang/engine.ts';
import { analyze, findings, load } from '../lab/research.ts';
import { csv, tables } from '../lab/dataset.ts';
import { type Chain, rpcChain } from './chain.ts';
import { spoken, voice } from './voices.ts';

const LABEL = process.env.TONGUE_DATA ?? CLUSTER;
// Any named island other than the cluster itself (litesvm, demo, replicate/…) is a recording.
const FILES_ONLY = LABEL !== CLUSTER || process.env.NO_CHAIN === '1';
const PORT = Number(process.env.INDEXER_PORT ?? (FILES_ONLY ? 8412 : CLUSTER === 'local' ? 8411 : 8410));
const DIR = new URL(`../data/${LABEL}/tongue/`, import.meta.url).pathname;
const REPLICATE = new URL('../data/replicate/summary.json', import.meta.url).pathname;
const CONDITIONS = new URL('../data/replicate/conditions.json', import.meta.url).pathname;
const DATA = new URL('../data/', import.meta.url).pathname;
// RESEARCH.md §10: the four worlds on the confirmation islands (seeds 909…1616), world 3 locked.
const WORLDS = [
  { id: '0', label: 'neither', rule: 'crafters make goods from nothing; an offer can be repeated until someone understands' },
  { id: '1', label: 'need each other\'s goods', rule: 'smiths need ore and carpenters need wood; an offer can be repeated' },
  { id: '6', label: 'one try per offer', rule: 'crafters make goods from nothing; one try per offer' },
  { id: '3', label: 'both', rule: 'smiths need ore and carpenters need wood; one try per offer (this island)' },
];
const THETA = DEFAULT_LANG.theta;

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x instanceof Uint8Array ? Buffer.from(x).toString('hex') : x));
const readJson = <T>(f: string, d: T): T => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d; } catch { return d; } };
const readJsonl = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);
const clients = new Set<ServerResponse>();
const broadcast = (type: string, data: unknown) => { const msg = `event: ${type}\ndata: ${json(data)}\n\n`; for (const c of clients) c.write(msg); };

// ---------------------------------------------------------------- people and minds
interface Person { key: string; wallet: string; name: string; family: string; generation: number; home: number; job: number; parent: string | null; lived: number | null; place: number | null; score: number | null; survived: boolean | null }
const people = () => readJson<Person[]>(`${DIR}people.json`, []);
const state = () => readJson<{ nextMatch: number; generation: number; current: string[]; seed: number }>(`${DIR}state.json`, { nextMatch: 1, generation: 0, current: [], seed: 0 });
const byWallet = () => new Map(people().map((p) => [p.wallet, p]));

function mind(key: string) {
  const m = readJson<{ lex: { a: [string, number[]][]; where: [string, number][] }; memory: unknown[] } | null>(`${DIR}minds/${key}.json`, null);
  if (!m) return null;
  const where = new Map(m.lex.where);
  const words = m.lex.a.map(([w, row]) => ({
    word: w,
    means: row.map((s, k) => ({ meaning: MEANING_NAMES[k], s })).filter((x) => x.s >= 0.05).sort((a, b) => b.s - a.s),
    heardIn: V.TOWNS.filter((_, t) => ((where.get(w) ?? 0) & (1 << t)) !== 0),
  })).filter((x) => x.means.length).sort((a, b) => b.means[0].s - a.means[0].s);
  // Its best word per meaning, evening by evening, over its life.
  const history = existsSync(`${DIR}lexicon/`) ? readdirSync(`${DIR}lexicon/`).flatMap((f) => readJsonl(`${DIR}lexicon/${f}`)).filter((r) => r.key === key).map((r) => ({ lifetime: r.match, day: r.day, tops: r.tops })) : [];
  return { key, words, remembered: m.memory.length, history, meanings: MEANING_NAMES.slice(0, N_MEANINGS) };
}

// ---------------------------------------------------------------- transcripts, with meanings
function reveals(lifetime: number) {
  const done = readJson<{ intent: string; want: number; wantQ: number; salt: string }[] | null>(`${DIR}intents/${lifetime}.json`, null);
  const rows = done ?? readJsonl(`${DIR}intents/${lifetime}.pending.jsonl`);
  return { onChain: done !== null, map: new Map(rows.map((r) => [r.intent, r])) };
}
// ---------------------------------------------------------------- the dictionary, day by day
type Cell = { word: string; share: number } | null;
interface Snap { match: number; gen: number; day: number; key: string; home: number; alive: boolean; tops: ([string, number] | null)[] }
interface LexDay { day: number; gen: number; dialect: Cell[][]; known: number; withinTown: number; betweenTowns: number; living: number; changes: Change[] }
interface Change { day: number; gen: number; town: number; meaning: number; from: string | null; to: string | null; kind: 'new' | 'replaced' | 'spread' | 'lost'; by: string | null; origin: string | null; atBirth: boolean }

/** One evening's dictionary, measured like lang/measure.ts: each living agent's best word per
 *  meaning (if at least theta sure), the town's most common one, and how much speakers agree. */
function measureSnaps(rows: Snap[]) {
  const pop = rows.filter((r) => r.alive);
  const tops = pop.map((r) => r.tops.map((t) => (t && t[1] >= THETA ? t[0] : null)));
  const dialect: Cell[][] = V.TOWNS.map((_, t) => Array.from({ length: N_MEANINGS }, (_, m) => {
    const here = pop.map((r, i) => ({ r, i })).filter(({ r }) => r.home === t);
    const counts = new Map<string, number>();
    for (const { i } of here) { const w = tops[i][m]; if (w) counts.set(w, (counts.get(w) ?? 0) + 1); }
    const best = [...counts].sort((x, y) => y[1] - x[1])[0];
    return best ? { word: best[0], share: best[1] / here.length } : null;
  }));
  const agree = (same: boolean) => {
    let n = 0, k = 0;
    for (let i = 0; i < pop.length; i++) for (let j = i + 1; j < pop.length; j++) {
      if ((pop[i].home === pop[j].home) !== same) continue;
      for (let m = 0; m < N_MEANINGS; m++) { if (m === NUM(1)) continue; n++; if (tops[i][m] && tops[i][m] === tops[j][m]) k++; }
    }
    return n ? k / n : 0;
  };
  const known = pop.length ? tops.reduce((s, t) => s + t.filter((x, m) => x && m !== NUM(1)).length, 0) / pop.length : 0;
  return { dialect, known, withinTown: agree(true), betweenTowns: agree(false), living: pop.length };
}

/** What changed in the dictionary since the evening before (or, on a lifetime's first evening,
 *  since the parents' last one: what the children inherited differently). */
function diff(prev: Cell[][] | null, cur: Cell[][], day: number, gen: number, atBirth: boolean, origins: Map<string, { kind: string; by: string }>): Change[] {
  if (!prev) return [];
  const out: Change[] = [];
  for (let t = 0; t < V.TOWNS.length; t++) for (let m = 0; m < N_MEANINGS; m++) {
    if (m === NUM(1)) continue;
    const from = prev[t]?.[m]?.word ?? null, to = cur[t]?.[m]?.word ?? null;
    if (from === to) continue;
    const elsewhere = !!to && prev.some((town, u) => u !== t && town?.[m]?.word === to);
    const kind: Change['kind'] = !to ? 'lost' : elsewhere ? 'spread' : from ? 'replaced' : 'new';
    const o = to ? origins.get(to) : undefined;
    out.push({ day, gen, town: t, meaning: m, from, to, kind, by: o?.by ?? null, origin: o?.kind ?? null, atBirth });
  }
  return out;
}

const lexCache = new Map<number, { stamp: string; days: LexDay[] }>();
/** Every evening of a lifetime: the dictionary, the agreement measures, and what changed. */
function lexicon(lifetime: number): LexDay[] {
  const f = `${DIR}lexicon/${lifetime}.jsonl`;
  if (!existsSync(f)) return [];
  const ids = lexLifetimes();
  const before = ids.filter((x) => x < lifetime).pop();
  const pf = before !== undefined ? `${DIR}lexicon/${before}.jsonl` : null;
  const stamp = `${statSync(f).size}|${pf && existsSync(pf) ? statSync(pf).size : 0}`;
  const hit = lexCache.get(lifetime);
  if (hit && hit.stamp === stamp) return hit.days;
  const origins = new Map(readJson<{ form: string; kind: string; by: string }[]>(`${DIR}registry.json`, []).map((o) => [o.form, o]));
  const byDay = (rows: Snap[]) => { const m = new Map<number, Snap[]>(); for (const r of rows) { if (!m.has(r.day)) m.set(r.day, []); m.get(r.day)!.push(r); } return [...m].sort((a, b) => a[0] - b[0]); };
  // The island's very first evening is compared with nothing: every word in it is new.
  let prev: Cell[][] | null = V.TOWNS.map(() => Array.from({ length: N_MEANINGS }, () => null));
  if (pf) { const last = byDay(readJsonl(pf) as Snap[]).pop(); if (last) prev = measureSnaps(last[1]).dialect; }
  const days: LexDay[] = [];
  byDay(readJsonl(f) as Snap[]).forEach(([day, rows], i) => {
    const m = measureSnaps(rows);
    const gen = rows[0]?.gen ?? 0;
    days.push({ day, gen, ...m, changes: diff(prev, m.dialect, day, gen, i === 0 && !!pf, origins) });
    prev = m.dialect;
  });
  lexCache.set(lifetime, { stamp, days });
  return days;
}
const lexLifetimes = () => (existsSync(`${DIR}lexicon/`) ? readdirSync(`${DIR}lexicon/`).map((f) => Number(f.split('.')[0])).filter(Number.isFinite).sort((a, b) => a - b) : []);

/**
 * An interlinear gloss: each spoken token → what most of the island took it to mean at the time
 * (the dictionary of the evening before: the town's own words first, then any town's; before the
 * first evening, the end of the previous generation; failing that, what the word was coined for),
 * or null if nobody had settled on it. A reader's aid only: agents never see this.
 */
function glosser() {
  const gens = readJsonl(`${DIR}generations.jsonl`) as { gen: number; match: number; dialect: Cell[][] }[];
  const coined = new Map(readJson<{ form: string; meaning?: number }[]>(`${DIR}registry.json`, []).filter((o) => o.meaning !== undefined).map((o) => [o.form, MEANING_NAMES[o.meaning!]]));
  const inverted = new Map<string, Map<string, string>[]>(); // per dictionary: per town (4) + island (index 4)
  const invert = (key: string, dialect: Cell[][] | undefined) => {
    if (inverted.has(key)) return inverted.get(key)!;
    const maps = Array.from({ length: 5 }, () => new Map<string, { m: string; s: number }>());
    (dialect ?? []).forEach((town, t) => town?.forEach((c, k) => {
      if (!c?.word || k === NUM(1)) return; // 'one' is unmarked: never glossed
      for (const mm of [maps[t], maps[4]]) { const was = mm.get(c.word); if (!was || c.share > was.s) mm.set(c.word, { m: MEANING_NAMES[k], s: c.share }); }
    }));
    const out = maps.map((mm) => new Map([...mm].map(([w, v]) => [w, v.m])));
    inverted.set(key, out);
    return out;
  };
  const dictionaryAt = (lifetime: number, gen: number, day: number) => {
    const ev = lexicon(lifetime).filter((x) => x.day < day).pop();
    if (ev) return invert(`${lifetime}:${ev.day}`, ev.dialect);
    const row = [...gens].reverse().find((g) => g.gen < gen) ?? [...gens].reverse().find((g) => g.gen <= gen);
    return invert(`g${row?.gen ?? 0}`, row?.dialect);
  };
  return (t: { match: number; gen: number; day: number; town: number; said?: string }) => {
    const maps = dictionaryAt(t.match, t.gen, t.day);
    return (t.said ?? '').split(' ').filter(Boolean).map((w) => maps[t.town]?.get(w) ?? maps[4].get(w) ?? coined.get(w) ?? null);
  };
}
/** A recorded table, as the viewer gets it: with what its maker meant and the gloss. Old-format
 *  rows (no maker key or goods) are dropped: they would render as empty rows. */
const complete = (t: any) => t && t.makerKey && t.give !== undefined && Array.isArray(t.rounds);
function joinTable(t: any, i: number, r: ReturnType<typeof reveals>, gloss: ReturnType<typeof glosser>) {
  const x = r.map.get(t.intent);
  // Viewers see what the maker meant; `revealed` says whether its lifetime is over and the
  // reveal is public (anyone can then check it against the hash in the on-chain `show`).
  return { ...t, i, meant: x ? { good: V.GOODS[x.want], qty: x.wantQ } : null, revealed: r.onChain, gloss: gloss(t) };
}
function talk(lifetime: number, from: number | null, n: number) {
  const r = reveals(lifetime);
  const gloss = glosser();
  const rows = readJsonl(`${DIR}talk/${lifetime}.jsonl`).map((t, i) => ({ t, i }));
  const picked = from !== null ? rows.slice(from) : rows.slice(-n);
  return { tables: picked.filter(({ t }) => complete(t)).map(({ t, i }) => joinTable(t, i, r, gloss)), next: rows.length };
}
const lifetimes = () => (existsSync(`${DIR}talk/`) ? readdirSync(`${DIR}talk/`).map((f) => Number(f.split('.')[0])).filter(Number.isFinite).sort((a, b) => a - b) : []);

// ---------------------------------------------------------------- words through time
function words() {
  const gens = readJsonl(`${DIR}generations.jsonl`);
  const registry = readJson<{ form: string; kind: string; by: string; gen: number; meaning?: number; from?: string }[]>(`${DIR}registry.json`, []);
  return {
    meanings: MEANING_NAMES.slice(0, N_MEANINGS),
    towns: V.TOWNS,
    // dialects[g][town][meaning] = { word, share }: the most common word, and who uses it.
    dialects: gens.map((g) => ({ gen: g.gen, lifetime: g.match, dialect: g.dialect })),
    origins: Object.fromEntries(registry.map((o) => [o.form, { kind: o.kind, by: o.by, gen: o.gen, coinedFor: o.meaning !== undefined ? MEANING_NAMES[o.meaning] : null, from: o.from ?? null }])),
  };
}

/** Hear the drift: one meaning, one town, generation by generation, each word in the voice of
 *  the family most common in that town at the time. */
function drift(meaning: number, town: number) {
  const ps = people();
  const fams = ps.filter((p) => p.generation === 1).map((p) => p.name);
  return readJsonl(`${DIR}generations.jsonl`).map((g) => {
    const w = g.dialect?.[town]?.[meaning]?.word as string | undefined;
    if (!w) return { gen: g.gen, word: null, hash: null };
    const here = ps.filter((p) => p.generation === g.gen && p.home === town);
    const count = new Map<string, number>();
    for (const p of here) count.set(p.family, (count.get(p.family) ?? 0) + 1);
    const family = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fams[0] ?? 'Ada';
    const v = voice(family, spoken(w, 'clearly', '.'), `drift-${g.gen}`, fams);
    return { gen: g.gen, word: w, family, hash: v?.hash ?? null };
  });
}

// ---------------------------------------------------------------- the days (who stood where, holdings, hunger)
const days = (lifetime: number) => readJsonl(`${DIR}days.jsonl`).filter((r) => r.match === lifetime);

/** Solana, in numbers: transactions, messages, verified meanings. */
function chainStats() {
  const gens = readJsonl(`${DIR}generations.jsonl`);
  const talk = lifetimes().flatMap((id) => readJsonl(`${DIR}talk/${id}.jsonl`));
  const utterances = talk.reduce((n, t) => n + 1 + t.rounds.reduce((m: number, r: any) => m + r.bids.length + (r.reaction ? 1 : 0), 0), 0);
  const revealed = lifetimes().reduce((n, id) => n + readJson<any[]>(`${DIR}intents/${id}.json`, []).length, 0);
  const tx = readJsonl(new URL(`../data/${CLUSTER}/tx-stats.jsonl`, import.meta.url).pathname).slice(-500);
  const ms = tx.map((r) => r.ms).sort((a, b) => a - b);
  return {
    cluster: LABEL, onChain: !FILES_ONLY, program: V.VILLAGE_PROGRAM_ADDRESS,
    transactions: gens.reduce((n, g) => n + (g.txs ?? 0), 0), lifetimes: gens.length, utterances, revealed,
    births: readJsonl(`${DIR}births.jsonl`).length, confirmMs: !FILES_ONLY && ms.length ? ms[Math.floor(ms.length / 2)] : null,
  };
}

// ---------------------------------------------------------------- research (recomputed when a lifetime ends)
let research: { at: number; computed: number; result: unknown } | null = null;
/** The analysis, recomputed when a generation ends, but at most every 5 s: a fast live island
 *  ends generations faster than the analysis runs, and the server must keep streaming. */
function getResearch() {
  const stamp = existsSync(`${DIR}generations.jsonl`) ? statSync(`${DIR}generations.jsonl`).mtimeMs : 0;
  if (research && (research.at === stamp || Date.now() - research.computed < 5000)) return research.result;
  // One malformed record must not take the Discoveries / What wins pages down: keep serving the
  // last good analysis and log the error.
  try {
    const r = analyze(load(DIR));
    research = { at: stamp, computed: Date.now(), result: { ...r, findings: findings(r) } };
  } catch (e) {
    console.error('research failed:', (e as Error).stack ?? e);
    if (!research) throw e;
  }
  return research.result;
}

// ---------------------------------------------------------------- the live lifetime (chain)
/** The live director's heartbeat, if it is fresh (under 15 s old). */
function liveBeat() {
  const hb = readJson<{ pid: number; at: number; gen: number; day: number; market: number; tableMs: number; done?: boolean } | null>(`${DIR}live.json`, null);
  return hb && Date.now() - hb.at < 15000 ? hb : null;
}
let chain: Chain | null = null;
let live: unknown = null;
async function refreshState() {
  const st = state();
  const ps = new Map(people().map((p) => [p.key, p]));
  const current = st.current.map((k) => ps.get(k)).filter(Boolean) as Person[];
  let match = null;
  if (chain) {
    // The lifetime being played: the newest match id the director has used.
    const ids = lifetimes();
    const id = Math.max(st.nextMatch - 1, ...ids, 0);
    const m = id ? await chain.match(st.nextMatch).then((x) => x ?? chain!.match(id)).catch(() => null) : null;
    if (m) {
      const who = byWallet();
      match = {
        id: m.id, status: m.status, day: m.day, days: m.days, n: m.n, utterances: m.utterances,
        events: m.events.filter((e) => e.start !== 65535).map((e) => ({ kind: V.EVENTS[e.kind], town: e.town === V.NONE ? null : V.TOWNS[e.town], start: e.start, len: e.len })),
        agents: m.agents.slice(0, m.n).map((a, slot) => {
          const p = who.get(a.wallet);
          return { slot, key: p?.key ?? null, name: p?.name ?? `slot ${slot}`, family: p?.family ?? null, generation: p?.generation ?? null, home: V.TOWNS[a.home], job: V.JOBS[a.job],
            location: V.TOWNS[a.location], loc: a.location, dest: a.dest, arriveDay: a.arriveDay, travelling: V.travelling(a, m.day), alive: a.alive, hunger: a.hunger, inv: Array.from(a.inv), trades: a.trades, score: V.scoreOf(m, slot) };
        }),
        tables: m.tables.map((t, k) => ({ k, ...t })).filter((t) => t.maker !== V.NONE).map((t) => ({ table: t.k, maker: t.maker, town: V.TOWNS[t.town], give: V.GOODS[t.giveKind], qty: t.giveQty, bids: m.bids.filter((b) => b.table === t.k).map((b) => ({ bidder: b.bidder, good: V.GOODS[b.kind], qty: b.qty })) })),
      };
    }
  }
  const hb = liveBeat();
  const lastGen = readJsonl(`${DIR}generations.jsonl`).pop();
  const next = {
    cluster: LABEL, program: V.VILLAGE_PROGRAM_ADDRESS, filesOnly: FILES_ONLY, generation: st.generation, lifetimes: lifetimes(), current, match,
    // A director is playing this island right now (fresh heartbeat), at this pace and market.
    live: !!hb, now: hb ? { gen: hb.gen, day: hb.day, tableMs: hb.tableMs, done: !!hb.done } : null,
    // The market rule: the chance a maker takes a bid that is not what it asked for.
    market: hb?.market ?? lastGen?.market ?? null,
  };
  if (json(next) !== json(live)) { live = next; broadcast('state', next); }
}

// Every utterance as it lands on-chain: decode the program's events from its logs.
const b64 = getBase64Encoder();
const EVENTS = Object.entries(V).filter(([k]) => k.endsWith('_EVENT_DISCRIMINATOR')).map(([k, disc]) => {
  const name = k.replace(/_EVENT_DISCRIMINATOR$/, '').toLowerCase().replace(/_(\w)/g, (_m, c) => c.toUpperCase());
  const type = name[0].toUpperCase() + name.slice(1);
  return { type, disc: disc as Uint8Array, parse: (V as unknown as Record<string, (d: Uint8Array) => unknown>)[`parse${type}Event`] };
});
const SPOKEN = new Set(['Shown', 'BidPlaced', 'Accepted', 'Rejected', 'Said']);
function decode(signature: string, logs: readonly string[]) {
  const m = live as { match?: { agents: { slot: number; name: string; key: string | null }[] } } | null;
  for (const line of logs) {
    const mm = line.match(/^Program data: (.+)$/);
    if (!mm) continue;
    const data = b64.encode(mm[1]) as Uint8Array;
    const ev = EVENTS.find((e) => e.disc.every((b, i) => data[i] === b));
    if (!ev?.parse) continue;
    try {
      const d = JSON.parse(json(ev.parse(data))) as Record<string, number | string>;
      const row = { type: ev.type, signature, at: Date.now(), data: d };
      appendFileSync(`${DIR}events.jsonl`, JSON.stringify(row) + '\n');
      if (SPOKEN.has(ev.type)) {
        const slot = Number(d.maker ?? d.bidder ?? d.slot);
        const speaker = ev.type === 'BidPlaced' ? Number(d.bidder) : ev.type === 'Said' ? Number(d.slot) : Number(d.maker);
        const who = m?.match?.agents.find((a) => a.slot === speaker);
        broadcast('utterance', { type: ev.type, lifetime: d.id, day: d.day, town: V.TOWNS[Number(d.town)], speaker: who?.name ?? `slot ${speaker}`, key: who?.key ?? null, words: d.words, signature, slot });
      } else broadcast('event', row);
    } catch { /* not ours */ }
  }
}
async function subscribe() {
  for (;;) {
    try {
      const abort = new AbortController();
      const notes = await rpcSubscriptions.logsNotifications({ mentions: [V.VILLAGE_PROGRAM_ADDRESS] }, { commitment: 'confirmed' }).subscribe({ abortSignal: abort.signal });
      console.log('following the program on', CLUSTER);
      for await (const n of notes) {
        if (!n.value.err) decode(n.value.signature, n.value.logs);
        void refreshState();
      }
    } catch (e) {
      console.error('log subscription dropped:', String((e as Error).message ?? e).slice(0, 120));
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ---------------------------------------------------------------- the director's files, as they grow
const offsets = new Map<string, { at: number; line: number }>();
/** New complete lines of a file since the last look (a half-written last line waits). Files
 *  that exist at startup are read from their end; files that appear later, from the start. */
function tail(file: string, each: (row: unknown, line: number) => void) {
  if (!existsSync(file)) { if (!offsets.has(file)) offsets.set(file, { at: 0, line: 0 }); return; }
  const size = statSync(file).size;
  if (!offsets.has(file)) offsets.set(file, { at: size, line: readFileSync(file, 'utf8').split('\n').filter(Boolean).length });
  const o = offsets.get(file)!;
  if (size < o.at) { o.at = 0; o.line = 0; } // the island was wiped and started again
  if (size <= o.at) return;
  const chunk = readFileSync(file).subarray(o.at, size);
  const end = chunk.lastIndexOf(10); // '\n'
  if (end < 0) return;
  o.at += end + 1;
  for (const l of chunk.subarray(0, end).toString('utf8').split('\n').filter(Boolean)) { const line = o.line++; try { each(JSON.parse(l), line); } catch { /* not a row */ } }
}
let researchTimer: ReturnType<typeof setTimeout> | null = null;
/** Recompute and broadcast the research once things settle (debounced). */
function researchSoon() {
  if (researchTimer) return;
  researchTimer = setTimeout(() => { researchTimer = null; research = research && { ...research, computed: 0 }; broadcast('research', getResearch()); }, 1500);
}
function scan() {
  for (const id of lifetimes().slice(-2)) {
    const f = `${DIR}talk/${id}.jsonl`;
    if (!offsets.has(f)) offsets.set(f, { at: 0, line: 0 }); // a lifetime that began after we started: from its first table
    let r: ReturnType<typeof reveals> | null = null, gloss: ReturnType<typeof glosser> | null = null;
    // Live rows go out exactly as /talk serves them: with what was meant, and the gloss.
    tail(f, (t, i) => { if (!complete(t)) return; r ??= reveals(id); gloss ??= glosser(); broadcast('table', joinTable(t, i, r, gloss)); });
  }
  for (const id of lexLifetimes().slice(-1)) {
    const f = `${DIR}lexicon/${id}.jsonl`;
    if (!offsets.has(f)) offsets.set(f, { at: 0, line: 0 });
    let any = false;
    tail(f, () => { any = true; });
    if (any) broadcast('lexicon', { lifetime: id, days: lexicon(id) });
  }
  tail(`${DIR}days.jsonl`, (d) => broadcast('day', d));
  tail(`${DIR}births.jsonl`, (b) => broadcast('birth', b));
  tail(`${DIR}history.jsonl`, (h) => broadcast('history', h));
  tail(`${DIR}thoughts.jsonl`, (t) => broadcast('thought', t));
  let ended = false;
  tail(`${DIR}generations.jsonl`, (g) => { broadcast('generation', g); ended = true; });
  if (ended) researchSoon();
}

// ---------------------------------------------------------------- HTTP
const send = (res: ServerResponse, body: unknown, type = 'application/json') => { res.writeHead(body === null ? 404 : 200, { 'content-type': type }); res.end(typeof body === 'string' ? body : json(body)); };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  res.setHeader('access-control-allow-origin', '*');
  const p = url.pathname;
  try {
    if (p === '/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      clients.add(res);
      res.write(`event: state\ndata: ${json(live)}\n\n`);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (p === '/state') return send(res, live);
    if (p === '/people') {
      const kids = new Map<string, number>();
      for (const b of readJsonl(`${DIR}births.jsonl`)) kids.set(b.parent, (kids.get(b.parent) ?? 0) + 1);
      return send(res, people().map((x) => ({ ...x, homeName: V.TOWNS[x.home], jobName: V.JOBS[x.job], children: kids.get(x.key) ?? 0 })));
    }
    if (p.startsWith('/mind/')) return send(res, mind(decodeURIComponent(p.slice(6))));
    if (p.startsWith('/record/')) return send(res, record(decodeURIComponent(p.slice(8))));
    if (p === '/talk') {
      const ids = lifetimes();
      const id = Number(url.searchParams.get('lifetime') ?? ids[ids.length - 1] ?? 0);
      const from = url.searchParams.get('from');
      return send(res, { lifetime: id, ...talk(id, from === null ? null : Number(from), Number(url.searchParams.get('n') ?? 400)) });
    }
    if (p === '/lexicon') {
      const ids = lexLifetimes();
      const id = Number(url.searchParams.get('lifetime') ?? ids[ids.length - 1] ?? 0);
      return send(res, { lifetime: id, meanings: MEANING_NAMES.slice(0, N_MEANINGS), towns: V.TOWNS, days: lexicon(id) });
    }
    if (p === '/control') {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' }); return res.end(); }
      if (req.method !== 'POST') return send(res, readJson(`${DIR}control.json`, { tableMs: 1200 }));
      const ip = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) { res.writeHead(403); return res.end('localhost only'); }
      let body = '';
      for await (const c of req) body += c;
      const ms = Number((JSON.parse(body || '{}') as { tableMs?: number }).tableMs);
      if (!Number.isFinite(ms)) { res.writeHead(400); return res.end('tableMs?'); }
      const control = { tableMs: Math.min(5000, Math.max(0, Math.round(ms))) };
      writeFileSync(`${DIR}control.json`, JSON.stringify(control));
      return send(res, control);
    }
    if (p === '/conditions') return send(res, worlds() ?? readJson(CONDITIONS, null));
    if (p === '/evidence') return send(res, { confirm: readJson(`${DATA}confirm/result.json`, null), confirm2: readJson(`${DATA}confirm2/result.json`, null) });
    if (p === '/generations') return send(res, readJsonl(`${DIR}generations.jsonl`));
    if (p === '/births') return send(res, readJsonl(`${DIR}births.jsonl`));
    if (p === '/words') return send(res, words());
    if (p === '/history') return send(res, readJsonl(`${DIR}history.jsonl`));
    const lt = () => { const ids = lifetimes(); return Number(url.searchParams.get('lifetime') ?? ids[ids.length - 1] ?? 0); };
    if (p === '/days') return send(res, days(lt()));
    if (p === '/stats') return send(res, chainStats());
    if (p === '/thoughts') {
      const k = url.searchParams.get('key'), life = url.searchParams.get('lifetime');
      return send(res, readJsonl(`${DIR}thoughts.jsonl`).filter((t) => (!k || t.key === k) && (!life || t.match === Number(life))).slice(-Number(url.searchParams.get('n') ?? 50)));
    }
    if (p === '/drift') return send(res, drift(Number(url.searchParams.get('meaning') ?? 0), Number(url.searchParams.get('town') ?? 0)));
    if (p === '/research') return send(res, getResearch());
    if (p === '/replication') {
      const merged = lockedReplication();
      if (merged) return send(res, merged);
      // The replication run under this island's market rule (falls back to the lenient one).
      const m = (live as { market?: number | null } | null)?.market;
      const f = m !== null && m !== undefined && m !== 0.5 ? new URL(`../data/replicate-flex${m}/summary.json`, import.meta.url).pathname : REPLICATE;
      return send(res, readJson(existsSync(f) ? f : REPLICATE, null));
    }
    const ds = p.match(/^\/dataset\/(\w+)\.(csv|json)$/);
    if (ds) {
      const t = tables(load(DIR))[ds[1]];
      if (!t) return send(res, null);
      res.setHeader('content-disposition', `attachment; filename="mother-tongue-${LABEL.replace(/\W+/g, '-')}-${ds[1]}.${ds[2]}"`);
      return ds[2] === 'csv' ? send(res, csv(t), 'text/csv') : send(res, t);
    }
    send(res, { endpoints: ['/stream', '/state', '/people', '/mind/:key', '/talk?lifetime=&from=', '/lexicon?lifetime=', '/generations', '/births', '/words', '/research', '/replication', '/conditions', '/dataset/:table.csv', 'POST /control'] });
  } catch (e) {
    res.writeHead(500); res.end(String((e as Error).message ?? e));
  }
}).listen(PORT, () => console.log(`Mother Tongue indexer · ${LABEL}${FILES_ONLY ? ' (recorded files)' : ''} · :${PORT}`));

if (!FILES_ONLY) { chain = await rpcChain(); void subscribe(); }
await refreshState();
// A live island (a director writing a heartbeat here) is scanned every half second, so the viewer
// gets each table as it happens; a recording barely changes.
const LIVE_ISLAND = LABEL === 'live' || existsSync(`${DIR}live.json`);
// What is already on disk at startup is served by /talk and /lexicon, not re-broadcast.
for (const id of lifetimes()) tail(`${DIR}talk/${id}.jsonl`, () => {});
for (const id of lexLifetimes()) tail(`${DIR}lexicon/${id}.jsonl`, () => {});
scan();
setInterval(scan, LIVE_ISLAND ? 500 : 3000);
setInterval(() => void refreshState(), LIVE_ISLAND ? 1000 : FILES_ONLY ? 3000 : 5000);


// ---------------------------------------------------------------- RESEARCH.md §10: worlds and the locked world's islands
type Sum = Record<string, any>;
const sigCount = (xs: { rho: number; p: number }[], sign: number) => xs.filter((x) => x.p < 0.05 && Math.sign(x.rho) === sign).length;
const avg = (xs: number[]) => { const ys = xs.filter(Number.isFinite); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN; };
function worlds() {
  const rows = WORLDS.map((w) => {
    const s = readJson<{ summary: Sum } | null>(`${DATA}confirm/world-${w.id}/summary.json`, null)?.summary;
    if (!s) return null;
    return {
      id: w.id, label: w.label, rule: w.rule, mine: w.id === '3', islands: s.seeds, gens: s.gens,
      survived: s.extinct.filter((e: unknown) => e === null).length,
      understoodLate: avg(s.understoodLate), contextLate: avg(s.contextLate),
      clarity: { k: sigCount(s.clarity, 1), of: s.clarity.length, meanRho: avg(s.clarity.map((c: any) => c.rho)), positive: s.clarity.filter((c: any) => c.rho > 0).length },
      comprehension: { k: sigCount(s.selection, 1), of: s.selection.length, meanRho: avg(s.selection.map((c: any) => c.rho)) },
      deathsPerGen: avg(s.deathsPerGen), misunderstoodDeals: avg(s.misunderstoodDeals ?? []),
      clarityHalves: { top: avg(s.clarityHalves.map((h: any) => h.top)), bottom: avg(s.clarityHalves.map((h: any) => h.bottom)) },
      drivers: s.drivers,
    };
  }).filter(Boolean);
  return rows.length === WORLDS.length ? { kind: 'worlds', conditions: rows } : null;
}
/** The locked world's confirmation islands (§10.3 + §10.4) as one replication summary. */
function lockedReplication() {
  const a = readJson<{ summary: Sum } | null>(`${DATA}confirm/world-3/summary.json`, null)?.summary;
  const b = readJson<{ summary: Sum } | null>(`${DATA}confirm2/world-3/summary.json`, null)?.summary;
  if (!a || !b) return null;
  const out: Sum = { ...a, seeds: a.seeds + b.seeds, locked: true };
  for (const k of Object.keys(a)) if (Array.isArray(a[k]) && a[k].length === a.seeds && Array.isArray(b[k])) out[k] = [...a[k], ...b[k]];
  out.drivers = (a.drivers as any[]).map((d) => {
    const e = (b.drivers as any[]).find((x) => x.feature === d.feature);
    if (!e) return d;
    const side = (k: 'children' | 'standing') => {
      const x = d[k], y = e[k], n = x.islands + y.islands;
      const m = (x.meanEffect * x.islands + y.meanEffect * y.islands) / n;
      return x.kind === 'group' || d.kind === 'group'
        ? { ...x, significant: (x.significant ?? 0) + (y.significant ?? 0), meanEffect: m, islands: n }
        : { ...x, positive: (x.positive ?? 0) + (y.positive ?? 0), negative: (x.negative ?? 0) + (y.negative ?? 0), meanEffect: m, islands: n };
    };
    return { ...d, children: side('children'), standing: side('standing') };
  });
  return { summary: out };
}


// ---------------------------------------------------------------- one life as receipts (the interview)
/** Every table an agent made or bid at in its lifetime, joined to what the maker really meant, the
 *  agent's own guess and the outcome; plus its logged thoughts. `falseBlame`: its bid had the right
 *  good but too few, was turned down, and so it doubted words it had right (RESEARCH.md §7). */
function record(key: string) {
  const me = people().find((x) => x.key === key);
  if (!me) return null;
  const life = (me as { lived?: number | null }).lived ?? lifetimes().find((id) => readJsonl(`${DIR}talk/${id}.jsonl`).some((t) => t.makerKey === key)) ?? null;
  if (life === null) return { key, name: me.name, lifetime: null, entries: [], thoughts: [] };
  const r = reveals(life);
  const G = V.GOODS;
  const entries: Record<string, unknown>[] = [];
  for (const t of readJsonl(`${DIR}talk/${life}.jsonl`)) {
    if (!complete(t)) continue;
    const x = r.map.get(t.intent);
    const meant = x ? { good: G[x.want], qty: x.wantQ } : null;
    const town = V.TOWNS[t.town];
    if (t.makerKey === key) {
      const taken = t.rounds.flatMap((rd: any) => rd.bids.filter((b: any) => b.key === rd.taken))[0];
      entries.push({ day: t.day, town, role: 'offered', shows: t.shows, said: t.said, meant, outcome: t.result, got: taken ? taken.offered : null, from: taken ? taken.who : null });
      continue;
    }
    for (const rd of t.rounds) {
      const bid = rd.bids.find((b: any) => b.key === key);
      if (!bid) continue;
      const guess = t.guesses?.[key]?.[0];
      const outcome = rd.taken === key ? 'taken' : rd.taken ? 'outbid' : 'turned down';
      const rightGood = !!x && bid.g === x.want;
      entries.push({
        day: t.day, town, role: 'bid', maker: t.maker, shows: t.shows, said: t.said, meant,
        guessed: guess ? { good: G[guess[0]], qty: guess[1] } : null, offered: bid.offered, outcome,
        falseBlame: outcome === 'turned down' && rightGood,
      });
    }
  }
  const thoughts = readJsonl(`${DIR}thoughts.jsonl`).filter((th) => th.key === key).map((th) => ({ day: th.day, kind: th.kind, thought: th.thought, word: th.word ?? null, meaning: th.meaning ?? null }));
  return { key, name: me.name, lifetime: life, revealed: r.onChain, entries, thoughts };
}
