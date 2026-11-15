// RESEARCH.md §10.2: the one confirmation run, on seeds 909…1616 (never used in exploration),
// with the tests declared before running.
//   npx tsx lab/confirm.ts            run the three worlds (in parallel), then test
//   npx tsx lab/confirm.ts --test     test only (worlds already recorded)
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const so = (f: string) => `${root}../target/deploy/${f}`;
const WORLDS = [
  { id: '3', name: 'crafts + one bid round (locked)', args: ['--rounds', '1'], env: {} },
  { id: '1', name: 'crafts only, 3 rounds', args: ['--rounds', '3'], env: {} },
  { id: '6', name: 'one round, no crafts', args: ['--rounds', '1'], env: { NO_CRAFTS: '1', VILLAGE_SO: so('village.pre-crafts.so') } },
];
type P = { rho: number; p: number };

function run(w: (typeof WORLDS)[number]) {
  return new Promise<void>((ok, fail) => {
    const c = spawn('npx', ['tsx', 'lab/replicate.ts', '8', '25', '--flex', '0', '--first', '9', '--out', `confirm/world-${w.id}`, ...w.args], { cwd: root, env: { ...process.env, ...w.env }, stdio: 'ignore' });
    c.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`world ${w.id} exited ${code}`))));
  });
}

/** Exact one-sided sign-flip test on the mean ρ: share of the 2^n sign assignments at least as extreme. */
function signFlip(rhos: number[], sign: number) {
  const obs = sign * rhos.reduce((a, b) => a + b, 0) / rhos.length;
  let hits = 0;
  const n = rhos.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += (mask & (1 << i) ? -1 : 1) * Math.abs(rhos[i]) * Math.sign(rhos[i]);
    if (sign * s / n >= obs - 1e-12) hits++;
  }
  return hits / (1 << n);
}
function verdict(xs: P[], sign: number) {
  const k = xs.filter((x) => x.p < 0.05 && Math.sign(x.rho) === sign).length;
  const rhos = xs.map((x) => x.rho);
  const pooled = signFlip(rhos, sign);
  const v = k >= 7 ? 'ROBUST' : pooled < 0.05 && k >= 4 ? 'SUPPORTED' : 'NOT SUPPORTED';
  return { k, of: xs.length, meanRho: rhos.reduce((a, b) => a + b, 0) / rhos.length, pooledP: pooled, verdict: v };
}

const fmt = (v: ReturnType<typeof verdict>) => `${v.k}/${v.of} islands, mean ρ ${v.meanRho.toFixed(3)}, pooled p ${v.pooledP.toFixed(4)} → ${v.verdict}`;

// --second: §10.4, world 3 only, seeds 1717…2424, Pagel by the pooled test.
if (process.argv.includes('--second')) {
  if (!process.argv.includes('--test')) execFileSync('npx', ['tsx', 'lab/replicate.ts', '8', '25', '--flex', '0', '--first', '17', '--out', 'confirm2/world-3', '--rounds', '1'], { cwd: root, stdio: 'ignore' });
  const s2 = JSON.parse(readFileSync(`${root}data/confirm2/world-3/summary.json`, 'utf8')).summary;
  const s1 = JSON.parse(readFileSync(`${root}data/confirm/world-3/summary.json`, 'utf8')).summary;
  const pagelRhos = s2.stability.map((x: P) => x.rho);
  const pagelP = signFlip(pagelRhos, -1);
  const pagel = { k: s2.stability.filter((x: P) => x.p < 0.05 && x.rho < 0).length, negative: pagelRhos.filter((r: number) => r < 0).length, meanRho: pagelRhos.reduce((a: number, b: number) => a + b, 0) / 8, pooledP: pagelP, verdict: pagelP < 0.05 ? 'SUPPORTED' : 'NOT SUPPORTED' };
  const talk = verdict(s2.clarity, 1);
  const all16 = [...s1.clarity, ...s2.clarity] as P[];
  const kirbyRhos = s2.learnability.map((x: P) => x.rho);
  const kirby = { meanRho: kirbyRhos.reduce((a: number, b: number) => a + b, 0) / 8, pooledP: signFlip(kirbyRhos, 1) };
  console.log('\nSecond confirmation, seeds 1717…2424 (RESEARCH.md §10.4)\n');
  console.log(`Pagel (pooled):                ρ < 0 on ${pagel.negative}/8, significant alone on ${pagel.k}/8, mean ρ ${pagel.meanRho.toFixed(3)}, pooled p ${pagelP.toFixed(4)} → ${pagel.verdict}`);
  console.log(`being understood → children:   ${fmt(talk)}`);
  console.log(`  all 16 confirmation islands: ρ > 0 on ${all16.filter((x) => x.rho > 0).length}/16, significant on ${all16.filter((x) => x.p < 0.05 && x.rho > 0).length}/16, mean ρ ${(all16.reduce((a, x) => a + x.rho, 0) / 16).toFixed(3)}`);
  console.log(`Kirby (pooled, unchanged):     mean ρ ${kirby.meanRho.toFixed(3)}, pooled p ${kirby.pooledP.toFixed(4)}`);
  writeFileSync(`${root}data/confirm2/result.json`, JSON.stringify({ at: new Date().toISOString(), pagel, talk, kirby }, null, 1));
  process.exit(0);
}
if (!process.argv.includes('--test')) await Promise.all(WORLDS.map(run));
const S = Object.fromEntries(WORLDS.map((w) => [w.id, JSON.parse(readFileSync(`${root}data/confirm/world-${w.id}/summary.json`, 'utf8')).summary]));

const c1 = verdict(S['3'].clarity, 1);
const c1w1 = verdict(S['1'].clarity, 1), c1w6 = verdict(S['6'].clarity, 1);
const ok = (v: { verdict: string }) => v.verdict !== 'NOT SUPPORTED';
const c2 = ok(c1) && !ok(c1w1) && !ok(c1w6);
const c3 = verdict(S['3'].stability, -1);
const c4 = verdict(S['3'].learnability, 1);
const s3 = S['3'];
const emergence = s3.understoodLate.filter((u: number, i: number) => u > s3.contextLate[i]).length;
const contact = s3.geography.filter((x: P) => x.p < 0.05 && x.rho > 0).length;
const kept = s3.kept.reduce((a: number, b: number) => a + b, 0) / s3.kept.length;
const alive = (id: string) => S[id].extinct.filter((e: unknown) => e === null).length;

console.log('\nConfirmation, seeds 909…1616 (RESEARCH.md §10.2)\n');
console.log(`1. being understood → children, world 3:  ${fmt(c1)}`);
console.log(`2. both conditions needed:                ${c2 ? 'YES' : 'NO'}   (world 1: ${fmt(c1w1)}; world 6: ${fmt(c1w6)})`);
console.log(`3. Pagel, world 3:                        ${fmt(c3)}`);
console.log(`4. Kirby, world 3:                        ${fmt(c4)}`);
console.log(`5. sanity, world 3: understood beats context on ${emergence}/8, contact → shared words ${contact}/8, children keep ${Math.round(kept * 100)}% of words; islands alive ${alive('3')}/8 (worlds 1, 6: ${alive('1')}/8, ${alive('6')}/8)`);
writeFileSync(`${root}data/confirm/result.json`, JSON.stringify({ at: new Date().toISOString(), c1, c1w1, c1w6, c2, c3, c4, sanity: { emergence, contact, kept } }, null, 1));
