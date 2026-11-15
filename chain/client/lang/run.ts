// Mother Tongue, Phase 0 runner.
//   npx tsx lang/run.ts                    one run, full report
//   npx tsx lang/run.ts pop=8 seed=3       override any SimParams / LangParams by name
//   npx tsx lang/run.ts sweep              compare population sizes and settings over several seeds
// Writes the full result to data/lang/<label>.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LANG, MEANING_NAMES, N_MEANINGS, NUM, type LangParams } from './engine.ts';
import { DEFAULT_SIM, TOWNS, runSim, type GenStats, type SimParams, type SimResult } from './sim.ts';

const OUT = fileURLToPath(new URL('../data/lang/', import.meta.url));

function parseArgs(argv: string[]) {
  const sim: Partial<SimParams> = {};
  const lang: Partial<LangParams> = {};
  const flags = new Set<string>();
  for (const a of argv) {
    const [k, v] = a.split('=');
    if (v === undefined) { flags.add(k); continue; }
    const n = v === 'true' ? true : v === 'false' ? false : Number(v);
    if (k in DEFAULT_SIM) (sim as Record<string, unknown>)[k] = n;
    else if (k in DEFAULT_LANG) (lang as Record<string, unknown>)[k] = n;
    else throw new Error(`unknown parameter ${k}`);
  }
  return { sim, lang, flags };
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const tail = (s: GenStats[], n = 10) => s.slice(-n);

/** Share of (town, meaning) slots whose most common word changed over `span` generations. */
function drift(r: SimResult, span = 10): number {
  const d = r.dialects;
  const rates: number[] = [];
  for (let g = span; g < d.length; g++) {
    let n = 0, k = 0;
    for (let t = 0; t < 4; t++) for (let m = 0; m < N_MEANINGS; m++) {
      const a = d[g - span][t][m]?.word, b = d[g][t][m]?.word;
      if (!a || !b) continue;
      n++;
      if (a !== b) k++;
    }
    if (n) rates.push(k / n);
  }
  return avg(rates);
}

/** Town × town: share of meanings whose most common word is the same, at the last generation. */
function townMatrix(r: SimResult): number[][] {
  const last = r.dialects[r.dialects.length - 1];
  return TOWNS.map((_, a) => TOWNS.map((_, b) => {
    let n = 0, k = 0;
    for (let m = 0; m < N_MEANINGS; m++) {
      if (m === NUM(1)) continue;
      const x = last[a][m]?.word, y = last[b][m]?.word;
      if (!x || !y) continue;
      n++;
      if (x === y) k++;
    }
    return n ? k / n : 0;
  }));
}

/** Words in common use at the end that started life as a mistake. */
function mistakes(r: SimResult) {
  const last = r.dialects[r.dialects.length - 1];
  const out: { town: string; meaning: string; word: string; story: string }[] = [];
  let slots = 0;
  for (let t = 0; t < 4; t++) for (let m = 0; m < N_MEANINGS; m++) {
    const d = last[t][m];
    if (!d) continue;
    slots++;
    const o = r.registry.words.get(d.word);
    if (!o) continue;
    if (o.kind === 'misheard') {
      // Walk back to the original coinage.
      const chain = [d.word];
      let cur = o;
      while (cur.kind === 'misheard' && cur.from) { chain.push(cur.from); const nx = r.registry.words.get(cur.from); if (!nx) break; cur = nx; }
      out.push({ town: TOWNS[t], meaning: MEANING_NAMES[m], word: d.word, story: `misheard: ${chain.reverse().join(' → ')} (gen ${o.gen}, ${o.by})` });
    } else if (o.meaning !== undefined && o.meaning !== m) {
      out.push({ town: TOWNS[t], meaning: MEANING_NAMES[m], word: d.word, story: `coined for "${MEANING_NAMES[o.meaning]}" by ${o.by} (gen ${o.gen}), now means "${MEANING_NAMES[m]}"` });
    }
  }
  return { list: out, slots };
}

function verdict(r: SimResult) {
  const end = tail(r.stats);
  const g1 = r.stats[0];
  const lift = avg(end.map((s) => s.understood - s.contextOnly));
  const within = avg(end.map((s) => s.withinTown));
  const between = avg(end.map((s) => s.betweenTowns));
  const dr = drift(r);
  const mk = mistakes(r);
  const tm = townMatrix(r);
  const minPair = Math.min(...tm.flatMap((row, a) => row.filter((_, b) => b !== a)));
  const checks = [
    { name: 'Words help: listeners guess right more often than context alone', ok: lift >= 0.15, detail: `+${pct(lift).trim()} over context (last 10 generations)` },
    { name: 'A shared vocabulary forms in the first lifetime', ok: g1.withinTown >= 0.2 && g1.understood > g1.contextOnly, detail: `gen 1: ${pct(g1.withinTown).trim()} same-word agreement within towns, understood ${pct(g1.understood).trim()} vs context ${pct(g1.contextOnly).trim()}` },
    { name: 'Towns share a language', ok: within >= 0.5, detail: `${pct(within).trim()} agreement within towns` },
    { name: 'Dialects: towns differ from each other', ok: within - between >= 0.15, detail: `${pct(within).trim()} within vs ${pct(between).trim()} between towns (most different pair shares ${pct(minPair).trim()} of words)` },
    { name: 'The language keeps changing across generations', ok: dr >= 0.05 && dr <= 0.6, detail: `${pct(dr).trim()} of town words replaced per 10 generations` },
    { name: 'Some mistakes became the norm', ok: mk.list.length >= 1, detail: `${mk.list.length} of ${mk.slots} common words started as a mistake` },
  ];
  return { checks, pass: checks.every((c) => c.ok) };
}

function report(r: SimResult) {
  const S = r.params;
  console.log(`\nMother Tongue, offline test: ${S.gens} generations × ${S.days} days, ${S.pop} agents, seed ${S.seed}\n`);

  console.log('gen  understood  context-only  deals  (exact)  deaths  words known  same word: in-town  across-towns  vocab');
  const show = new Set([1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, S.gens]);
  for (const s of r.stats) {
    if (!show.has(s.gen)) continue;
    console.log(`${String(s.gen).padStart(3)}  ${pct(s.understood).padStart(10)}  ${pct(s.contextOnly).padStart(12)}  ${pct(s.deals).padStart(5)}  ${pct(s.exactDeals).padStart(7)}  ${String(s.deaths).padStart(6)}  ${s.known.toFixed(1).padStart(11)}  ${pct(s.withinTown).padStart(18)}  ${pct(s.betweenTowns).padStart(12)}  ${String(s.vocab).padStart(5)}`);
  }

  const last = r.dialects[r.dialects.length - 1];
  console.log(`\nDialects at generation ${S.gens} (most common word per town; share of the town using it)`);
  console.log('meaning'.padEnd(9) + TOWNS.map((t) => t.padEnd(17)).join(''));
  for (let m = 0; m < N_MEANINGS; m++) {
    if (m === NUM(1)) continue;
    console.log(MEANING_NAMES[m].padEnd(9) + last.map((row) => (row[m] ? `${row[m]!.word} ${pct(row[m]!.share).trim()}` : '-').padEnd(17)).join(''));
  }

  console.log('\nHow alike the towns speak (share of meanings with the same most common word)');
  const tm = townMatrix(r);
  console.log(''.padEnd(10) + TOWNS.map((t) => t.slice(0, 8).padStart(10)).join(''));
  tm.forEach((row, a) => console.log(TOWNS[a].padEnd(10) + row.map((x) => pct(x).padStart(10)).join('')));

  console.log('\nHear the drift (the most common word for a meaning, generation by generation)');
  const gens = [1, 2, 5, 10, 20, 30, 40, 60, 80, 100].filter((g) => g <= S.gens);
  for (const [m, t] of [[0, 0], [0, 2], [1, 1], [NUM(3), 0], [11, 3], [12, 2]] as const) {
    const line = gens.map((g) => `${g}:${r.dialects[g - 1][t][m]?.word ?? '-'}`).join('  ');
    console.log(`  "${MEANING_NAMES[m]}" in ${TOWNS[t].padEnd(9)} ${line}`);
  }

  const mk = mistakes(r);
  console.log(`\nMistakes that stuck (${mk.list.length} of ${mk.slots} common words)`);
  for (const x of mk.list.slice(0, 10)) console.log(`  ${x.town}: "${x.word}" = ${x.meaning}. ${x.story}`);

  const t = (l: SimResult['logs'][number]) => {
    console.log(`  [gen ${l.gen} day ${l.day}, ${l.town}] ${l.maker}${l.makerHome !== l.town ? ` (from ${l.makerHome})` : ''} shows ${l.shows}, says "${l.said.join(' ') || '…'}"   (meant: ${l.meant})`);
    for (const rd of l.rounds) {
      for (const b of rd.bids) console.log(`      ${b.who} puts down ${b.offered}, saying "${b.said.join(' ') || '…'}"`);
      console.log(`      → ${rd.outcome}${rd.reaction ? `: "${rd.reaction}"` : ''}`);
    }
    console.log(`      = ${l.result}`);
  };
  console.log('\nTranscript, generation 1 (nobody has words yet)');
  r.logs.filter((l) => l.gen === 1).slice(0, 4).forEach(t);
  console.log(`\nTranscript, generation ${S.gens}`);
  r.logs.filter((l) => l.gen === S.gens && l.rounds.length).slice(0, 5).forEach(t);

  const v = verdict(r);
  console.log('\nGo / no-go');
  for (const c of v.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
  console.log(`\n  ${v.pass ? 'GO: the language forms, spreads, splits and drifts.' : 'NOT YET: see the failing checks.'}\n`);
}

function save(r: SimResult, label: string) {
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}${label}.json`;
  writeFileSync(file, JSON.stringify({ ...r, registry: [...r.registry.words.values()] }, null, 1));
  return file;
}

function sweep(base: Partial<SimParams>, lang: Partial<LangParams>) {
  const configs: [string, Partial<SimParams>, Partial<LangParams>][] = [
    ['8 agents (program today)', { pop: 8 }, {}],
    ['16 agents', { pop: 16 }, {}],
    ['24 agents', { pop: 24 }, {}],
    ['32 agents', { pop: 32 }, {}],
    ['16, no travel', { pop: 16, pTravel: 0, pMigrate: 0 }, {}],
    ['16, lots of travel', { pop: 16, pTravel: 0.08, pMigrate: 0.1 }, {}],
    ['16, no mishearing', { pop: 16 }, { pMishear: 0 }],
    ['16, children hear more', { pop: 16 }, { childSample: 300 }],
    ['16, children hear less', { pop: 16 }, { childSample: 50 }],
  ];
  const seeds = [1, 2, 3, 4, 5];
  console.log(`\nSweep: ${seeds.length} seeds each, averages over the last 10 generations\n`);
  console.log('config'.padEnd(26) + 'understood  context  in-town  across  far-pair  drift  mistakes  deaths/gen  passes');
  for (const [name, sp, lp] of configs) {
    const rs = seeds.map((seed) => runSim({ ...base, ...sp, seed, log: false }, { ...lang, ...lp }));
    const m = (f: (s: GenStats) => number) => avg(rs.map((r) => avg(tail(r.stats).map(f))));
    const passes = rs.filter((r) => verdict(r).pass).length;
    console.log(name.padEnd(26) + `${pct(m((s) => s.understood)).padStart(10)}  ${pct(m((s) => s.contextOnly)).padStart(7)}  ${pct(m((s) => s.withinTown)).padStart(7)}  ${pct(m((s) => s.betweenTowns)).padStart(6)}  ${pct(avg(rs.map((r) => { const tm = townMatrix(r); return Math.min(...tm.flatMap((row, a) => row.filter((_, b) => b !== a))); }))).padStart(8)}  ${pct(avg(rs.map(drift))).padStart(5)}  ${avg(rs.map((r) => mistakes(r).list.length)).toFixed(1).padStart(8)}  ${m((s) => s.deaths).toFixed(1).padStart(10)}  ${`${passes}/${seeds.length}`.padStart(6)}`);
  }
  console.log();
}

const { sim, lang, flags } = parseArgs(process.argv.slice(2));
if (flags.has('sweep')) sweep(sim, lang);
else {
  const t0 = Date.now();
  const r = runSim(sim, lang);
  report(r);
  const file = save(r, `run-pop${r.params.pop}-seed${r.params.seed}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s; full result: ${file})\n`);
}
