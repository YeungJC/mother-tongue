// Mother Tongue, Phase 0: an offline island to test the language engine. No chain, no LLM, no voice.
//
// Simplified on purpose: the real match rules live in the program. What matters here is the
// pressure to communicate: agents only get what they lack by trading face to face at a table,
// where what they GIVE is visible and what they WANT has to be said in words.
//
// Towns are mixed (each has a few jobs), so there's always someone to trade with at home, but
// some goods only exist elsewhere (Ironcrag has no food), so travellers carry words between towns.

import { BASE, FOOD, freshMult as drawMult } from './habit.ts';
import { TableTalk } from './table.ts';
import { measure } from './measure.ts';
import {
  type Episode, type LangParams, type Phonology, type Rng, type Speaker, DEFAULT_LANG, GOODS, Lexicon, MEANING_NAMES, N_GOODS,
  Registry, inherit, makePhonology, mulberry32, pick,
} from './engine.ts';

// ── World constants ─────────────────────────────────────────────────────────────────────────

export const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere'];
const TRAVEL = [[0, 2, 2, 1], [2, 0, 3, 2], [2, 3, 0, 3], [1, 2, 3, 0]];
type Job = 'farmer' | 'woodcutter' | 'miner' | 'smith' | 'carpenter';
const JOBS: Record<Job, { good: number; yield: number }> = {
  farmer: { good: 0, yield: 4 }, woodcutter: { good: 1, yield: 3 }, miner: { good: 2, yield: 2 },
  smith: { good: 3, yield: 2 }, carpenter: { good: 4, yield: 1 },
};
/** What a craft uses up per work day when `crafts` is on (RESEARCH.md §8). */
const INPUT: Partial<Record<Job, number>> = { smith: 2 /* ore */, carpenter: 1 /* wood */ };
const TOOLS = 3;
const TOWN_JOBS: Job[][] = [
  ['farmer', 'carpenter', 'smith'], // Wrenford: the hub
  ['woodcutter', 'carpenter', 'farmer'], // Oakhollow
  ['miner', 'smith', 'farmer'], // Ironcrag: the only ore
  ['farmer', 'woodcutter'], // Saltmere
];
const NAMES = ['Ada', 'Bram', 'Cass', 'Dov', 'Esk', 'Fen', 'Gil', 'Hale', 'Ines', 'Joss', 'Kit', 'Lune', 'Mira', 'Nell', 'Oren', 'Pell',
  'Quin', 'Rook', 'Sela', 'Tam', 'Uma', 'Vex', 'Wynn', 'Yara', 'Zed', 'Arlo', 'Brin', 'Cora', 'Dace', 'Eli', 'Faye', 'Gage'];

export interface SimParams {
  seed: number;
  gens: number;
  pop: number; // must be a multiple of 4 (an equal share per town)
  days: number;
  rounds: number; // bid rounds per table
  pTravel: number; // daily chance of a trip just to trade
  pMigrate: number; // chance a child is raised in another town
  pFlexible: number; // chance a maker takes a good-enough bid that wasn't what it asked for
  hungerLimit: number;
  startFood: number;
  memory: number; // episodes an agent remembers (children sample from these)
  log: boolean;
  /** Counterfactual oracle switches, see TableEnv (lab/blame.ts). */
  fairBlame: boolean;
  fairCredit: boolean;
  /** The program's tool bonus: +2 yield, uses up a tool (not for smiths). Off in Phase 0. */
  toolBoost: boolean;
  /** RESEARCH.md §8: crafts need inputs (smith 1 ore, carpenter 1 wood per work day). */
  crafts: boolean;
}

export const DEFAULT_SIM: SimParams = {
  seed: 1, gens: 40, pop: 16, days: 20, rounds: 3, pTravel: 0.03, pMigrate: 0.05, pFlexible: 0.5,
  hungerLimit: 3, startFood: 6, memory: 600, log: true, fairBlame: false, fairCredit: false, toolBoost: false, crafts: false,
};

// ── Agents ──────────────────────────────────────────────────────────────────────────────────

interface Agent extends Speaker {
  id: number;
  gen: number;
  home: number;
  job: Job;
  family: string;
  parent: string | null;
  inv: number[];
  hunger: number;
  alive: boolean;
  diedDay: number;
  loc: number;
  away: { dest: number; arrive: number; back: number } | null;
  mult: number[];
  greed: number;
  memory: Episode[];
  need?: number[];
  /** Listeners' first guesses on this agent's own offers: [exactly right, all]. */
  clarity: [number, number];
  kids: number;
}

/** One finished life, for research (RESEARCH.md §8). */
export interface LifeRecord { gen: number; job: string; home: number; alive: boolean; clarityRight: number; clarityN: number; kids: number }

// ── Records (for viewers; agents never see these) ──────────────────────────────────────────

export interface TableLog {
  gen: number; day: number; town: string; maker: string; makerHome: string;
  shows: string; said: string[]; meant: string;
  rounds: { bids: { who: string; said: string[]; guessed: string; offered: string }[]; outcome: string; reaction: string | null }[];
  result: 'understood' | 'traded, but misunderstood' | 'no deal';
}

export interface GenStats {
  gen: number;
  tables: number;
  spoke: number; // share of tables where the maker said at least one word
  understood: number; // share of first-round bids that guessed exactly what the maker meant
  contextOnly: number; // share a listener with no language at all would have guessed right
  deals: number;
  exactDeals: number;
  deaths: number;
  known: number; // average meanings an agent has a usable word for
  withinTown: number; // chance two agents in the same town use the same word for a meaning
  betweenTowns: number; // same, for agents in different towns
  vocab: number; // distinct words in use
  travellers: number;
}

export interface SimResult {
  params: SimParams;
  lang: LangParams;
  stats: GenStats[];
  /** dialects[gen][town][meaning] = { word, share } of the most common word, or null. */
  dialects: ({ word: string; share: number } | null)[][][];
  logs: TableLog[];
  lives: LifeRecord[];
  registry: Registry;
  final: { name: string; town: string; job: string; family: string; beliefs: { word: string; means: string; s: number }[] }[];
}

// ── Simulation ──────────────────────────────────────────────────────────────────────────────

export function runSim(sp: Partial<SimParams> = {}, lp: Partial<LangParams> = {}): SimResult {
  const S: SimParams = { ...DEFAULT_SIM, ...sp };
  const P: LangParams = { ...DEFAULT_LANG, ...lp };
  if (S.pop % 4) throw new Error('pop must be a multiple of 4');
  const rng: Rng = mulberry32(S.seed);
  const reg = new Registry();
  const stats: GenStats[] = [];
  const dialects: SimResult['dialects'] = [];
  const logs: TableLog[] = [];
  const lives: LifeRecord[] = [];
  const perTown = S.pop / 4;
  let nextId = 0;

  const townPhon: Phonology[] = TOWNS.map(() => makePhonology(rng));

  const freshMult = () => drawMult(rng);
  const makeAgent = (gen: number, home: number, job: Job, phon: Phonology, family: string, parent: string | null, lex: Lexicon): Agent => {
    const id = nextId++;
    const inv = new Array(N_GOODS).fill(0);
    inv[FOOD] = S.startFood;
    inv[JOBS[job].good] += 2;
    const input = S.crafts ? INPUT[job] : undefined;
    let need: number[] | undefined;
    if (input !== undefined) { inv[input] += 2; need = new Array(N_GOODS).fill(0); need[input] = 2; }
    return {
      need, clarity: [0, 0], kids: 0,
      id, gen, home, job, family, parent, phon, lex, inv, name: `${NAMES[id % NAMES.length]}${gen > 1 ? `·${gen}` : ''}`,
      hunger: 0, alive: true, diedDay: 0, loc: home, away: null, mult: freshMult(), greed: 0.05 + rng() * 0.25, memory: [],
    };
  };

  // Generation 1: founders, no words at all.
  let agents: Agent[] = [];
  for (let t = 0; t < 4; t++) {
    for (let i = 0; i < perTown; i++) {
      const job = TOWN_JOBS[t][i % TOWN_JOBS[t].length];
      const a = makeAgent(1, t, job, townPhon[t], '', null, new Lexicon());
      a.family = a.name;
      agents.push(a);
    }
  }

  const present = (town: number, day: number) => agents.filter((a) => a.alive && a.loc === town && (!a.away || a.away.arrive <= day));
  const desc = (g: number, q: number) => `${q} ${GOODS[g]}`;

  for (let gen = 1; gen <= S.gens; gen++) {
    const st = { tables: 0, spoke: 0, firstBids: 0, firstRight: 0, ctxRight: 0, deals: 0, exact: 0, travellers: 0 };
    const logThisGen = S.log && (gen === 1 || gen === 2 || gen === S.gens || gen % 10 === 0);

    for (let day = 1; day <= S.days; day++) {
      // Morning: come home, set off, or work.
      for (const a of agents) {
        if (!a.alive) continue;
        if (a.away && a.away.back <= day) { a.away = null; a.loc = a.home; }
        if (a.away) continue;
        const farmerHome = agents.some((b) => b.alive && b.home === a.home && b.job === 'farmer' && b !== a);
        let dest = -1;
        if (a.inv[FOOD] < 3 && !farmerHome && a.job !== 'farmer') {
          // Hungry with no farmer at home: go where the food is.
          dest = [0, 1, 3].filter((t) => t !== a.home).sort((x, y) => TRAVEL[a.home][x] - TRAVEL[a.home][y])[0];
        } else if (rng() < S.pTravel) {
          const w = TOWNS.map((_, t) => (t === a.home ? 0 : 1 / TRAVEL[a.home][t]));
          let r = rng() * w.reduce((x, y) => x + y, 0);
          dest = w.findIndex((x) => (r -= x) <= 0);
        }
        if (dest >= 0) {
          const d = TRAVEL[a.home][dest];
          a.loc = dest;
          a.away = { dest, arrive: day + d - 1, back: day + d };
          st.travellers++;
        } else {
          const { good } = JOBS[a.job];
          let q = JOBS[a.job].yield;
          const input = S.crafts ? INPUT[a.job] : undefined;
          if (input !== undefined) { if (a.inv[input] >= 1) a.inv[input]--; else q = 0; }
          if (q > 0 && S.toolBoost && good !== TOOLS && a.inv[TOOLS] > 0) { a.inv[TOOLS]--; q += 2; }
          a.inv[good] += q;
        }
      }
      if (day % 5 === 1) for (const a of agents) a.mult = freshMult();

      // Market: each agent present gets one turn at the table.
      for (let town = 0; town < 4; town++) {
        const here = present(town, day).sort(() => rng() - 0.5);
        for (const maker of here) {
          if (!maker.alive) continue;
          if (!here.some((b) => b !== maker && b.alive)) continue;
          const talk = TableTalk.open(maker, here, { rng, reg, P, gen, day, town, pFlexible: S.pFlexible, memory: S.memory, fairBlame: S.fairBlame, fairCredit: S.fairCredit });
          if (!talk) continue;
          const { give, giveQ, want, wantQ, said } = talk;
          st.tables++;
          if (said.length) st.spoke++;
          const log: TableLog | null = logThisGen && logs.filter((l) => l.gen === gen).length < 40
            ? { gen, day, town: TOWNS[town], maker: maker.name, makerHome: TOWNS[maker.home], shows: desc(give, giveQ), said, meant: desc(want, wantQ), rounds: [], result: 'no deal' }
            : null;

          for (let round = 1; round <= S.rounds; round++) {
            const bids = talk.round(round);
            if (!bids.length) break;
            talk.heard(bids);
            const taken = talk.choose(bids);
            const roundLog = log ? { bids: bids.map((x) => ({ who: x.b.name, said: x.said, guessed: desc(x.g, x.q), offered: desc(x.g, x.q) })), outcome: '', reaction: null as string | null } : null;
            if (taken) {
              maker.inv[give] -= giveQ; taken.b.inv[give] += giveQ;
              taken.b.inv[taken.g] -= taken.q; maker.inv[taken.g] += taken.q;
              const { yes, understood } = talk.accepted(taken);
              st.deals++;
              if (understood) st.exact++;
              if (roundLog && log) { roundLog.outcome = `${maker.name} accepts ${taken.b.name}'s ${desc(taken.g, taken.q)}`; roundLog.reaction = yes; log.rounds.push(roundLog); log.result = understood ? 'understood' : 'traded, but misunderstood'; }
              break;
            }
            const no = talk.rejected(bids);
            if (roundLog && log) { roundLog.outcome = 'rejects every bid'; roundLog.reaction = no; log.rounds.push(roundLog); }
          }
          st.firstBids += talk.firstBids; st.firstRight += talk.firstRight; st.ctxRight += talk.ctxRight;
          maker.clarity[0] += talk.firstRight; maker.clarity[1] += talk.firstBids;
          if (log) logs.push(log);
        }
      }

      // Evening: eat.
      for (const a of agents) {
        if (!a.alive) continue;
        if (a.inv[FOOD] > 0) { a.inv[FOOD]--; a.hunger = 0; } else if (++a.hunger >= S.hungerLimit) { a.alive = false; a.diedDay = day; }
      }
    }

    // ── End of a lifetime: measure, then breed ──
    for (const a of agents) a.lex.prune();
    const lm = measure(agents, P.theta);
    dialects.push(lm.dialect);
    stats.push({
      gen,
      tables: st.tables,
      spoke: st.tables ? st.spoke / st.tables : 0,
      understood: st.firstBids ? st.firstRight / st.firstBids : 0,
      contextOnly: st.firstBids ? st.ctxRight / st.firstBids : 0,
      deals: st.tables ? st.deals / st.tables : 0,
      exactDeals: st.tables ? st.exact / st.tables : 0,
      deaths: agents.filter((a) => !a.alive).length,
      known: lm.known,
      withinTown: lm.withinTown,
      betweenTowns: lm.betweenTowns,
      vocab: lm.vocab,
      travellers: st.travellers,
    });

    if (gen === S.gens) break;

    // Children: parents who did better than others in their trade have more of them (standing
    // within the trade, as the program ranks: wealth ÷ the mean wealth of the living in the same
    // job). Each town gets an equal share; a few are raised elsewhere (and keep their parent's accent).
    const standing = (a: Agent) => {
      const peers = agents.filter((b) => b.alive && b.job === a.job);
      const sum = peers.reduce((s, b) => s + wealth(b), 0);
      return wealth(a) > 0 ? Math.floor((wealth(a) * 1000 * peers.length) / sum) : 0;
    };
    const ranked = agents.filter((a) => a.alive).sort((x, y) => standing(y) - standing(x) || wealth(y) - wealth(x) || x.id - y.id);
    const weight = new Map(ranked.map((a, i) => [a, Math.pow(ranked.length - i, 1.5)]));
    const draw = (pool: Agent[]) => {
      const total = pool.reduce((s, a) => s + (weight.get(a) ?? 0), 0);
      let r = rng() * total;
      return pool.find((a) => (r -= weight.get(a) ?? 0) <= 0) ?? pool[pool.length - 1];
    };
    const next: Agent[] = [];
    for (let t = 0; t < 4; t++) {
      for (let i = 0; i < perTown; i++) {
        const local = ranked.filter((a) => a.home === t);
        const parent = local.length && rng() >= S.pMigrate ? draw(local) : ranked.length ? draw(ranked) : pick(rng, agents);
        const job = TOWN_JOBS[t][i % TOWN_JOBS[t].length]; // a town keeps its trades (Saltmere always has fishers)
        const childName = `${NAMES[nextId % NAMES.length]}·${gen + 1}`;
        const lex = inherit(parent.memory, childName, { rng, reg, P, gen: gen + 1, day: 0, town: t });
        const c = makeAgent(gen + 1, t, job, parent.phon, parent.family, parent.name, lex);
        parent.kids++;
        next.push(c);
      }
    }
    for (const a of agents) lives.push({ gen, job: a.job, home: a.home, alive: a.alive, clarityRight: a.clarity[0], clarityN: a.clarity[1], kids: a.kids });
    agents = next;
  }

  return {
    params: S, lang: P, stats, dialects, logs, lives, registry: reg,
    final: agents.map((a) => ({
      name: a.name, town: TOWNS[a.home], job: a.job, family: a.family,
      beliefs: [...a.lex.a.keys()].map((w) => ({ w, top: a.lex.meanings(w)[0] })).filter((x) => x.top && x.top.s >= P.theta)
        .map((x) => ({ word: x.w, means: MEANING_NAMES[x.top!.m], s: Math.round(x.top!.s * 100) / 100 })).sort((x, y) => y.s - x.s),
    })),
  };

  function wealth(a: Agent) { return a.alive ? a.inv.reduce((s, x, g) => s + x * BASE[g], 0) : 0; }
}

