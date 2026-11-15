// How a population speaks, measured from its members' private dictionaries (viewers only).
import { type Lexicon, N_MEANINGS, NUM } from './engine.ts';

export interface Speakerish { lex: Lexicon; home: number }
export type Dialect = ({ word: string; share: number } | null)[][]; // [town][meaning]

export interface LanguageMeasure {
  /** Each speaker's word for each meaning (null: none it would use). */
  tops: (string | null)[][];
  /** Chance two speakers from the same town use the same word for a meaning. */
  withinTown: number;
  /** The same, for speakers from different towns. */
  betweenTowns: number;
  /** Average meanings a speaker has a usable word for ("one" is usually left unsaid, so it's skipped). */
  known: number;
  /** Distinct words in use. */
  vocab: number;
  /** Most common word per town and meaning, and the share of the town that uses it. */
  dialect: Dialect;
}

export function measure(pop: Speakerish[], theta: number, towns = 4): LanguageMeasure {
  const tops = pop.map((a) => Array.from({ length: N_MEANINGS }, (_, m) => { const b = a.lex.best(m); return b.w && b.s >= theta ? b.w : null; }));
  const pairAgree = (same: boolean) => {
    let n = 0, k = 0;
    for (let i = 0; i < pop.length; i++) for (let j = i + 1; j < pop.length; j++) {
      if ((pop[i].home === pop[j].home) !== same) continue;
      for (let m = 0; m < N_MEANINGS; m++) {
        if (m === NUM(1)) continue;
        n++;
        if (tops[i][m] && tops[i][m] === tops[j][m]) k++;
      }
    }
    return n ? k / n : 0;
  };
  const dialect = Array.from({ length: towns }, (_, t) => Array.from({ length: N_MEANINGS }, (_, m) => {
    const counts = new Map<string, number>();
    const here = pop.map((a, i) => ({ a, i })).filter(({ a }) => a.home === t);
    here.forEach(({ i }) => { const w = tops[i][m]; if (w) counts.set(w, (counts.get(w) ?? 0) + 1); });
    const best = [...counts].sort((x, y) => y[1] - x[1])[0];
    return best ? { word: best[0], share: best[1] / here.length } : null;
  }));
  return {
    tops,
    withinTown: pairAgree(true),
    betweenTowns: pairAgree(false),
    known: pop.length ? tops.reduce((s, t) => s + t.filter((x, m) => x && m !== NUM(1)).length, 0) / pop.length : 0,
    vocab: new Set(tops.flat().filter(Boolean)).size,
    dialect,
  };
}
