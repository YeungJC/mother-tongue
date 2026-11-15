// False blame: how often an agent's learning rule blames a WORD for a failure that wasn't about the
// word. Agents can't tell "I was misunderstood" from "I was understood but offered too little", so
// every rejected bid weakens the guess behind it (table.ts rejected → learnRejection), and every
// accepted trade teaches everyone present that the maker's words meant what changed hands
// (table.ts accepted → learnUtterance), even when the maker took something it never asked for.
// We know the truth from the sealed intents, so we can count both kinds of wrong lesson.
//
//   npx tsx lab/blame.ts [dataDir ...]     (default: data/demo + every data/replicate*/seed-N)
//   npx tsx lab/blame.ts counterfactual    offline sim, same seeds, with each wrong lesson switched off
import { runSim } from '../lang/sim.ts';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../data/', import.meta.url).pathname;
type Bid = { key: string; g: number; q: number };
type Round = { bids: Bid[]; taken?: string | null };
type Table = { makerKey: string; intent: string; present: string[]; rounds: Round[] };
type Intent = { intent: string; want: number; wantQ: number };

interface Tally {
  bidsRejected: number; rejRightGood: number; // rejected bid with the right good, too few
  bidsLost: number; lostRightGood: number;    // outbid by someone else
  accepted: number; acceptedMisread: number;  // maker took a good it never asked for
  falseCreditLessons: number;                 // listener lessons from a misread trade
  makerShortQty: number;                      // maker took the right good, short: blames its own good-word
  lessons: number;                            // every word lesson from a trade or rejection
  wrongLessons: number;                       // ...that pointed at the wrong good, or blamed the right one
}
const zero = (): Tally => ({ bidsRejected: 0, rejRightGood: 0, bidsLost: 0, lostRightGood: 0, accepted: 0, acceptedMisread: 0, falseCreditLessons: 0, makerShortQty: 0, lessons: 0, wrongLessons: 0 });

function island(dir: string): Tally | null {
  const t = join(dir, 'tongue');
  if (!existsSync(join(t, 'talk')) || !existsSync(join(t, 'intents'))) return null;
  const truth = new Map<string, Intent>();
  for (const f of readdirSync(join(t, 'intents'))) for (const i of JSON.parse(readFileSync(join(t, 'intents', f), 'utf8')) as Intent[]) truth.set(i.intent, i);
  const T = zero();
  for (const f of readdirSync(join(t, 'talk'))) {
    for (const line of readFileSync(join(t, 'talk', f), 'utf8').split('\n')) {
      if (!line) continue;
      const tb = JSON.parse(line) as Table;
      const want = truth.get(tb.intent);
      if (!want) continue;
      const right = (b: Bid) => b.g === want.want;
      for (const r of tb.rounds) {
        const taken = r.taken ? r.bids.find((b) => b.key === r.taken) : undefined;
        if (!taken) { // the maker said no to every bid: each bidder weakens its guess
          for (const b of r.bids) {
            T.bidsRejected++; T.lessons++;
            if (right(b)) { T.rejRightGood++; T.wrongLessons++; }
          }
          continue;
        }
        // a trade: everyone present (bar the maker) links the maker's words to what changed hands
        T.accepted++;
        const listeners = tb.present.filter((k) => k !== tb.makerKey).length;
        T.lessons += listeners + 1; // + the maker's own lesson
        if (!right(taken)) { T.acceptedMisread++; T.falseCreditLessons += listeners; T.wrongLessons += listeners; }
        else if (taken.q < want.wantQ) { T.makerShortQty++; T.wrongLessons++; } // maker weakens a good-word that worked
        for (const b of r.bids) if (b !== taken) { T.bidsLost++; if (right(b)) T.lostRightGood++; }
      }
    }
  }
  return T;
}

if (process.argv[2] === 'counterfactual') { counterfactual(); process.exit(0); }

function counterfactual() {
  const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
  const arms: [string, { fairBlame: boolean; fairCredit: boolean }][] = [
    ['as played', { fairBlame: false, fairCredit: false }],
    ['no false blame', { fairBlame: true, fairCredit: false }],
    ['no false credit', { fairBlame: false, fairCredit: true }],
    ['neither', { fairBlame: true, fairCredit: true }],
  ];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const res: Record<string, Record<string, number[]>> = {};
  console.log(`\nCounterfactual: ${seeds.length} seeds × 25 generations × 12 agents (offline sim, same rules as the program).`);
  console.log('"understood" = listener\'s first guess exactly right, last 10 generations. "early" = generations 1-5.\n');
  for (const flex of [0, 0.25, 0.5]) {
    console.log(`market flex ${flex}`);
    res[flex] = {};
    const base: number[][] = [];
    for (const [name, sw] of arms) {
      const runs = seeds.map((seed) => runSim({ seed, pop: 12, gens: 25, log: false, pFlexible: flex, ...sw }));
      const late = runs.map((r) => mean(r.stats.slice(-10).map((s) => s.understood)));
      const early = runs.map((r) => mean(r.stats.slice(0, 5).map((s) => s.understood)));
      if (!base.length) base.push(late, early);
      res[flex][name] = late;
      const better = late.filter((x, i) => x > base[0][i]).length;
      const d = mean(late.map((x, i) => x - base[0][i])) * 100;
      console.log(`  ${name.padEnd(16)} understood ${(mean(late) * 100).toFixed(0).padStart(3)}%  early ${(mean(early) * 100).toFixed(0).padStart(3)}%` +
        (name === 'as played' ? '' : `   ${d >= 0 ? '+' : ''}${d.toFixed(1)} pts, better on ${better}/${seeds.length} seeds`));
    }
  }
  writeFileSync(join(ROOT, 'blame-counterfactual.json'), JSON.stringify(res, null, 1));
  console.log('\n→ data/blame-counterfactual.json');
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '–');
const dirs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [join(ROOT, 'demo'), ...readdirSync(ROOT).filter((d) => d.startsWith('replicate') && !d.includes('pre-rank')).flatMap((d) => readdirSync(join(ROOT, d)).filter((s) => s.startsWith('seed-')).map((s) => join(ROOT, d, s)))];

const out: Record<string, Tally & { market?: number }> = {};
for (const d of dirs) {
  const T = island(d);
  if (!T) continue;
  const cond = d.includes('flex0.25') ? 0.25 : d.includes('flex0') ? 0 : d.includes('replicate') ? 0.5 : undefined;
  out[d.replace(ROOT, '')] = { ...T, market: cond };
}

const group = (f: (k: string) => boolean) => Object.entries(out).filter(([k]) => f(k)).map(([, v]) => v);
const sum = (xs: Tally[]) => xs.reduce((a, x) => { for (const k of Object.keys(a) as (keyof Tally)[]) a[k] += x[k]; return a; }, zero());
const rows: [string, Tally[]][] = [
  ['demo island', group((k) => k === 'demo')],
  ['lenient market (flex 0.5), 8 islands', group((k) => /^replicate\/seed/.test(k))],
  ['middle market (flex 0.25), 8 islands', group((k) => k.startsWith('replicate-flex0.25/'))],
  ['strict market (flex 0), 8 islands', group((k) => k.startsWith('replicate-flex0/'))],
];
for (const [name, xs] of rows) {
  if (!xs.length) continue;
  const s = sum(xs);
  const perIsland = xs.map((x) => (x.rejRightGood / Math.max(1, x.bidsRejected)) * 100);
  const lo = Math.min(...perIsland).toFixed(0), hi = Math.max(...perIsland).toFixed(0);
  console.log(`\n${name}`);
  console.log(`  rejected bids that had the RIGHT good (too few): ${s.rejRightGood}/${s.bidsRejected} = ${pct(s.rejRightGood, s.bidsRejected)}${xs.length > 1 ? ` (islands ${lo}–${hi}%)` : ''}`);
  console.log(`  trades where the maker took a good it never asked for: ${s.acceptedMisread}/${s.accepted} = ${pct(s.acceptedMisread, s.accepted)} → ${s.falseCreditLessons} listener lessons pointing at the wrong good`);
  console.log(`  trades with the right good but short: ${s.makerShortQty} (maker blames a good-word that worked)`);
  console.log(`  outbid bids that had the right good: ${s.lostRightGood}/${s.bidsLost}`);
  console.log(`  ALL word lessons that were wrong about the good: ${s.wrongLessons}/${s.lessons} = ${pct(s.wrongLessons, s.lessons)}`);
}
writeFileSync(join(ROOT, 'blame.json'), JSON.stringify(out, null, 1));
console.log(`\nper island → data/blame.json`);
