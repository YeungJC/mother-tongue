// RESEARCH.md §10 exploration: run one world on the exploration islands (seeds 101…808) and
// print one line per world, appended to data/explore/log.jsonl.
//   npx tsx lab/explore.ts <name> [--balanced] [--rounds N] [--child-sample N]
//   npx tsx lab/explore.ts --table          print every world explored so far
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const LOG = `${root}data/explore/log.jsonl`;
type P = { rho: number; p: number };
const sig = (xs: P[], sign: number) => xs.filter((x) => x.p < 0.05 && Math.sign(x.rho) === sign).length;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function line(r: any) {
  const f = (xs: P[], sign: number) => `${sig(xs, sign)}/8 (ρ ${mean(xs.map((x) => x.rho)).toFixed(2)})`;
  return `${r.name.padEnd(26)} understood→kids ${f(r.s.clarity, 1).padEnd(14)} understands→kids ${f(r.s.selection, 1).padEnd(14)} ` +
    `Kirby ${f(r.s.learnability, 1).padEnd(14)} Pagel ${f(r.s.stability, -1).padEnd(15)} understood ${Math.round(mean(r.s.understoodLate) * 100)}%  ` +
    `deaths ${mean(r.s.deathsPerGen).toFixed(1)}  alive ${r.s.extinct.filter((e: unknown) => e === null).length}/8  kept ${Math.round(mean(r.s.kept) * 100)}%`;
}

if (argv[0] === '--table') {
  if (existsSync(LOG)) for (const l of readFileSync(LOG, 'utf8').trim().split('\n')) console.log(line(JSON.parse(l)));
  process.exit(0);
}
const name = argv[0];
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const balanced = argv.includes('--balanced');
const noCrafts = argv.includes('--no-crafts'); // the program before crafts needed inputs
const gensAt = argv.indexOf('--gens'); // --gens N: watch longer (default 25)
const gens = gensAt >= 0 ? argv[gensAt + 1] : '25';
const pass = argv.slice(1).filter((a, i) => a !== '--balanced' && a !== '--no-crafts' && a !== '--gens' && !(gensAt >= 0 && i + 1 === gensAt + 1));
const env = {
  ...process.env,
  ...(balanced ? { LAYOUT: 'balanced', VILLAGE_SO: `${root}../target/deploy/village.balanced.so` } : {}),
  ...(noCrafts ? { NO_CRAFTS: '1', VILLAGE_SO: `${root}../target/deploy/village.pre-crafts.so` } : {}),
};
execFileSync('npx', ['tsx', 'lab/replicate.ts', '8', gens, '--flex', '0', '--out', `explore/${slug}`, ...pass], { cwd: root, env, stdio: 'ignore' });
const s = JSON.parse(readFileSync(`${root}data/explore/${slug}/summary.json`, 'utf8')).summary;
const r = { name, args: argv.slice(1), at: new Date().toISOString(), s };
mkdirSync(`${root}data/explore`, { recursive: true });
appendFileSync(LOG, JSON.stringify(r) + '\n');
console.log(line(r));
