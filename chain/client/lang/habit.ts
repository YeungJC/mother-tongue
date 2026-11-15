// The habit brain's trading decisions: what to put on the table, what to want back, what to
// bid, what to accept. Pure functions of an agent's holdings and private tastes, shared by the
// offline simulation (sim.ts) and the on-chain director (server/tongue.ts) so both play the
// same way. Language is not in here: engine.ts turns these choices into words and back.

import { type Guess, MAX_Q, N_GOODS, type Rng } from './engine.ts';

/** Fixed values (same as the program). */
export const BASE = [2, 3, 4, 3, 9];
export const FOOD = 0;

/** What an agent holds, plus its private tastes: nobody else can see `mult` or `greed`. */
export interface Holdings {
  inv: number[];
  /** How much it personally values each good right now (re-drawn every few days: plans change). */
  mult: number[];
  /** How much more than a fair price it asks for. */
  greed: number;
  /** Stock it must keep of each good for what's coming (wood before a frost). Food is always at
   *  least 4. Unset: nothing special coming. */
  need?: number[];
}

/** The least of good `g` this agent is comfortable holding. */
export const floorOf = (h: Holdings, g: number) => (g === FOOD ? Math.max(4, h.need?.[g] ?? 0) : h.need?.[g] ?? 0);

export const freshMult = (rng: Rng) => BASE.map(() => Math.exp((rng() - 0.5) * 1.2));

/** Diminishing returns on everything, and a sharp cost for running low on what it needs. */
export function utility(h: Holdings, inv: number[]): number {
  let u = 0;
  for (let g = 0; g < N_GOODS; g++) u += BASE[g] * h.mult[g] * 4 * Math.log(1 + inv[g] / 4);
  for (let g = 0; g < N_GOODS; g++) u -= 5 * Math.max(0, floorOf(h, g) - inv[g]);
  return u;
}

/** How much better off a trade (get getQ of getG, pay payQ of payG) leaves this agent. */
export function gain(h: Holdings, getG: number, getQ: number, payG: number, payQ: number): number {
  const after = [...h.inv];
  after[getG] += getQ;
  after[payG] -= payQ;
  return after[payG] < 0 ? -Infinity : utility(h, after) - utility(h, h.inv);
}

/** What to put on the table: the good it has most to spare of (keeping what it needs). */
export function chooseGive(h: Holdings, rng: Rng): { give: number; giveQ: number } | null {
  const surplus = h.inv.map((x, g) => x - floorOf(h, g));
  let give = -1;
  let best = 0;
  for (let g = 0; g < N_GOODS; g++) {
    const s = surplus[g] / h.mult[g];
    if (surplus[g] >= 1 && s > best) { best = s; give = g; }
  }
  if (give < 0) return null;
  return { give, giveQ: Math.min(surplus[give], 1 + Math.floor(rng() * 3)) };
}

/** What it wants back: the good it needs most (judged per unit of value, so expensive goods
 *  aren't always top), in a fair-ish amount plus a little greed. */
export function chooseWant(h: Holdings, give: number, giveQ: number): { want: number; wantQ: number } {
  let want = -1;
  let best = -Infinity;
  for (let g = 0; g < N_GOODS; g++) {
    if (g === give) continue;
    const m = h.mult[g] / (1 + (h.inv[g] * BASE[g]) / 12) + 0.5 * Math.max(0, floorOf(h, g) - h.inv[g]);
    if (m > best) { best = m; want = g; }
  }
  const wantQ = Math.max(1, Math.min(MAX_Q, Math.round((BASE[give] * giveQ * (1 + h.greed)) / BASE[want])));
  return { want, wantQ };
}

/** What context alone suggests a maker wants, from what everyone can see: something it's short
 *  of, at roughly a fair price for what's on the table. */
export function contextPrior(makerInv: number[], give: number, giveQ: number) {
  return (g: number, q: number) => {
    if (g === give) return 0;
    const fair = (BASE[give] * giveQ) / BASE[g];
    return (1 / (1 + makerInv[g])) * Math.exp(-Math.abs(q - fair) / 1.5);
  };
}

/** A bidder's move: the most likely meaning it can afford and is willing to pay. */
export function chooseBid(h: Holdings, guesses: Guess[], give: number, giveQ: number): Guess | undefined {
  return guesses.slice(0, 4).find((x) => h.inv[x.g] >= x.q && gain(h, give, giveQ, x.g, x.q) >= -0.15 * BASE[give] * giveQ);
}

/**
 * The maker's choice among bids: what it asked for (or more) if anyone offered it; otherwise,
 * sometimes, a different bid that still leaves it better off. Accepting something it didn't ask
 * for is how listeners end up learning a word wrong.
 */
export function chooseAccept<B extends { g: number; q: number }>(h: Holdings, bids: B[], want: number, wantQ: number, give: number, giveQ: number, rng: Rng, pFlexible: number): B | null {
  if (!bids.length) return null;
  const val = (x: B) => gain(h, x.g, x.q, give, giveQ);
  const exact = bids.filter((x) => x.g === want && x.q >= wantQ);
  if (exact.length) return exact.sort((p, q) => val(q) - val(p))[0];
  const best = [...bids].sort((p, q) => val(q) - val(p))[0];
  return val(best) > 0 && rng() < pFlexible ? best : null;
}
