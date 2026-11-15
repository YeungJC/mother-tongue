// Mother Tongue: the research. Reads what the director recorded (data/<cluster>/tongue/), joins
// every table to what its maker really meant (the reveal, checked against the on-chain hash), and
// answers the questions in RESEARCH.md, each with its sample size and, where it's a correlation,
// a permutation test: a small island makes patterns easy to imagine.
//   npx tsx lab/research.ts [cluster]          print the findings (default: litesvm)
//   npx tsx lab/research.ts devnet --json      the whole result as JSON
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { MEANING_NAMES, N_MEANINGS, NUM, NO, YES, mulberry32 } from '../lang/engine.ts';

const THETA = 0.2;
const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere'];
const JOBS = ['farmer', 'woodcutter', 'miner', 'smith', 'carpenter'];
export const CATEGORY = (m: number) => (m < 5 ? 'goods' : m === YES || m === NO ? 'yes/no' : 'numbers');

// ---------------------------------------------------------------- loading
type Top = [string, number] | null;
interface Person { key: string; name: string; family: string; generation: number; home: number; job: number; parent: string | null; brain?: string; greed?: number; lived: number | null; place: number | null; score: number | null; survived: boolean | null }
interface Bid { who: string; key: string; said: string; g: number; q: number }
interface Round { bids: Bid[]; outcome: string; reaction: string; taken: string | null }
interface Table { match: number; gen: number; day: number; town: number; maker: string; makerKey: string; makerHome: number; give: number; giveQ: number; said: string; intent: string; present: string[]; rounds: Round[]; result: string; guesses: Record<string, [number, number][]> }
interface Reveal { intent: string; maker: string; want: number; wantQ: number; salt: string }
interface Snapshot { match: number; gen: number; day: number; key: string; home: number; alive: boolean; tops: Top[] }
interface Birth { gen: number; child: string; parent: string; town: number; parentHome: number; heard: number; misheard: { from: string; to: string }[]; inherited: Top[]; parentTops: Top[] }
interface GenRow { gen: number; match: number; market?: number; understood: number; contextOnly: number; deaths: number; withinTown: number; betweenTowns: number; vocab: number; dialect: ({ word: string; share: number } | null)[][] }
interface DayRow { match: number; gen: number; day: number; agents: { key: string; score: number; alive: boolean; hunger: number; travelling: boolean; trades: number }[] }
interface Origin { form: string; kind: 'coined' | 'misheard'; by: string; gen: number; day: number; town: number; meaning?: number; from?: string }

const jsonl = <T>(f: string): T[] => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const json = <T>(f: string, d: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

export function load(dir: string) {
  const people = new Map(json<Person[]>(`${dir}people.json`, []).map((p) => [p.key, p]));
  const ids = (sub: string, ext: string) => (existsSync(dir + sub) ? readdirSync(dir + sub).filter((f) => f.endsWith(ext) && !f.includes('pending')).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b) : []);
  const reveals = new Map<string, Reveal>();
  let verified = 0, failed = 0;
  for (const id of ids('intents/', '.json')) {
    for (const r of json<Reveal[]>(`${dir}intents/${id}.json`, [])) {
      const h = createHash('sha256').update(`${r.want}:${r.wantQ}:${r.salt}`).digest('hex');
      if (h === r.intent) { verified++; reveals.set(r.intent, r); } else failed++;
    }
  }
  const tables = ids('talk/', '.jsonl').flatMap((id) => jsonl<Table>(`${dir}talk/${id}.jsonl`));
  const snapshots = ids('lexicon/', '.jsonl').flatMap((id) => jsonl<Snapshot>(`${dir}lexicon/${id}.jsonl`));
  return {
    people, tables, reveals, verified, failed, snapshots,
    births: jsonl<Birth>(`${dir}births.jsonl`),
    gens: jsonl<GenRow>(`${dir}generations.jsonl`),
    days: jsonl<DayRow>(`${dir}days.jsonl`),
    state: json<{ generation: number; current: string[] }>(`${dir}state.json`, { generation: 0, current: [] }),
    registry: new Map(json<Origin[]>(`${dir}registry.json`, []).map((o) => [o.form, o])),
  };
}
export type Data = ReturnType<typeof load>;

// ---------------------------------------------------------------- statistics
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function rank(xs: number[]) {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r as number[];
}
function pearson(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
export const spearman = (x: number[], y: number[]) => pearson(rank(x), rank(y));
/** Two-sided permutation p-value for a Spearman correlation. */
export function permutationP(x: number[], y: number[], n = 2000, seed = 1) {
  const r0 = Math.abs(spearman(x, y));
  if (!Number.isFinite(r0)) return NaN;
  const rng = mulberry32(seed);
  // Ranks of a shuffled y are the shuffled ranks of y: rank once, shuffle the ranks (same result,
  // same random sequence, far less work).
  const rx = rank(x), ys = rank(y);
  let hits = 0;
  for (let k = 0; k < n; k++) {
    for (let i = ys.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ys[i], ys[j]] = [ys[j], ys[i]]; }
    if (Math.abs(pearson(rx, ys)) >= r0 - 1e-12) hits++;
  }
  return (hits + 1) / (n + 1);
}
const corr = (x: number[], y: number[]) => ({ rho: spearman(x, y), p: permutationP(x, y), n: x.length });
/** Two-sided permutation p-value for a difference in means between two groups. */
export function diffP(a: number[], b: number[], n = 2000, seed = 2) {
  if (!a.length || !b.length) return NaN;
  const d0 = Math.abs(mean(a) - mean(b));
  const all = [...a, ...b], rng = mulberry32(seed);
  let hits = 0;
  for (let k = 0; k < n; k++) {
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    if (Math.abs(mean(all.slice(0, a.length)) - mean(all.slice(a.length))) >= d0 - 1e-12) hits++;
  }
  return (hits + 1) / (n + 1);
}

/** Permutation p-value for "the groups differ" (between-group sum of squares, like a one-way ANOVA). */
export function groupP(values: number[], groups: (string | number)[], n = 2000, seed = 3) {
  const ss = (gs: (string | number)[]) => {
    const m = mean(values), by = new Map<string | number, number[]>();
    gs.forEach((g, i) => { if (!by.has(g)) by.set(g, []); by.get(g)!.push(values[i]); });
    let t = 0;
    for (const xs of by.values()) t += xs.length * (mean(xs) - m) ** 2;
    return t;
  };
  if (values.length < 3 || new Set(groups).size < 2) return { eta2: NaN, p: NaN };
  const total = values.reduce((a, v) => a + (v - mean(values)) ** 2, 0);
  const s0 = ss(groups), rng = mulberry32(seed), gs = [...groups];
  let hits = 0;
  for (let k = 0; k < n; k++) {
    for (let i = gs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [gs[i], gs[j]] = [gs[j], gs[i]]; }
    if (ss(gs) >= s0 - 1e-12) hits++;
  }
  return { eta2: total ? s0 / total : NaN, p: (hits + 1) / (n + 1) };
}

// ---------------------------------------------------------------- the questions
export function analyze(d: Data) {
  const { tables, reveals } = d;
  const meant = (t: Table) => reveals.get(t.intent);
  const revealed = tables.filter((t) => meant(t));
  const gens = [...new Set(tables.map((t) => t.gen))].sort((a, b) => a - b);

  // Q1. Emergence: how fast does a shared code appear, against what context alone would give?
  const firstGuesses = (t: Table) => Object.values(t.guesses).map((g) => g[0]).filter(Boolean);
  const rightOf = (t: Table) => { const r = meant(t)!; return firstGuesses(t).map(([g, q]) => g === r.want && q === r.wantQ); };
  const understoodBy = (ts: Table[]) => { const xs = ts.flatMap(rightOf); return { rate: mean(xs.map(Number)), n: xs.length }; };
  const emergence = {
    byGeneration: gens.map((g) => ({ gen: g, ...understoodBy(revealed.filter((t) => t.gen === g)), context: d.gens.find((r) => r.gen === g)?.contextOnly ?? NaN })),
    firstLifetimeByDay: [...new Set(revealed.filter((t) => t.gen === gens[0]).map((t) => t.day))].sort((a, b) => a - b)
      .map((day) => ({ day, ...understoodBy(revealed.filter((t) => t.gen === gens[0] && t.day === day)) })),
  };

  // Q7. Concrete before abstract: in the first lifetime, when does half the island have a word?
  const first = d.snapshots.filter((s) => s.gen === gens[0]);
  const days = [...new Set(first.map((s) => s.day))].sort((a, b) => a - b);
  const acquisition = Array.from({ length: N_MEANINGS }, (_, m) => m).filter((m) => m !== NUM(1)).map((m) => {
    const day = days.find((dd) => { const xs = first.filter((s) => s.day === dd); return xs.filter((s) => s.tops[m] && s.tops[m]![1] >= THETA).length >= xs.length / 2; });
    return { meaning: MEANING_NAMES[m], category: CATEGORY(m), day: day ?? null };
  });
  const byCat = (cat: string) => acquisition.filter((a) => a.category === cat);
  const concrete = {
    acquisition,
    summary: ['goods', 'numbers', 'yes/no'].map((cat) => ({ category: cat, named: byCat(cat).filter((a) => a.day !== null).length, of: byCat(cat).length, meanDay: mean(byCat(cat).filter((a) => a.day !== null).map((a) => a.day!)) })),
  };

  // Q2. Transmission: what a child keeps of its parent's words.
  const trans = d.births.map((b) => {
    let had = 0, kept = 0, changed = 0, lost = 0;
    const perCat: Record<string, { had: number; kept: number }> = { goods: { had: 0, kept: 0 }, numbers: { had: 0, kept: 0 }, 'yes/no': { had: 0, kept: 0 } };
    for (let m = 0; m < N_MEANINGS; m++) {
      if (m === NUM(1)) continue;
      const p = b.parentTops[m], c = b.inherited[m];
      if (!p || p[1] < THETA) continue;
      had++;
      perCat[CATEGORY(m)].had++;
      if (c && c[1] >= THETA && c[0] === p[0]) { kept++; perCat[CATEGORY(m)].kept++; } else if (c && c[1] >= THETA) changed++; else lost++;
    }
    return { gen: b.gen, had, kept, changed, lost, misheard: b.misheard.length, heard: b.heard, perCat, migrant: b.town !== b.parentHome };
  });
  const transmission = {
    children: trans.length,
    kept: mean(trans.map((t) => (t.had ? t.kept / t.had : NaN)).filter(Number.isFinite)),
    changed: mean(trans.map((t) => (t.had ? t.changed / t.had : NaN)).filter(Number.isFinite)),
    lost: mean(trans.map((t) => (t.had ? t.lost / t.had : NaN)).filter(Number.isFinite)),
    misheardPerChild: mean(trans.map((t) => t.misheard)),
    byCategory: ['goods', 'numbers', 'yes/no'].map((cat) => { const h = trans.reduce((s, t) => s + t.perCat[cat].had, 0); const k = trans.reduce((s, t) => s + t.perCat[cat].kept, 0); return { category: cat, kept: h ? k / h : NaN, n: h }; }),
    memoryHeard: mean(trans.map((t) => t.heard)),
    // Does the language get easier to learn? (Iterated learning: Kirby et al. 2008.)
    byGeneration: [...new Set(trans.map((t) => t.gen))].sort((a, b) => a - b).map((g) => { const xs = trans.filter((t) => t.gen === g && t.had).map((t) => t.kept / t.had); return { gen: g, kept: mean(xs), n: xs.length }; }),
    learnability: (() => { const xs = trans.filter((t) => t.had); return corr(xs.map((t) => t.gen), xs.map((t) => t.kept / t.had)); })(),
  };

  // Q3. Geography: do towns that meet more speak more alike?
  const homeOf = (k: string) => d.people.get(k)?.home ?? -1;
  const pairs: [number, number][] = [];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) pairs.push([a, b]);
  const geoRows: { gen: number; pair: string; contact: number; similarity: number }[] = [];
  for (const row of d.gens) {
    const ts = tables.filter((t) => t.gen === row.gen);
    for (const [a, b] of pairs) {
      // Contact: times an agent from one town heard (or spoke to) an agent from the other at a table.
      let contact = 0;
      for (const t of ts) {
        const homes = (t.present ?? []).map(homeOf);
        contact += homes.filter((h) => h === a).length * homes.filter((h) => h === b).length;
      }
      let n = 0, same = 0;
      for (let m = 0; m < N_MEANINGS; m++) {
        if (m === NUM(1)) continue;
        const x = row.dialect[a]?.[m]?.word, y = row.dialect[b]?.[m]?.word;
        if (!x || !y) continue;
        n++;
        if (x === y) same++;
      }
      if (n) geoRows.push({ gen: row.gen, pair: `${TOWNS[a]}–${TOWNS[b]}`, contact, similarity: same / n });
    }
  }
  // Distance (days of travel between the towns) as the rival explanation: is it contact, or just being close?
  const TRAVEL = [[0, 2, 2, 1], [2, 0, 3, 2], [2, 3, 0, 3], [1, 2, 3, 0]];
  const distOf = (pair: string) => { const [a, b] = pair.split('–').map((n) => TOWNS.indexOf(n)); return TRAVEL[a][b]; };
  const geography = {
    distance: corr(geoRows.map((r) => distOf(r.pair)), geoRows.map((r) => r.similarity)),
    ...corr(geoRows.map((r) => r.contact), geoRows.map((r) => r.similarity)),
    byPair: pairs.map(([a, b]) => { const rs = geoRows.filter((r) => r.pair === `${TOWNS[a]}–${TOWNS[b]}`); return { pair: `${TOWNS[a]}–${TOWNS[b]}`, contact: mean(rs.map((r) => r.contact)), similarity: mean(rs.map((r) => r.similarity)) }; }),
    rows: geoRows,
  };

  // Q4. Selection: does being understood pay?
  const lives = [...d.people.values()].filter((p) => p.lived !== null && p.place !== null);
  const children = new Map<string, number>();
  for (const b of d.births) children.set(b.parent, (children.get(b.parent) ?? 0) + 1);
  // Per life: what it brought (words inherited) and what it did (trades, trips, hunger, deals).
  const inheritedOf = new Map(d.births.map((b) => [b.child, b.inherited.filter((t, m) => m !== NUM(1) && t && t[1] >= THETA).length]));
  const daysOf = new Map<string, DayRow['agents'][number][]>();
  for (const r of d.days) for (const a of r.agents) { if (!daysOf.has(a.key)) daysOf.set(a.key, []); daysOf.get(a.key)!.push(a); }
  const dealsOf = new Map<string, { made: number; bid: number; misread: number }>();
  const deal = (k: string) => { if (!dealsOf.has(k)) dealsOf.set(k, { made: 0, bid: 0, misread: 0 }); return dealsOf.get(k)!; };
  for (const t of tables) {
    if (t.result === 'no deal') continue;
    const mis = t.result !== 'understood';
    const taker = t.rounds.find((r) => r.taken)?.taken;
    const m = deal(t.makerKey); m.made++; if (mis) m.misread++;
    if (taker) { const b = deal(taker); b.bid++; if (mis) b.misread++; }
  }
  // Standing as the program ranks it: wealth ÷ the mean wealth of the living in the same trade
  // that lifetime (0 for the dead).
  const standingOf = new Map<string, number>();
  for (const id of new Set(lives.map((p) => p.lived))) {
    const here = lives.filter((p) => p.lived === id);
    for (const p of here) {
      const peers = here.filter((q) => q.job === p.job && q.survived);
      const sum = peers.reduce((a, q) => a + Math.max(0, q.score ?? 0), 0);
      standingOf.set(p.key, p.survived && (p.score ?? 0) > 0 && sum ? ((p.score ?? 0) * peers.length) / sum : 0);
    }
  }
  const lifeRows = lives.map((p) => {
    const mine = revealed.filter((t) => t.makerKey === p.key);
    const clarity = mine.length ? mean(mine.map((t) => mean(rightOf(t).map(Number))).filter(Number.isFinite)) : NaN;
    const heard = revealed.flatMap((t) => { const g = t.guesses[p.key]?.[0]; if (!g) return []; const r = meant(t)!; return [g[0] === r.want && g[1] === r.wantQ]; });
    const ds = daysOf.get(p.key) ?? [];
    const dl = dealsOf.get(p.key) ?? { made: 0, bid: 0, misread: 0 };
    return {
      key: p.key, name: p.name, family: p.family, gen: p.generation, place: p.place, home: p.home, job: p.job, brain: p.brain ?? 'habit', greed: p.greed ?? NaN,
      score: p.score ?? 0, standing: standingOf.get(p.key) ?? 0, survived: !!p.survived, children: children.get(p.key) ?? 0,
      clarity, tables: mine.length, comprehension: heard.length ? mean(heard.map(Number)) : NaN, guesses: heard.length,
      inheritedWords: inheritedOf.get(p.key) ?? 0,
      trades: ds.length ? ds[ds.length - 1].trades : 0,
      trips: ds.filter((a, i) => a.travelling && !ds[i - 1]?.travelling).length,
      hungryDays: ds.filter((a) => a.alive && a.hunger > 0).length,
      dealsAsMaker: dl.made, dealsAsBidder: dl.bid,
      misreadShare: dl.made + dl.bid ? dl.misread / (dl.made + dl.bid) : NaN,
    };
  });
  const ok = (r: { clarity: number; comprehension: number }) => Number.isFinite(r.clarity) && Number.isFinite(r.comprehension);
  const done = lifeRows.filter(ok).filter((r) => d.births.some((b) => d.people.get(b.parent)?.lived === d.people.get(r.key)?.lived)); // lifetimes whose children are born
  const half = (rows: typeof done, f: (r: (typeof done)[number]) => number) => {
    const s = [...rows].sort((a, b) => f(b) - f(a));
    const top = s.slice(0, Math.floor(s.length / 2)), bottom = s.slice(Math.ceil(s.length / 2));
    return {
      top: { survived: mean(top.map((r) => +r.survived)), children: mean(top.map((r) => r.children)) },
      bottom: { survived: mean(bottom.map((r) => +r.survived)), children: mean(bottom.map((r) => r.children)) },
      n: top.length + bottom.length, p: diffP(top.map((r) => r.children), bottom.map((r) => r.children)),
    };
  };
  // Does your trade decide your fate? Mean place (1 = best) and children by job, and whether job
  // explains children at all (permutation test on the between-job variance).
  const placed = done.filter((r) => r.place !== null);
  const jobs = [...new Set(placed.map((r) => r.job))].sort((a, b) => a - b);
  const byJob = {
    rows: jobs.map((j) => { const rs = placed.filter((r) => r.job === j); return { job: j, lives: rs.length, place: mean(rs.map((r) => r.place! + 1)), children: mean(rs.map((r) => r.children)), score: mean(rs.map((r) => r.score)) }; }),
    children: groupP(placed.map((r) => r.children), placed.map((r) => r.job)),
    place: groupP(placed.map((r) => r.place!), placed.map((r) => r.job)),
  };
  const selection = {
    lives: done.length,
    clarityVsChildren: corr(done.map((r) => r.clarity), done.map((r) => r.children)),
    comprehensionVsChildren: corr(done.map((r) => r.comprehension), done.map((r) => r.children)),
    comprehensionVsScore: corr(done.map((r) => r.comprehension), done.map((r) => r.score)),
    byComprehension: half(done, (r) => r.comprehension),
    byClarity: half(done, (r) => r.clarity),
    byJob,
    rows: lifeRows,
  };

  // What makes an agent succeed? Each feature of a life against its children and its standing
  // (Spearman with the permutation test; η² for the categories), strongest first.
  const FEATURES: { feature: string; label: string; f: (r: (typeof done)[number]) => number }[] = [
    { feature: 'clarity', label: 'is understood', f: (r) => r.clarity },
    { feature: 'comprehension', label: 'understands others', f: (r) => r.comprehension },
    { feature: 'inheritedWords', label: 'words inherited', f: (r) => r.inheritedWords },
    { feature: 'trades', label: 'trades made', f: (r) => r.trades },
    { feature: 'trips', label: 'trips to other towns', f: (r) => r.trips },
    { feature: 'hungryDays', label: 'hungry days', f: (r) => r.hungryDays },
    { feature: 'thinker', label: 'an LLM thinker', f: (r) => +(r.brain === 'thinker') },
    { feature: 'greed', label: 'greed', f: (r) => r.greed },
  ];
  const GROUPS: { feature: string; label: string; f: (r: (typeof done)[number]) => number }[] = [
    { feature: 'job', label: 'trade', f: (r) => r.job },
    { feature: 'town', label: 'home town', f: (r) => r.home },
  ];
  const outcome = (k: 'children' | 'standing') => (r: (typeof done)[number]) => (k === 'children' ? r.children : r.standing);
  const drivers = [
    ...FEATURES.map(({ feature, label, f }) => {
      const rs = done.filter((r) => Number.isFinite(f(r)));
      const c = (k: 'children' | 'standing') => { const x = corr(rs.map(f), rs.map(outcome(k))); return { effect: x.rho, p: x.p, n: x.n }; };
      return { feature, label, kind: 'rank' as const, children: c('children'), standing: c('standing') };
    }),
    ...GROUPS.map(({ feature, label, f }) => {
      const c = (k: 'children' | 'standing') => { const x = groupP(done.map(outcome(k)), done.map(f)); return { effect: x.eta2, p: x.p, n: done.length }; };
      return { feature, label, kind: 'group' as const, children: c('children'), standing: c('standing') };
    }),
  ].sort((a, b) => (Number.isFinite(b.children.effect) ? Math.abs(b.children.effect) : -1) - (Number.isFinite(a.children.effect) ? Math.abs(a.children.effect) : -1));

  // The island's survival: generations played, the first generation with fewer than 2 children.
  const bornTo = (g: number) => d.births.filter((b) => b.gen === g + 1).length;
  const playedGens = d.gens.map((r) => r.gen);
  const survival = {
    generations: playedGens.length,
    // An earlier generation with < 2 children would have ended the run; the last one is extinct
    // once its children are born (state.json moves on) and there are fewer than two.
    extinct: playedGens.find((g, i) => (i < playedGens.length - 1 ? bornTo(g) < 2 : d.state.generation > g && d.state.current.length < 2)) ?? null,
    deathsPerGen: mean(d.gens.map((r) => r.deaths)),
    market: d.gens[0]?.market ?? null,
  };

  // Q5. Mistakes: trades resting on a misunderstanding, and words whose meaning drifted.
  const deals = tables.filter((t) => t.result !== 'no deal');
  const last = d.gens[d.gens.length - 1];
  const inUse: { town: string; meaning: string; word: string; origin: Origin | undefined }[] = [];
  if (last) for (let t = 0; t < 4; t++) for (let m = 0; m < N_MEANINGS; m++) { const w = last.dialect[t]?.[m]?.word; if (w && m !== NUM(1)) inUse.push({ town: TOWNS[t], meaning: MEANING_NAMES[m], word: w, origin: d.registry.get(w) }); }
  const chain = (w: string) => { const out = [w]; let o = d.registry.get(w); while (o?.kind === 'misheard' && o.from && out.length < 12) { out.push(o.from); o = d.registry.get(o.from); } return out.reverse(); };
  const shifted = inUse.filter((u) => u.origin && ((u.origin.kind === 'coined' && MEANING_NAMES[u.origin.meaning!] !== u.meaning) || u.origin.kind === 'misheard'));
  const mistakes = {
    misunderstoodDeals: gens.map((g) => { const ds = deals.filter((t) => t.gen === g); return { gen: g, share: mean(ds.map((t) => +(t.result === 'traded, but misunderstood'))), n: ds.length }; }),
    wordsInUse: inUse.length,
    startedAsMistake: shifted.length,
    examples: shifted.slice(0, 12).map((u) => ({ town: u.town, word: u.word, means: u.meaning, story: u.origin!.kind === 'misheard' ? `misheard: ${chain(u.word).join(' → ')} (generation ${u.origin!.gen})` : `coined for "${MEANING_NAMES[u.origin!.meaning!]}" by ${u.origin!.by} (generation ${u.origin!.gen})` })),
  };

  // Q6. Word lifetimes: do the meanings people use most keep their words longest?
  const usage = new Array(N_MEANINGS).fill(0);
  for (const t of revealed) { const r = meant(t)!; usage[r.want]++; if (r.wantQ > 1) usage[NUM(r.wantQ)]++; }
  for (const t of tables) for (const rd of t.rounds) { if (rd.reaction) usage[rd.taken ? YES : NO]++; for (const b of rd.bids) { usage[b.g]++; if (b.q > 1) usage[NUM(b.q)]++; } }
  const replaced = new Array(N_MEANINGS).fill(0), slots = new Array(N_MEANINGS).fill(0);
  for (let i = 1; i < d.gens.length; i++) for (let t = 0; t < 4; t++) for (let m = 0; m < N_MEANINGS; m++) {
    const a = d.gens[i - 1].dialect[t]?.[m]?.word, b = d.gens[i].dialect[t]?.[m]?.word;
    if (!a || !b) continue;
    slots[m]++;
    if (a !== b) replaced[m]++;
  }
  const ms = Array.from({ length: N_MEANINGS }, (_, m) => m).filter((m) => m !== NUM(1) && slots[m] > 0);
  const stabilityRows = ms.map((m) => ({ meaning: MEANING_NAMES[m], category: CATEGORY(m), uses: usage[m], replacedPerGeneration: replaced[m] / slots[m] }));
  const stability = { ...corr(stabilityRows.map((r) => r.uses), stabilityRows.map((r) => r.replacedPerGeneration)), rows: stabilityRows.sort((a, b) => b.uses - a.uses) };

  // Q8. Lineage: do a few founding families take over, and does the language narrow with them?
  const peopleList = [...d.people.values()];
  const lineageRows = [...new Set(peopleList.map((p) => p.generation))].sort((a, b) => a - b).map((g) => {
    const fams = new Set(peopleList.filter((p) => p.generation === g).map((p) => p.family));
    const row = d.gens.find((r) => r.gen === g);
    // Distinct words in use per meaning across the four towns (the island's lexical variety).
    let variety = NaN;
    if (row) { let n = 0, k = 0; for (let m = 0; m < N_MEANINGS; m++) { if (m === NUM(1)) continue; const ws = new Set(row.dialect.map((t) => t?.[m]?.word).filter(Boolean)); if (ws.size) { n++; k += ws.size; } } variety = n ? k / n : NaN; }
    return { gen: g, families: fams.size, variety };
  });
  const lineage = { rows: lineageRows, fixation: lineageRows.find((r) => r.families === 1)?.gen ?? null, ...corr(lineageRows.filter((r) => Number.isFinite(r.variety)).map((r) => r.families), lineageRows.filter((r) => Number.isFinite(r.variety)).map((r) => r.variety)) };

  // Q9. Thinking: do LLM minds (thinkers) understand, get understood, survive and breed better than habit?
  const by = (b: string) => done.filter((r) => r.brain === b);
  const th = by('thinker'), hb = by('habit');
  const cmp = (f: (r: (typeof done)[number]) => number) => ({ thinker: mean(th.map(f)), habit: mean(hb.map(f)), p: diffP(th.map(f), hb.map(f)) });
  const thinking = {
    thinkers: th.length, habit: hb.length,
    comprehension: cmp((r) => r.comprehension), clarity: cmp((r) => r.clarity), survived: cmp((r) => +r.survived), children: cmp((r) => r.children), score: cmp((r) => r.score),
    share: [...new Set(peopleList.map((p) => p.generation))].sort((a, b) => a - b).map((g) => { const ps = peopleList.filter((p) => p.generation === g); return { gen: g, share: ps.filter((p) => p.brain === 'thinker').length / ps.length }; }),
  };

  return {
    data: { lifetimes: new Set(tables.map((t) => t.match)).size, generations: gens.length, tables: tables.length, revealed: revealed.length, verified: d.verified, failedVerification: d.failed, births: d.births.length, snapshots: d.snapshots.length, people: d.people.size },
    emergence, concrete, transmission, geography, selection, mistakes, stability, lineage, thinking, drivers, survival,
  };
}
export type Research = ReturnType<typeof analyze>;

// ---------------------------------------------------------------- the findings, in words
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : 'n/a');
const sig = (c: { rho: number; p: number; n: number }) => `ρ = ${c.rho.toFixed(2)}, p = ${c.p < 0.001 ? '<0.001' : c.p.toFixed(3)}, n = ${c.n}`;
export function findings(r: Research): { q: string; finding: string; evidence: string; solid: boolean }[] {
  const e = r.emergence.byGeneration;
  const tail = e.slice(-Math.min(10, e.length));
  const g1 = e[0];
  const s = r.selection;
  const c = r.concrete.summary;
  return [
    { q: 'How fast does a language appear from nothing?', solid: true,
      finding: `First-generation listeners guess what a speaker means ${pct(g1?.rate)} of the time (context alone: ${pct(g1?.context)}); by the last ${tail.length} generations, ${pct(mean(tail.map((x) => x.rate)))} (context: ${pct(mean(tail.map((x) => x.context)))}).`,
      evidence: `${r.data.revealed} tables joined to their revealed meanings; ${r.data.verified} reveals verified against the on-chain hash, ${r.data.failedVerification} failed.` },
    { q: 'Are things you can show named before things you can\'t?', solid: false,
      finding: c.map((x) => `${x.category}: ${x.named}/${x.of} named by half the island in the first lifetime${Number.isFinite(x.meanDay) ? ` (day ${x.meanDay.toFixed(1)} on average)` : ''}`).join('; ') + '.',
      evidence: 'Daily dictionary snapshots of the first lifetime; one island, so a description, not a test.' },
    { q: 'What survives from parent to child?', solid: true,
      finding: `Children keep ${pct(r.transmission.kept)} of their parent's words, use a different word for ${pct(r.transmission.changed)}, and lose ${pct(r.transmission.lost)}. By kind: ${r.transmission.byCategory.map((b) => `${b.category} ${pct(b.kept)} kept`).join(', ')}. ${r.transmission.misheardPerChild.toFixed(2)} words misheard per child.`,
      evidence: `${r.transmission.children} births; a child hears ~${Math.round(r.transmission.memoryHeard)} of its parent's remembered episodes.` },
    { q: 'Do towns that meet more speak more alike?', solid: r.geography.p < 0.05,
      finding: `Contact vs. shared words across town pairs and generations: ${sig(r.geography)}. ${r.geography.byPair.sort((a, b) => b.similarity - a.similarity).map((p) => `${p.pair} ${pct(p.similarity)}`).join(', ')}.`,
      evidence: 'Contact = agents from both towns at the same table; similarity = same most-common word per meaning.' },
    { q: 'Does your trade decide how many children you have?', solid: s.byJob.children.p < 0.05,
      finding: `Children by job: ${s.byJob.rows.map((j) => `${JOBS[j.job]} ${j.children.toFixed(2)} (mean place ${j.place.toFixed(1)}, n = ${j.lives})`).join(', ')}. Job explains ${pct(s.byJob.children.eta2)} of the variation in children (p = ${s.byJob.children.p.toFixed(3)}).`,
      evidence: 'Children go by standing within a trade (wealth against the mean of the same job), so a lucrative job alone should not pay.' },
    { q: 'Does being understood pay?', solid: s.comprehensionVsChildren.p < 0.05 || s.clarityVsChildren.p < 0.05,
      finding: `Agents who understood others best (top half) survived ${pct(s.byComprehension.top.survived)} vs ${pct(s.byComprehension.bottom.survived)} and had ${s.byComprehension.top.children.toFixed(2)} vs ${s.byComprehension.bottom.children.toFixed(2)} children. Comprehension vs children: ${sig(s.comprehensionVsChildren)}; speaker clarity vs children: ${sig(s.clarityVsChildren)}.`,
      evidence: `${s.lives} completed lives with enough tables to measure.` },
    { q: 'How much rests on misunderstanding?', solid: true,
      finding: `${pct(mean(r.mistakes.misunderstoodDeals.map((x) => x.share)))} of trades were accepted even though the listener got it wrong; ${r.mistakes.startedAsMistake} of ${r.mistakes.wordsInUse} words in use now started as a mistake (misheard, or coined for something else).`,
      evidence: r.mistakes.examples.slice(0, 3).map((x) => `${x.town} "${x.word}" = ${x.means}: ${x.story}`).join(' · ') || 'none yet' },
    { q: 'Do the words used most change least?', solid: r.stability.p < 0.05,
      finding: `Use vs. replacement rate across meanings: ${sig(r.stability)}. Most used: ${r.stability.rows.slice(0, 3).map((x) => `${x.meaning} (${pct(x.replacedPerGeneration)} replaced per generation)`).join(', ')}; least: ${r.stability.rows.slice(-2).map((x) => `${x.meaning} (${pct(x.replacedPerGeneration)})`).join(', ')}.`,
      evidence: 'Real languages show this (Pagel et al. 2007). n = meanings, so treat as suggestive.' },
    { q: 'Do a few families take over, and does the language narrow with them?', solid: r.lineage.p < 0.05,
      finding: `${r.lineage.fixation ? `By generation ${r.lineage.fixation}, every living agent descends from one founder.` : `${r.lineage.rows[r.lineage.rows.length - 1]?.families ?? '?'} founding families still alive.`} Families alive vs. distinct words per meaning across towns: ${sig(r.lineage)}.`,
      evidence: 'Children go to the best-placed parents, so lineages die out: a founder effect, as in population genetics. Caution: families and variety both fall over time, so the correlation may be the language converging, not the families narrowing it.' },
    ...(r.thinking.thinkers ? [{ q: 'Does thinking pay? (LLM minds vs. habit rules)', solid: r.thinking.comprehension.p < 0.05 || r.thinking.children.p < 0.05,
      finding: `Thinkers vs. habit: understood others ${pct(r.thinking.comprehension.thinker)} vs ${pct(r.thinking.comprehension.habit)} (p = ${r.thinking.comprehension.p.toFixed(3)}); were understood ${pct(r.thinking.clarity.thinker)} vs ${pct(r.thinking.clarity.habit)}; survived ${pct(r.thinking.survived.thinker)} vs ${pct(r.thinking.survived.habit)}; ${r.thinking.children.thinker.toFixed(2)} vs ${r.thinking.children.habit.toFixed(2)} children (p = ${r.thinking.children.p.toFixed(3)}). Share of thinkers: ${r.thinking.share.map((x) => pct(x.share)).join(' → ')}.`,
      evidence: `${r.thinking.thinkers} thinker lives, ${r.thinking.habit} habit lives. Children inherit their parent's kind (10% switch), so if thinking pays, the share of thinkers should rise.` }] : []),
  ];
}

if (process.argv[1]?.endsWith('research.ts')) {
  const cluster = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'litesvm';
  const dir = new URL(`../data/${cluster}/tongue/`, import.meta.url).pathname;
  const r = analyze(load(dir));
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`\nMother Tongue research · ${cluster} · ${r.data.generations} generations, ${r.data.tables} tables, ${r.data.births} births\n`);
    for (const f of findings(r)) console.log(`${f.solid ? '●' : '○'} ${f.q}\n  ${f.finding}\n  (${f.evidence})\n`);
  }
}
