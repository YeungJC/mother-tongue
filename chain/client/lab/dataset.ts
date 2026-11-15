// Mother Tongue: the open dataset. Flat tables built from what the director recorded, joined to
// the reveals, for anyone to analyse in their own tools. Schema: RESEARCH.md.
//   npx tsx lab/dataset.ts [cluster]      writes data/<cluster>/dataset/*.csv
import { mkdirSync, writeFileSync } from 'node:fs';
import { GOODS, MEANING_NAMES, N_MEANINGS, NUM } from '../lang/engine.ts';
import { type Data, CATEGORY, analyze, load } from './research.ts';

const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere'];
const JOBS = ['farmer', 'woodcutter', 'miner', 'smith', 'carpenter'];
type Row = Record<string, string | number | boolean | null>;

export function tables(d: Data): Record<string, Row[]> {
  const name = (k: string) => d.people.get(k)?.name ?? k;
  const home = (k: string) => d.people.get(k)?.home ?? -1;
  const utterances: Row[] = [];
  const guesses: Row[] = [];
  d.tables.forEach((t, i) => {
    const id = `${t.match}-${t.day}-${t.town}-${i}`;
    const r = d.reveals.get(t.intent);
    const base = { table_id: id, market: d.gens[0]?.market ?? 0.5, lifetime: t.match, generation: t.gen, day: t.day, town: TOWNS[t.town] };
    utterances.push({ ...base, round: 0, role: 'show', speaker: t.maker, speaker_home: TOWNS[t.makerHome], words: t.said, tokens: t.said ? t.said.split(' ').length : 0,
      goods: GOODS[t.give], qty: t.giveQ, meant_good: r ? GOODS[r.want] : null, meant_qty: r?.wantQ ?? null, outcome: t.result, intent_hash: t.intent });
    t.rounds.forEach((rd, k) => {
      for (const b of rd.bids) utterances.push({ ...base, round: k + 1, role: 'bid', speaker: b.who, speaker_home: TOWNS[home(b.key)], words: b.said, tokens: b.said ? b.said.split(' ').length : 0,
        goods: GOODS[b.g], qty: b.q, meant_good: GOODS[b.g], meant_qty: b.q, outcome: rd.taken === b.key ? 'taken' : rd.taken ? 'lost' : 'rejected', intent_hash: null });
      if (rd.reaction) utterances.push({ ...base, round: k + 1, role: rd.taken ? 'accept' : 'reject', speaker: t.maker, speaker_home: TOWNS[t.makerHome], words: rd.reaction, tokens: 1,
        goods: null, qty: null, meant_good: rd.taken ? 'yes' : 'no', meant_qty: null, outcome: rd.taken ? 'accept' : 'reject', intent_hash: null });
    });
    for (const [k, gs] of Object.entries(t.guesses)) gs.forEach(([g, q], round) => guesses.push({
      ...base, listener: name(k), listener_home: TOWNS[home(k)], round: round + 1, said: t.said, guess_good: GOODS[g], guess_qty: q,
      correct: r ? g === r.want && q === r.wantQ : null, bid: t.rounds[round]?.bids.some((b) => b.key === k) ?? false,
    }));
  });
  const kids = new Map<string, number>();
  for (const b of d.births) kids.set(b.parent, (kids.get(b.parent) ?? 0) + 1);
  // The market rule the island ran under (chance a maker takes a bid it didn't ask for). Islands
  // recorded before the rule was a setting all ran at the old fixed 0.5.
  const market = d.gens[0]?.market ?? 0.5;
  const life = new Map(analyze(d).selection.rows.map((r) => [r.key, r]));
  const num = (x: number | undefined) => (x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  const lives: Row[] = [...d.people.values()].map((p) => {
    const r = life.get(p.key);
    return {
      key: p.key, name: p.name, family: p.family, generation: p.generation, home: TOWNS[p.home], job: JOBS[p.job], parent: p.parent ? name(p.parent) : null,
      mind: p.brain ?? 'habit', market,
      lifetime: p.lived, place: p.place === null ? null : p.place + 1, score: p.score, standing: num(r?.standing), survived: p.survived, children: kids.get(p.key) ?? 0,
      clarity: num(r?.clarity), offers_made: r?.tables ?? null, comprehension: num(r?.comprehension), guesses_made: r?.guesses ?? null,
      inherited_words: r?.inheritedWords ?? null, trades: r?.trades ?? null, trips: r?.trips ?? null, hungry_days: r?.hungryDays ?? null,
      deals_as_maker: r?.dealsAsMaker ?? null, deals_as_bidder: r?.dealsAsBidder ?? null, misread_share: num(r?.misreadShare),
    };
  });
  const births: Row[] = d.births.map((b) => {
    let had = 0, kept = 0, changed = 0, lost = 0;
    for (let m = 0; m < N_MEANINGS; m++) {
      if (m === NUM(1)) continue;
      const p = b.parentTops[m], c = b.inherited[m];
      if (!p || p[1] < 0.2) continue;
      had++;
      if (c && c[1] >= 0.2 && c[0] === p[0]) kept++; else if (c && c[1] >= 0.2) changed++; else lost++;
    }
    return { child: name(b.child), parent: name(b.parent), generation: b.gen, town: TOWNS[b.town], parent_town: TOWNS[b.parentHome], raised_elsewhere: b.town !== b.parentHome,
      episodes_heard: b.heard, parent_words: had, kept, changed, lost, misheard: b.misheard.map((x) => `${x.from}>${x.to}`).join(' ') };
  });
  const firstSeen = new Map<string, number>();
  for (const u of utterances) for (const w of String(u.words ?? '').split(' ').filter(Boolean)) if (!firstSeen.has(w)) firstSeen.set(w, u.generation as number);
  const lastGen = d.gens[d.gens.length - 1];
  const words: Row[] = [...d.registry.values()].map((o) => {
    const usedFor = lastGen ? TOWNS.flatMap((tn, t) => Array.from({ length: N_MEANINGS }, (_, m) => (lastGen.dialect[t]?.[m]?.word === o.form ? `${tn}:${MEANING_NAMES[m]}` : null)).filter(Boolean)) : [];
    return { word: o.form, origin: o.kind, by: o.by, generation: o.gen, town: TOWNS[o.town] ?? null, coined_for: o.meaning !== undefined ? MEANING_NAMES[o.meaning] : null, misheard_from: o.from ?? null,
      first_spoken_generation: firstSeen.get(o.form) ?? null, in_use_now: usedFor.join(' ') };
  });
  const lexicon: Row[] = d.snapshots.flatMap((s) => s.tops.map((t, m) => (t ? { lifetime: s.match, generation: s.gen, day: s.day, agent: name(s.key), home: TOWNS[s.home], alive: s.alive, meaning: MEANING_NAMES[m], category: CATEGORY(m), word: t[0], confidence: t[1] } : null)).filter((x): x is NonNullable<typeof x> => !!x));
  return { messages: utterances, guesses, lives, births, words, lexicon };
}

export function csv(rows: Row[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

if (process.argv[1]?.endsWith('dataset.ts')) {
  const cluster = process.argv[2] ?? 'litesvm';
  const dir = new URL(`../data/${cluster}/tongue/`, import.meta.url).pathname;
  const out = new URL(`../data/${cluster}/dataset/`, import.meta.url).pathname;
  mkdirSync(out, { recursive: true });
  for (const [k, rows] of Object.entries(tables(load(dir)))) { writeFileSync(`${out}${k}.csv`, csv(rows)); console.log(`${k.padEnd(11)} ${String(rows.length).padStart(7)} rows → ${out}${k}.csv`); }
}
