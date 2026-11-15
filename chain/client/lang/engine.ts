// Mother Tongue: the language engine. Pure, deterministic given an RNG, no chain, no LLM.
//
// Each agent holds a private Lexicon: word form -> meaning -> confidence in [0, 1]. Nothing in
// here ever tells an agent what a word "really" means. Agents only learn from what they can
// observe: goods put on the table, bids, accept/reject, and other agents' trades. Wrong beliefs
// are normal; they only weaken when they cause failures.
//
// This file is meant to be reused as-is by the director (Phase 1), so it knows nothing about the
// simulated island in sim.ts.

// ── Meanings ────────────────────────────────────────────────────────────────────────────────

export const GOODS = ['food', 'wood', 'ore', 'tools', 'planks'] as const;
export const N_GOODS = GOODS.length;
export const MAX_Q = 6;
/** Meaning ids: 0..4 goods, 5..10 the numbers 1..6, 11 yes, 12 no. */
export const NUM = (q: number) => N_GOODS - 1 + q;
export const YES = N_GOODS + MAX_Q;
export const NO = YES + 1;
export const N_MEANINGS = NO + 1;
export const MEANING_NAMES = [...GOODS, 'one', 'two', 'three', 'four', 'five', 'six', 'yes', 'no'];

// ── Parameters ──────────────────────────────────────────────────────────────────────────────

export interface LangParams {
  /** Learning rate for the agent directly involved (the bidder whose bid was taken). */
  alpha: number;
  /** Multiplier on alpha for bystanders who only watched. */
  bystander: number;
  /** Learning rate for words spoken while showing goods (a bid you can see: like pointing). */
  ground: number;
  /** How strongly a success suppresses competing words and competing meanings. */
  inhibit: number;
  /** How strongly a rejected bid weakens the guess behind it. */
  neg: number;
  /** Minimum confidence to use a word when speaking. */
  theta: number;
  /** Chance of inventing a word when you need one and don't have one. */
  pCoin: number;
  /** Chance of saying "tavo tavo tavo" for 3 when you have no number word. */
  pIconic: number;
  /** Floor on word support while listening (how much an unknown word is ignored). */
  eps: number;
  /** Children: learning rate while replaying what they overheard. */
  childAlpha: number;
  /** Children: how many of the parent's episodes they get to hear (the bottleneck). */
  childSample: number;
  /** Children: chance of mishearing a word form while learning it. */
  pMishear: number;
}

export const DEFAULT_LANG: LangParams = {
  alpha: 0.35,
  bystander: 0.4,
  ground: 0.3,
  inhibit: 0.25,
  neg: 0.3,
  theta: 0.2,
  pCoin: 0.6,
  pIconic: 0.5,
  eps: 0.05,
  childAlpha: 0.3,
  childSample: 120,
  pMishear: 0.03,
};

// ── RNG ─────────────────────────────────────────────────────────────────────────────────────

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

// ── Sounds ──────────────────────────────────────────────────────────────────────────────────

/** A family's sound inventory. Words are consonant-vowel syllables built from it. */
export interface Phonology { cons: string[]; vows: string[] }

const ALL_CONS = ['p', 't', 'k', 'm', 'n', 's', 'l', 'r', 'v', 'b', 'd', 'g', 'sh', 'th', 'z'];
const ALL_VOWS = ['a', 'e', 'i', 'o', 'u'];
/** Sounds people confuse: used for mishearing. */
const NEAR: Record<string, string[]> = {
  p: ['b'], b: ['p', 'v'], t: ['d', 'th'], d: ['t'], k: ['g'], g: ['k'], m: ['n'], n: ['m'],
  s: ['z', 'sh'], z: ['s'], sh: ['s'], th: ['t', 's'], l: ['r'], r: ['l'], v: ['b'],
  a: ['e', 'o'], e: ['a', 'i'], i: ['e'], o: ['u', 'a'], u: ['o'],
};

export function makePhonology(rng: Rng): Phonology {
  const shuffle = <T>(xs: T[]) => xs.map((x) => [rng(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  return { cons: shuffle([...ALL_CONS]).slice(0, 5), vows: shuffle([...ALL_VOWS]).slice(0, 3) };
}

/** Split a form back into syllables (onset + vowel). */
export function syllables(form: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /(sh|th|[^aeiou])([aeiou])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(form))) out.push([m[1], m[2]]);
  return out;
}

export function coinForm(ph: Phonology, rng: Rng, taken: (f: string) => boolean): string {
  for (let tries = 0; tries < 200; tries++) {
    const n = rng() < 0.25 ? 1 : rng() < 0.85 ? 2 : 3;
    let f = '';
    for (let i = 0; i < n; i++) f += pick(rng, ph.cons) + pick(rng, ph.vows);
    if (f.length >= 2 && !taken(f)) return f;
  }
  // Inventory exhausted: borrow a sound from outside it.
  let f = '';
  do f = pick(rng, ALL_CONS) + pick(rng, ALL_VOWS) + pick(rng, ALL_CONS) + pick(rng, ALL_VOWS); while (taken(f));
  return f;
}

/** Change one sound to a similar one: "tavo" -> "tavu", "kel" -> "gel". */
export function mishear(form: string, rng: Rng): string {
  const syl = syllables(form);
  if (!syl.length) return form;
  const i = Math.floor(rng() * syl.length);
  const part = rng() < 0.5 ? 0 : 1;
  const near = NEAR[syl[i][part]];
  if (!near) return form;
  syl[i][part] = pick(rng, near);
  return syl.map(([c, v]) => c + v).join('');
}

// ── Word registry (for viewers and the etymology tree, never seen by agents) ───────────────

export interface WordOrigin {
  form: string;
  kind: 'coined' | 'misheard';
  by: string;
  gen: number;
  day: number;
  town: number;
  /** For coined words: the meaning its inventor intended. */
  meaning?: number;
  /** For misheard words: the form it came from. */
  from?: string;
}

export class Registry {
  words = new Map<string, WordOrigin>();
  has = (f: string) => this.words.has(f);
  add(o: WordOrigin) { if (!this.words.has(o.form)) this.words.set(o.form, o); }
}

// ── The lexicon ─────────────────────────────────────────────────────────────────────────────

export class Lexicon {
  readonly a = new Map<string, Float32Array>();
  /** Where the agent has heard or used each word (bit per town). Travellers become bilingual:
   *  a word only competes with words used in the same place, and abroad they speak the local word. */
  readonly where = new Map<string, number>();

  heardIn(w: string, town: number) { if (town >= 0) this.where.set(w, (this.where.get(w) ?? 0) | (1 << town)); }
  usedIn(w: string, town: number) { return town < 0 || ((this.where.get(w) ?? 0) & (1 << town)) !== 0; }

  get(w: string, m: number): number { return this.a.get(w)?.[m] ?? 0; }

  private row(w: string): Float32Array {
    let r = this.a.get(w);
    if (!r) this.a.set(w, (r = new Float32Array(N_MEANINGS)));
    return r;
  }

  boost(w: string, m: number, r: number) { const row = this.row(w); row[m] += r * (1 - row[m]); }
  weaken(w: string, m: number, f: number) { const row = this.a.get(w); if (row) row[m] *= 1 - Math.min(1, f); }

  /** The agent's best word for a meaning, and how sure it is. */
  best(m: number): { w: string | null; s: number } {
    let w: string | null = null;
    let s = 0;
    for (const [f, row] of this.a) if (row[m] > s) { s = row[m]; w = f; }
    return { w, s };
  }

  /**
   * The word a speaker would pick for a meaning: confident AND not mostly about something else
   * (people avoid words that would be taken the wrong way). Score = confidence × precision.
   */
  bestToSay(m: number, town = -1): { w: string | null; s: number } {
    let w: string | null = null;
    let s = 0;
    for (const [f, row] of this.a) {
      if (row[m] <= 0) continue;
      let max = 0;
      for (let k = 0; k < N_MEANINGS; k++) if (k !== m && row[k] > max) max = row[k];
      const sc = row[m] * (row[m] / (row[m] + max)) * (this.usedIn(f, town) ? 1 : 0.5); // prefer the local word
      if (sc > s) { s = sc; w = f; }
    }
    return { w, s };
  }

  /** What the agent thinks a word means, most likely first. */
  meanings(w: string): { m: number; s: number }[] {
    const row = this.a.get(w);
    if (!row) return [];
    return [...row].map((s, m) => ({ m, s })).filter((x) => x.s > 0.01).sort((x, y) => y.s - x.s);
  }

  prune() {
    for (const [f, row] of this.a) {
      let any = false;
      for (let m = 0; m < N_MEANINGS; m++) { if (row[m] < 0.01) row[m] = 0; else any = true; }
      if (!any) { this.a.delete(f); this.where.delete(f); }
    }
  }

  clone(): Lexicon {
    const l = new Lexicon();
    for (const [f, r] of this.a) l.a.set(f, Float32Array.from(r));
    for (const [f, b] of this.where) l.where.set(f, b);
    return l;
  }
}

// ── Speaking ────────────────────────────────────────────────────────────────────────────────

export interface Speaker {
  name: string;
  lex: Lexicon;
  phon: Phonology;
}

export interface SpeakCtx { rng: Rng; reg: Registry; P: LangParams; gen: number; day: number; town: number }

/** A word for one meaning: the best known word, or a new one, or nothing. */
export function wordFor(sp: Speaker, m: number, ctx: SpeakCtx): string | null {
  const { w, s } = sp.lex.bestToSay(m, ctx.town);
  if (w && s >= ctx.P.theta) return w;
  if (ctx.rng() >= ctx.P.pCoin) return null;
  const f = coinForm(sp.phon, ctx.rng, ctx.reg.has);
  ctx.reg.add({ form: f, kind: 'coined', by: sp.name, gen: ctx.gen, day: ctx.day, town: ctx.town, meaning: m });
  sp.lex.boost(f, m, 0.5);
  sp.lex.heardIn(f, ctx.town);
  return f;
}

/** Say "good, quantity" as best you can: "tavo rii", or "tavo tavo tavo", or "tavo", or nothing. */
export function sayGoods(sp: Speaker, g: number, q: number, ctx: SpeakCtx): string[] {
  const gw = wordFor(sp, g, ctx);
  const { w: nw, s: ns } = sp.lex.bestToSay(NUM(q), ctx.town);
  if (nw && ns >= ctx.P.theta) return gw ? [gw, nw] : [nw];
  if (gw && q >= 2 && q <= 4 && ctx.rng() < ctx.P.pIconic) return Array(q).fill(gw);
  if (q === 1) return gw ? [gw] : [];
  const n = wordFor(sp, NUM(q), ctx);
  return [gw, n].filter((x): x is string => !!x);
}

// ── Listening ───────────────────────────────────────────────────────────────────────────────

export interface Guess { g: number; q: number; score: number }

/** How many times a token is repeated, if the message is just one word said k times. */
function iconicCount(tokens: string[]): number {
  return tokens.length >= 2 && tokens.every((t) => t === tokens[0]) ? tokens.length : 0;
}

/**
 * Guess what "good, quantity" a speaker meant. `prior` is what the context alone suggests (what
 * the speaker is short of, what a fair price would be). Words shift the guess; unknown words
 * shift nothing.
 */
export function understand(lex: Lexicon, tokens: string[], prior: (g: number, q: number) => number, P: LangParams): Guess[] {
  const uniq = [...new Set(tokens)];
  const k = iconicCount(tokens);
  const out: Guess[] = [];
  for (let g = 0; g < N_GOODS; g++) {
    for (let q = 1; q <= MAX_Q; q++) {
      const p = prior(g, q);
      if (p <= 0) continue;
      let score = Math.log(p);
      for (const t of uniq) {
        const sg = lex.get(t, g);
        const sq = k ? 0 : lex.get(t, NUM(q));
        score += Math.log(P.eps + Math.max(sg, sq));
      }
      if (k && q === k) score += Math.log(4); // repetition reads as counting
      out.push({ g, q, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** What a single reaction word means to this listener: yes, no, or no idea. */
export function hearReaction(lex: Lexicon, w: string | null): 'yes' | 'no' | null {
  if (!w) return null;
  const y = lex.get(w, YES);
  const n = lex.get(w, NO);
  if (Math.max(y, n) < 0.2) return null;
  return y >= n ? 'yes' : 'no';
}

// ── Learning (only from observed outcomes) ─────────────────────────────────────────────────

/**
 * Strengthen links from these words to these meanings; suppress rivals. When several words and
 * several meanings are in play, credit is shared out by what the learner already believes
 * ("I know 'thazi' is wood, so 'shozi' must be the two"): explaining away, which children use
 * too. With nothing known, every word gets credit for every meaning, and only repeated
 * experience separates them.
 */
function reinforce(lex: Lexicon, links: [string, number[]][], r: number, P: LangParams, town: number) {
  const said = new Set(links.map(([w]) => w));
  const targets = [...new Set(links.flatMap(([, ms]) => ms))];
  const credit = new Map<string, Map<number, number>>();
  for (const [w, ms] of links) credit.set(w, new Map(ms.map((m) => [m, lex.get(w, m) + 0.1])));
  for (let it = 0; it < 4; it++) {
    for (const row of credit.values()) { // each word's credit across meanings
      const t = [...row.values()].reduce((a, b) => a + b, 0);
      for (const [m, v] of row) row.set(m, v / t);
    }
    for (const m of targets) { // each meaning's credit across words
      let t = 0;
      for (const row of credit.values()) t += row.get(m) ?? 0;
      for (const row of credit.values()) if (row.has(m)) row.set(m, row.get(m)! / t);
    }
  }
  for (const [w, ms] of links) {
    lex.heardIn(w, town);
    for (const m of ms) lex.boost(w, m, r * Math.min(1, credit.get(w)!.get(m)!));
    for (let m = 0; m < N_MEANINGS; m++) if (!ms.includes(m)) lex.weaken(w, m, r * P.inhibit);
  }
  for (const [f, row] of lex.a) {
    if (said.has(f) || !lex.usedIn(f, town)) continue; // only words used HERE are rivals
    for (const m of targets) if (row[m] > 0) row[m] *= 1 - r * P.inhibit;
  }
}

/**
 * Someone said `tokens` and then a trade of (g, q) happened (or goods g×q were shown). The words
 * were probably about that. Which word is the good and which is the number is NOT known: both
 * get credit, and repeated experience sorts it out (or doesn't: that's a mistake that sticks).
 */
export function learnUtterance(lex: Lexicon, tokens: string[], g: number, q: number, r: number, P: LangParams, town = -1) {
  if (!tokens.length || r <= 0) return;
  const k = iconicCount(tokens);
  const uniq = [...new Set(tokens)];
  reinforce(lex, uniq.map((t) => [t, k === q ? [g] : q === 1 ? [g] : [g, NUM(q)]]), r, P, town);
}

/** A guess of (g, q) for these words was rejected: weak evidence against it. */
export function learnRejection(lex: Lexicon, tokens: string[], g: number, q: number, r: number, P: LangParams) {
  for (const t of new Set(tokens)) { if (g >= 0) lex.weaken(t, g, r * P.neg); lex.weaken(t, NUM(q), r * P.neg); }
}

/** A word was said while accepting or rejecting. */
export function learnReaction(lex: Lexicon, w: string, yes: boolean, r: number, P: LangParams, town = -1) {
  reinforce(lex, [[w, [yes ? YES : NO]]], r, P, town);
}

// ── Episodes and inheritance ───────────────────────────────────────────────────────────────

/** Something an agent saw happen: the raw material children learn from. */
export type Episode =
  | { kind: 'goods'; town: number; tokens: string[]; g: number; q: number }
  | { kind: 'react'; town: number; word: string; yes: boolean };

export function replay(lex: Lexicon, e: Episode, r: number, P: LangParams) {
  if (e.kind === 'goods') learnUtterance(lex, e.tokens, e.g, e.q, r, P, e.town);
  else learnReaction(lex, e.word, e.yes, r, P, e.town);
}

/**
 * A child learns from a limited sample of what its parent saw, not from the parent's head. Some
 * words are never heard, some are misheard, and ambiguous ones can be reinterpreted.
 */
export function inherit(episodes: Episode[], child: string, ctx: SpeakCtx): Lexicon {
  const { rng, P, reg } = ctx;
  const lex = new Lexicon();
  const n = Math.min(P.childSample, episodes.length);
  // Sample without replacement, keep chronological order.
  const idx = episodes.map((_, i) => i).sort(() => rng() - 0.5).slice(0, n).sort((a, b) => a - b);
  const misheard = new Map<string, string>(); // a child mishears a given word consistently
  const hear = (w: string) => {
    if (misheard.has(w)) return misheard.get(w)!;
    let h = w;
    if (rng() < P.pMishear) {
      h = mishear(w, rng);
      if (h !== w) reg.add({ form: h, kind: 'misheard', by: child, gen: ctx.gen, day: 0, town: ctx.town, from: w });
    }
    misheard.set(w, h);
    return h;
  };
  for (const i of idx) {
    const e = episodes[i];
    if (e.kind === 'goods') replay(lex, { ...e, tokens: e.tokens.map(hear) }, P.childAlpha, P);
    else replay(lex, { ...e, word: hear(e.word) }, P.childAlpha, P);
  }
  lex.prune();
  return lex;
}
