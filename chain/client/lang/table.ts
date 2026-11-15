// One table, step by step: the maker shows goods and speaks; bidders guess and put goods down
// (speaking about them); the maker accepts one or rejects them all; everyone present learns from
// what they saw. Shared by the offline simulation (sim.ts, all steps at once) and the on-chain
// director (server/tongue.ts, a transaction between steps), so both learn exactly the same way.
//
// Nothing here moves goods: the caller does that (in memory, or on-chain).

import {
  type Episode, type LangParams, Lexicon, NO, type Registry, type Rng, type SpeakCtx, type Speaker, YES,
  hearReaction, learnReaction, learnRejection, learnUtterance, sayGoods, understand, wordFor,
} from './engine.ts';
import { type Holdings, chooseAccept, chooseBid, chooseGive, chooseWant, contextPrior } from './habit.ts';

export interface Trader extends Speaker, Holdings {
  alive: boolean;
  memory: Episode[];
}

export interface TableEnv {
  rng: Rng;
  reg: Registry;
  P: LangParams;
  gen: number;
  day: number;
  town: number;
  /** Chance a maker takes a good-enough bid that wasn't what it asked for. */
  pFlexible: number;
  /** Episodes an agent remembers (children learn from these). */
  memory: number;
  /** COUNTERFACTUAL ONLY (lab/blame.ts): oracle switches that stop agents learning the wrong
   *  lesson. fairBlame: a rejected bid with the right good only weakens the number word.
   *  fairCredit: listeners don't learn from a trade the maker never asked for. Never on in play. */
  fairBlame?: boolean;
  fairCredit?: boolean;
}

export interface TableBid<T> { b: T; g: number; q: number; said: string[] }

export class TableTalk<T extends Trader> {
  /** First-round bids, and how many guessed exactly what the maker meant (with words, and with
   *  context alone): the "understood" measure. */
  firstBids = 0;
  firstRight = 0;
  ctxRight = 0;
  /** Each listener's best guess at what the maker meant, by round (for research: private). */
  readonly guesses = new Map<T, { g: number; q: number }[]>();
  private readonly excluded = new Map<T, Set<string>>();
  private readonly prior: (g: number, q: number) => number;
  private readonly ctxGuess: { g: number; q: number };
  private readonly ctx: SpeakCtx;

  private constructor(
    readonly maker: T,
    readonly here: T[],
    readonly env: TableEnv,
    readonly give: number,
    readonly giveQ: number,
    readonly want: number,
    readonly wantQ: number,
    readonly said: string[],
    ctx: SpeakCtx,
  ) {
    this.ctx = ctx;
    this.prior = contextPrior(maker.inv, give, giveQ);
    this.ctxGuess = understand(new Lexicon(), [], this.prior, env.P)[0];
  }

  /** The maker decides what to show and what it wants, and says it. Null: nothing to spare. */
  static open<T extends Trader>(maker: T, here: T[], env: TableEnv): TableTalk<T> | null {
    const offer = chooseGive(maker, env.rng);
    if (!offer) return null;
    const { want, wantQ } = chooseWant(maker, offer.give, offer.giveQ);
    const ctx: SpeakCtx = { rng: env.rng, reg: env.reg, P: env.P, gen: env.gen, day: env.day, town: env.town };
    const said = sayGoods(maker, want, wantQ, ctx);
    return new TableTalk(maker, here, env, offer.give, offer.giveQ, want, wantQ, said, ctx);
  }

  private remember(x: T, e: Episode) {
    x.memory.push(e);
    if (x.memory.length > this.env.memory) x.memory.shift();
  }

  /** Everyone else present guesses what the maker meant, and bids on a guess it can afford. */
  round(n: number): TableBid<T>[] {
    const { P } = this.env;
    const bids: TableBid<T>[] = [];
    for (const b of this.here) {
      if (b === this.maker || !b.alive) continue;
      const ex = this.excluded.get(b) ?? new Set<string>();
      const guesses = understand(b.lex, this.said, this.prior, P).filter((x) => !ex.has(`${x.g}:${x.q}`));
      const top = guesses[0];
      if (!top) continue;
      const mine = this.guesses.get(b) ?? [];
      mine.push({ g: top.g, q: top.q });
      this.guesses.set(b, mine);
      if (n === 1) {
        this.firstBids++;
        if (top.g === this.want && top.q === this.wantQ) this.firstRight++;
        if (this.ctxGuess.g === this.want && this.ctxGuess.q === this.wantQ) this.ctxRight++;
      }
      const ok = chooseBid(b, guesses, this.give, this.giveQ);
      if (!ok) continue;
      bids.push({ b, g: ok.g, q: ok.q, said: sayGoods(b, ok.g, ok.q, this.ctx) });
    }
    return bids;
  }

  /** Everyone sees the goods each bidder put down, and hears what it said about them. */
  heard(bids: TableBid<T>[]) {
    const { P, town } = this.env;
    for (const bid of bids) {
      for (const x of this.here) {
        if (!x.alive) continue;
        learnUtterance(x.lex, bid.said, bid.g, bid.q, x === bid.b ? P.ground * 0.5 : P.ground, P, town);
        this.remember(x, { kind: 'goods', town, tokens: bid.said, g: bid.g, q: bid.q });
      }
    }
  }

  choose(bids: TableBid<T>[]): TableBid<T> | null {
    return chooseAccept(this.maker, bids, this.want, this.wantQ, this.give, this.giveQ, this.env.rng, this.env.pFlexible);
  }

  /** The maker took `taken` (the caller moves the goods) and says its word for yes. Everyone
   *  present links the maker's words to what changed hands. */
  accepted(taken: TableBid<T>): { yes: string | null; understood: boolean } {
    const { P, town } = this.env;
    const yes = wordFor(this.maker, YES, this.ctx);
    for (const x of this.here) {
      if (!x.alive || x === this.maker) continue;
      const r = x === taken.b ? P.alpha : P.alpha * P.bystander;
      if (!(this.env.fairCredit && taken.g !== this.want)) {
        learnUtterance(x.lex, this.said, taken.g, taken.q, r, P, town);
        this.remember(x, { kind: 'goods', town, tokens: this.said, g: taken.g, q: taken.q });
      }
      if (yes) { learnReaction(x.lex, yes, true, r, P, town); this.remember(x, { kind: 'react', town, word: yes, yes: true }); }
    }
    const understood = taken.g === this.want && taken.q >= this.wantQ;
    if (understood) learnUtterance(this.maker.lex, this.said, this.want, this.wantQ, P.alpha * 0.5, P, town);
    else learnRejection(this.maker.lex, this.said, this.want, this.wantQ, P.alpha * 0.5, P); // my words didn't work
    return { yes, understood };
  }

  /** The maker turned every bid down and says its word for no. Bidders drop their guess. */
  rejected(bids: TableBid<T>[]): string | null {
    const { P, town, rng } = this.env;
    const no = wordFor(this.maker, NO, this.ctx);
    for (const x of this.here) {
      if (!x.alive || x === this.maker) continue;
      const bid = bids.find((y) => y.b === x);
      if (bid) {
        if (this.env.fairBlame && bid.g === this.want) learnRejection(x.lex, this.said, -1, bid.q, P.alpha, P);
        else learnRejection(x.lex, this.said, bid.g, bid.q, P.alpha, P);
        const ex = this.excluded.get(x) ?? new Set<string>();
        ex.add(`${bid.g}:${bid.q}`);
        this.excluded.set(x, ex);
      }
      // A listener who already reads the word as "yes" is confused by the rejection: only a
      // little evidence it means "no".
      if (no) {
        const r = bid ? P.alpha : P.alpha * P.bystander;
        if (hearReaction(x.lex, no) !== 'yes' || rng() < 0.3) learnReaction(x.lex, no, false, r, P, town);
        this.remember(x, { kind: 'react', town, word: no, yes: false });
      }
    }
    return no;
  }
}
