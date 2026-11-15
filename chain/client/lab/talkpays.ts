// RESEARCH.md §8, as declared before running: does being understood earn children when crafts
// need inputs? Offline sim, 16 seeds × 25 generations × 12 agents, two arms, two markets.
//
//   npx tsx lab/talkpays.ts
import { writeFileSync } from 'node:fs';
import { type LifeRecord, runSim } from '../lang/sim.ts';
import { mulberry32 } from '../lang/engine.ts';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const MIN_GUESSES = 5;
const PERMS = 1000;

function ranks(v: number[]) {
  const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2;
    i = j + 1;
  }
  return r as number[];
}
function pearson(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}
/** Spearman ρ and a one-sided permutation p (ρ > 0). */
function spearman(x: number[], y: number[], seed: number) {
  const rx = ranks(x), ry = ranks(y);
  const rho = pearson(rx, ry);
  const rng = mulberry32(seed);
  const perm = [...ry];
  let hits = 0;
  for (let k = 0; k < PERMS; k++) {
    for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    if (pearson(rx, perm) >= rho) hits++;
  }
  return { rho, p: (hits + 1) / (PERMS + 1) };
}

const arms = [
  { name: 'A as played', crafts: false },
  { name: 'B crafts need inputs', crafts: true },
];
const out: Record<string, unknown> = {};
for (const flex of [0, 0.5]) {
  console.log(`\nmarket flex ${flex} ${flex === 0 ? '(PRIMARY: the live island)' : '(secondary)'}`);
  for (const arm of arms) {
    const per = SEEDS.map((seed) => {
      const r = runSim({ seed, pop: 12, gens: 25, log: false, pFlexible: flex, toolBoost: true, crafts: arm.crafts });
      const L = r.lives.filter((l: LifeRecord) => l.clarityN >= MIN_GUESSES);
      const { rho, p } = spearman(L.map((l) => l.clarityRight / l.clarityN), L.map((l) => l.kids), seed);
      const understood = r.stats.slice(-10).reduce((a, s) => a + s.understood, 0) / 10;
      const deaths = r.stats.reduce((a, s) => a + s.deaths, 0) / r.stats.length;
      return { seed, n: L.length, rho, p, understood, deaths };
    });
    const counts = per.filter((x) => x.rho > 0 && x.p < 0.05).length;
    const mean = (f: (x: (typeof per)[0]) => number) => per.reduce((a, x) => a + f(x), 0) / per.length;
    console.log(`  ${arm.name.padEnd(22)} clarity → children on ${String(counts).padStart(2)}/16 seeds  mean ρ ${mean((x) => x.rho).toFixed(3).padStart(6)}  ` +
      `understood ${(mean((x) => x.understood) * 100).toFixed(0)}%  deaths/gen ${mean((x) => x.deaths).toFixed(2)}  lives/seed ${mean((x) => x.n).toFixed(0)}`);
    out[`${flex}:${arm.name}`] = { counts, per };
  }
}
writeFileSync(new URL('../data/talkpays.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('\n→ data/talkpays.json   (rule: B ≥ 14/16 and A ≤ 2/16 on the primary market)');
