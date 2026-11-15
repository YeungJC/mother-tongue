// Thinkers: the AI part of the island. Half the founders are "thinkers" (an LLM reasons for them)
// and half keep the habit rules; children inherit their parent's kind (with a small chance of the
// other), so natural selection decides whether thinking pays (RESEARCH.md, question 8).
//
// A thinker does two things, both from ITS OWN observations only (no oracle):
//  - plan: every few days, what to focus on, whether to travel, whether to build;
//  - a linguist moment: pick a word it's unsure of, look at what happened each time it heard it,
//    and reason out a meaning. The conclusion moves its confidence only as far as it's sure.
// Every call is budgeted; on any failure the habit rules carry on.

import { type Episode, type LangParams, type Lexicon, MEANING_NAMES, NUM, N_MEANINGS } from '../lang/engine.ts';
import { chat, parseJson } from './llm.ts';

const GOODS = ['food', 'wood', 'ore', 'tools', 'planks'];
const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere'];

export interface Thought { kind: 'plan' | 'linguist'; thought: string; model: string; word?: string; meaning?: string; sure?: number; focus?: string; travel?: string | null; build?: boolean }

export class Budget {
  used = 0;
  constructor(readonly max: number) {}
  take() { if (this.used >= this.max) return false; this.used++; return true; }
}

// ---------------------------------------------------------------- planning
export interface PlanInput {
  name: string; job: string; home: number; location: number; day: number; days: number;
  inv: number[]; hunger: number; frostSoon: number; makersOf: Record<string, string[]>;
}
export interface Plan { focus: number; travel: number | null; build: boolean; thought: string; model: string }

export async function plan(x: PlanInput): Promise<Plan | null> {
  const holdings = x.inv.map((q, g) => `${q} ${GOODS[g]}`).join(', ');
  const where = Object.entries(x.makersOf).map(([g, ts]) => `${g}: ${ts.join(', ') || 'nowhere'}`).join('; ');
  const out = await chat('lite', [
    { role: 'system', content: 'You are an islander in a small barter economy with no shared language: you trade by putting goods on a table and saying invented words. You eat 1 food a day (3 hungry days and you die); a frost burns 1 wood a day. Wealth (goods, and buildings: a workshop costs 2 tools + 4 planks and adds 3 to your daily work) decides how many children you have. Decide your focus for the next few days. Reply ONLY with JSON: {"focus": "food|wood|ore|tools|planks", "travel": "Wrenford|Oakhollow|Ironcrag|Saltmere|null", "build": true|false, "thought": "<one short first-person sentence>"}' },
    { role: 'user', content: `You are ${x.name}, a ${x.job} of ${TOWNS[x.home]}, now in ${TOWNS[x.location]}. Day ${x.day} of ${x.days}. You hold: ${holdings}.${x.hunger ? ` You have been hungry ${x.hunger} day(s).` : ''}${x.frostSoon ? ` A frost is coming: you need ${x.frostSoon} wood.` : ''} Who makes what: ${where}. Travelling costs days each way and you can't work while away.` },
  ], { json: true, maxTokens: 300 });
  const j = parseJson<{ focus?: string; travel?: string | null; build?: boolean; thought?: string }>(out.text);
  const focus = GOODS.indexOf(String(j.focus ?? '').toLowerCase());
  if (focus < 0) return null;
  const t = TOWNS.indexOf(String(j.travel ?? ''));
  return { focus, travel: t >= 0 && t !== x.location ? t : null, build: !!j.build, thought: String(j.thought ?? '').slice(0, 240), model: out.model };
}

// ---------------------------------------------------------------- a linguist moment
/** The word this mind is least sure of among those it has heard often enough to think about. */
export function puzzle(lex: Lexicon, memory: Episode[], skip: string[] = []): { word: string; heard: number } | null {
  const heard = new Map<string, number>();
  for (const e of memory) for (const w of e.kind === 'goods' ? new Set(e.tokens) : [e.word]) heard.set(w, (heard.get(w) ?? 0) + 1);
  let best: { word: string; heard: number; score: number } | null = null;
  for (const [w, n] of heard) {
    if (n < 3 || skip.includes(w)) continue;
    const ms = lex.meanings(w);
    const top = ms[0]?.s ?? 0, second = ms[1]?.s ?? 0;
    const doubt = 1 - top + second; // unsure, or torn between two meanings
    const score = doubt * Math.log(1 + n);
    if (doubt > 0.5 && (!best || score > best.score)) best = { word: w, heard: n, score };
  }
  return best && { word: best.word, heard: best.heard };
}

/** What it saw happen each time it heard the word: its only evidence. */
function evidence(word: string, memory: Episode[]): string[] {
  const out: string[] = [];
  for (const e of memory) {
    if (e.kind === 'goods' && e.tokens.includes(word)) out.push(`someone said "${e.tokens.join(' ')}", and ${e.q} ${GOODS[e.g]} changed hands or was put down`);
    if (e.kind === 'react' && e.word === word) out.push(`someone said "${word}" while ${e.yes ? 'ACCEPTING' : 'REJECTING'} an offer`);
  }
  return out.slice(-14);
}

const MEANINGS = MEANING_NAMES.slice(0, N_MEANINGS).filter((_, m) => m !== NUM(1));

export async function linguist(name: string, lex: Lexicon, memory: Episode[], P: LangParams, skip: string[] = []): Promise<Thought | null> {
  const p = puzzle(lex, memory, skip);
  if (!p) return null;
  const ev = evidence(p.word, memory);
  if (ev.length < 3) return null;
  const current = lex.meanings(p.word).slice(0, 3).map((x) => `${MEANING_NAMES[x.m]} (${Math.round(x.s * 100)}%)`).join(', ') || 'no idea';
  const out = await chat('lite', [
    { role: 'system', content: `Your people invented their own words; nobody can tell you what a word means. Work it out from what you saw. Possible meanings: ${MEANINGS.join(', ')}. Numbers are counts of goods. Reply ONLY with JSON: {"meaning": "<one of the possible meanings>", "sure": <0 to 1>, "thought": "<one short first-person sentence explaining your reasoning, quoting the word>"}` },
    { role: 'user', content: `You are ${name}. You keep hearing "${p.word}" (${p.heard} times). Right now you think it means: ${current}. What you saw:\n- ${ev.join('\n- ')}` },
  ], { json: true, maxTokens: 300 });
  const j = parseJson<{ meaning?: string; sure?: number; thought?: string }>(out.text);
  const m = MEANING_NAMES.indexOf(String(j.meaning ?? '').toLowerCase());
  if (m < 0 || m === NUM(1)) return null;
  const sure = Math.max(0, Math.min(1, Number(j.sure ?? 0.5)));
  // The conclusion moves belief only as far as it's sure, and suppresses rivals like experience does.
  const r = 0.3 * sure;
  lex.boost(p.word, m, r);
  for (let k = 0; k < N_MEANINGS; k++) if (k !== m) lex.weaken(p.word, k, r * P.inhibit);
  return { kind: 'linguist', thought: String(j.thought ?? '').slice(0, 240), model: out.model, word: p.word, meaning: MEANING_NAMES[m], sure };
}
