// Replication: independent islands (different seeds) on the real program in LiteSVM, then the
// same analysis on each, so a finding counts only if it shows up again and again.
//   npx tsx lab/replicate.ts [seeds=8] [gens=25] [thinkers] [--flex X] [--summary-only]
// --flex X: the market rule (chance a maker takes a bid it didn't ask for). 0.5, the lenient
// default, writes data/replicate/; any other value data/replicate-flex<X>/. Every run then
// rebuilds data/replicate/conditions.json from the conditions recorded so far (RESEARCH.md §6).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { type Research, analyze, findings, load } from './research.ts';

const argv = process.argv.slice(2);
const flexAt = argv.indexOf('--flex');
const flex = flexAt >= 0 ? Number(argv[flexAt + 1]) : 0.5;
const valOf = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
// Passed through to the director (RESEARCH.md §10): --rounds N, --child-sample N; --first K starts at seed K×101.
const passThrough = ['--rounds', '--child-sample'].flatMap((f) => (valOf(f) ? [f, valOf(f)!] : []));
const first = Number(valOf('--first') ?? 1);
const valued = new Set(['--flex', '--out', '--rounds', '--child-sample', '--first'].map((f) => argv.indexOf(f) + 1).filter((i) => i > 0));
const outAt = argv.indexOf('--out'); // --out NAME: write data/NAME/ instead (e.g. replicate-crafts, RESEARCH.md §9)
const args = argv.filter((a, i) => !a.startsWith("--") && !valued.has(i));
const seeds = Number(args[0] ?? 8), gens = Number(args[1] ?? 25);
// The all-habit baseline by default (fast, no LLM calls); `thinkers` as a 3rd argument mixes in LLM minds.
const thinkers = args[2] === 'thinkers';
const root = new URL('..', import.meta.url).pathname;
const folderOf = (x: number) => `${thinkers ? 'replicate-thinkers' : 'replicate'}${x === 0.5 ? '' : `-flex${x}`}`;
const folder = outAt >= 0 ? argv[outAt + 1] : folderOf(flex);
const results: Research[] = [];
// --summary-only: re-analyse the islands already recorded (after a change to the analysis).
const summaryOnly = argv.includes('--summary-only');
for (let s = first; s < first + seeds; s++) {
  const label = `${folder}/seed-${s}`;
  const t0 = Date.now();
  if (!summaryOnly) execFileSync('npx', ['tsx', 'server/tongue.ts', '--litesvm', '--gens', String(gens), '--seed', String(s * 101), '--data', label, '--flex', String(flex), ...passThrough, ...(thinkers ? [] : ['--no-thinkers'])], { cwd: root, stdio: 'ignore' });
  const r = analyze(load(`${root}data/${label}/tongue/`));
  results.push(r);
  console.log(`seed ${s}: ${r.survival.generations} generations${r.survival.extinct ? ` (extinct at ${r.survival.extinct})` : ''} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
const mean = (xs: number[]) => { const ys = xs.filter(Number.isFinite); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : NaN; };
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const fmt = (xs: number[], pct = true) => (pct ? `${Math.round(mean(xs) * 100)}% ± ${Math.round(sd(xs) * 100)}` : `${mean(xs).toFixed(2)} ± ${sd(xs).toFixed(2)}`);
const tail = (r: (typeof results)[number]) => r.emergence.byGeneration.slice(-10);
const sig = (xs: { rho: number; p: number }[], sign: number) => xs.filter((x) => x.p < 0.05 && Math.sign(x.rho) === sign).length;
// Each success driver: on how many islands it is significant, and in which direction.
const driverNames = [...new Set(results.flatMap((r) => r.drivers.map((d) => d.feature)))];
const drivers = driverNames.map((feature) => {
  const per = results.map((r) => r.drivers.find((d) => d.feature === feature)!).filter(Boolean);
  const side = (k: 'children' | 'standing') => {
    const xs = per.map((d) => d[k]);
    if (per[0]?.kind === 'group') return { kind: 'group' as const, significant: xs.filter((x) => x.p < 0.05).length, meanEffect: mean(xs.map((x) => x.effect)), islands: xs.length };
    return { kind: 'rank' as const, positive: sig(xs.map((x) => ({ rho: x.effect, p: x.p })), 1), negative: sig(xs.map((x) => ({ rho: x.effect, p: x.p })), -1), meanEffect: mean(xs.map((x) => x.effect)), islands: xs.length };
  };
  return { feature, label: per[0]?.label ?? feature, kind: per[0]?.kind ?? 'rank', children: side('children'), standing: side('standing') };
});
const summary = {
  seeds, gens, flex,
  understoodFirstGen: results.map((r) => r.emergence.byGeneration[0].rate),
  contextFirstGen: results.map((r) => r.emergence.byGeneration[0].context),
  understoodLate: results.map((r) => mean(tail(r).map((x) => x.rate))),
  contextLate: results.map((r) => mean(tail(r).map((x) => x.context))),
  kept: results.map((r) => r.transmission.kept),
  verified: results.map((r) => ({ verified: r.data.verified, failed: r.data.failedVerification })),
  geography: results.map((r) => ({ rho: r.geography.rho, p: r.geography.p })),
  geoDistance: results.map((r) => ({ rho: r.geography.distance.rho, p: r.geography.distance.p })),
  selection: results.map((r) => ({ rho: r.selection.comprehensionVsChildren.rho, p: r.selection.comprehensionVsChildren.p })),
  clarity: results.map((r) => ({ rho: r.selection.clarityVsChildren.rho, p: r.selection.clarityVsChildren.p })),
  jobEffect: results.map((r) => ({ eta2: r.selection.byJob.children.eta2, p: r.selection.byJob.children.p })),
  learnability: results.map((r) => ({ rho: r.transmission.learnability.rho, p: r.transmission.learnability.p })),
  stability: results.map((r) => ({ rho: r.stability.rho, p: r.stability.p })),
  misunderstoodDeals: results.map((r) => mean(r.mistakes.misunderstoodDeals.map((x) => x.share))),
  startedAsMistake: results.map((r) => r.mistakes.startedAsMistake / Math.max(1, r.mistakes.wordsInUse)),
  fixation: results.map((r) => r.lineage.fixation),
  lineage: results.map((r) => ({ rho: r.lineage.rho, p: r.lineage.p })),
  firstNamed: ['goods', 'numbers', 'yes/no'].map((c) => ({ category: c, day: results.map((r) => r.concrete.summary.find((x) => x.category === c)!.meanDay).filter(Number.isFinite) })),
  // The island's survival: generations played, the generation (if any) with fewer than 2
  // children born, and deaths per generation.
  generations: results.map((r) => r.survival.generations),
  extinct: results.map((r) => r.survival.extinct),
  deathsPerGen: results.map((r) => r.survival.deathsPerGen),
  // Top half of speakers (by clarity) against the bottom half: children per life.
  clarityHalves: results.map((r) => ({ top: r.selection.byClarity.top.children, bottom: r.selection.byClarity.bottom.children, p: r.selection.byClarity.p })),
  drivers,
};
writeFileSync(`${root}data/${folder}/summary.json`, JSON.stringify({ summary, findings: results.map(findings) }, null, 1));

// ---------------------------------------------------------------- all conditions, side by side
if (!thinkers && outAt < 0) {
  type Summary = typeof summary;
  const rows = [0.5, 0.25, 0].map((x) => {
    const f = `${root}data/${folderOf(x)}/summary.json`;
    if (!existsSync(f)) return null;
    const s = (JSON.parse(readFileSync(f, 'utf8')) as { summary: Summary }).summary;
    if (!s.extinct) return null; // recorded before the survival fields: re-run with --summary-only
    return {
      flex: x, label: x === 0.5 ? 'lenient' : x === 0 ? 'strict' : 'in between', folder: folderOf(x),
      islands: s.seeds, gens: s.gens,
      survived: s.extinct.filter((e) => e === null).length,
      understoodLate: mean(s.understoodLate), contextLate: mean(s.contextLate),
      clarity: { k: sig(s.clarity, 1), of: s.clarity.length, meanRho: mean(s.clarity.map((c) => c.rho)) },
      comprehension: { k: sig(s.selection, 1), of: s.selection.length, meanRho: mean(s.selection.map((c) => c.rho)) },
      deathsPerGen: mean(s.deathsPerGen),
      misunderstoodDeals: mean(s.misunderstoodDeals),
      clarityHalves: { top: mean(s.clarityHalves.map((h) => h.top)), bottom: mean(s.clarityHalves.map((h) => h.bottom)) },
      verified: s.verified.reduce((a, v) => a + v.verified, 0), failed: s.verified.reduce((a, v) => a + v.failed, 0),
      drivers: s.drivers,
    };
  }).filter(Boolean);
  writeFileSync(`${root}data/replicate/conditions.json`, JSON.stringify({ at: new Date().toISOString(), conditions: rows }, null, 1));
  console.log(`\nconditions.json: ${rows.map((r) => `flex ${r!.flex}`).join(', ')}`);
}

console.log(`\n${seeds} islands × ${gens} generations, market flex ${flex}\n`);
console.log(`islands surviving all ${gens}      ${summary.extinct.filter((e) => e === null).length}/${seeds}  (extinct at: ${summary.extinct.map((x) => x ?? '–').join(', ')})`);
console.log(`deaths per generation         ${fmt(summary.deathsPerGen, false)}`);
console.log(`understood, generation 1      ${fmt(summary.understoodFirstGen)}`);
console.log(`understood, last 10 gens      ${fmt(summary.understoodLate)}   (context alone ${fmt(summary.contextLate)})`);
console.log(`words a child keeps           ${fmt(summary.kept)}`);
console.log(`first named (mean day)        ${summary.firstNamed.map((x) => `${x.category} ${mean(x.day).toFixed(1)}`).join(', ')}`);
const sigCount = (xs: { rho: number; p: number }[], sign: number) => `${sig(xs, sign)}/${xs.length} islands significant (mean ρ ${mean(xs.map((x) => x.rho)).toFixed(2)})`;
console.log(`contact → shared words        ${sigCount(summary.geography, 1)}`);
console.log(`nearer → shared words         ${sigCount(summary.geoDistance, -1)}`);
console.log(`used more → replaced less     ${sigCount(summary.stability, -1)}`);
console.log(`understanding → children      ${sigCount(summary.selection, 1)}`);
console.log(`being understood → children   ${sigCount(summary.clarity, 1)}`);
console.log(`job → children                ${summary.jobEffect.filter((x) => x.p < 0.05).length}/${seeds} islands significant (mean η² ${mean(summary.jobEffect.map((x) => x.eta2)).toFixed(2)})`);
console.log(`later children keep more      ${sigCount(summary.learnability, 1)}`);
console.log(`one family takes over by gen  ${summary.fixation.map((x) => x ?? '–').join(', ')}`);
console.log(`fewer families → fewer words  ${sigCount(summary.lineage, 1)}`);
console.log(`trades on a misunderstanding  ${fmt(summary.misunderstoodDeals)}`);
console.log(`words that began as mistakes  ${fmt(summary.startedAsMistake)}`);
console.log('\nsuccess drivers (islands significant, + / −; mean effect)');
for (const d of drivers) {
  const f = (x: (typeof d)['children']) => (x.kind === 'group' ? `${x.significant}/${x.islands} (η² ${x.meanEffect.toFixed(2)})` : `+${x.positive} −${x.negative} of ${x.islands} (ρ ${x.meanEffect.toFixed(2)})`);
  console.log(`  ${d.label.padEnd(26)} children ${f(d.children).padEnd(26)} standing ${f(d.standing)}`);
}
