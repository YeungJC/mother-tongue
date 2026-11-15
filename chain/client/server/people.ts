// The people of the island, as the director keeps them: who each individual is (public, also
// on-chain), and its mind (private: its dictionary, where it heard each word, and the episodes it
// remembers, which its children will learn from). Viewers can look into minds; agents can't.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Address } from '@solana/kit';
import { type Episode, Lexicon, type Phonology, Registry, type WordOrigin } from '../lang/engine.ts';

export interface Person {
  /** Keypair label (rpc) and stable id. */
  key: string;
  wallet: Address;
  name: string;
  family: string;
  generation: number;
  home: number;
  job: number;
  /** Parent's key, null for a founder. */
  parent: string | null;
  /** Sounds the family speaks with (passed down). */
  phon: Phonology;
  greed: number;
  /** Who decides for it: the habit rules, or an LLM ("thinker"). Inherited. */
  brain?: 'habit' | 'thinker';
  /** The lifetime it lived (match id), once it has. */
  lived: number | null;
  place: number | null;
  score: number | null;
  survived: boolean | null;
}

export interface Mind { lex: Lexicon; memory: Episode[] }

export interface Store {
  dir: string;
  people: Map<string, Person>;
  minds: Map<string, Mind>;
  registry: Registry;
  state: { nextMatch: number; generation: number; current: string[]; seed: number };
}

export function serializeLex(lex: Lexicon) {
  return { a: [...lex.a].map(([w, row]) => [w, [...row].map((x) => Math.round(x * 1e4) / 1e4)]), where: [...lex.where] };
}
export function deserializeLex(j: { a: [string, number[]][]; where: [string, number][] }): Lexicon {
  const lex = new Lexicon();
  for (const [w, row] of j.a) lex.a.set(w, Float32Array.from(row));
  for (const [w, b] of j.where) lex.where.set(w, b);
  return lex;
}

export function openStore(cluster: string, fresh: boolean): Store {
  const dir = new URL(`../data/${cluster}/tongue/`, import.meta.url).pathname;
  if (fresh && existsSync(dir)) rmSync(dir, { recursive: true }); // a new island: forget the old one
  mkdirSync(`${dir}minds`, { recursive: true });
  mkdirSync(`${dir}talk`, { recursive: true });
  mkdirSync(`${dir}intents`, { recursive: true });
  mkdirSync(`${dir}lexicon`, { recursive: true });
  const read = <T>(f: string, d: T): T => (!fresh && existsSync(dir + f) ? JSON.parse(readFileSync(dir + f, 'utf8')) : d);
  const people = new Map<string, Person>(read<Person[]>('people.json', []).map((p) => [p.key, p]));
  const minds = new Map<string, Mind>();
  for (const p of people.values()) {
    const f = `${dir}minds/${p.key}.json`;
    if (existsSync(f)) {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      minds.set(p.key, { lex: deserializeLex(j.lex), memory: j.memory });
    }
  }
  const registry = new Registry();
  for (const o of read<WordOrigin[]>('registry.json', [])) registry.add(o);
  const state = read('state.json', { nextMatch: 1, generation: 0, current: [] as string[], seed: Date.now() % 2 ** 31 });
  return { dir, people, minds, registry, state };
}

export function saveStore(s: Store, keys?: string[]) {
  writeFileSync(`${s.dir}people.json`, JSON.stringify([...s.people.values()], null, 1));
  for (const k of keys ?? [...s.minds.keys()]) {
    const m = s.minds.get(k);
    if (m) writeFileSync(`${s.dir}minds/${k}.json`, JSON.stringify({ lex: serializeLex(m.lex), memory: m.memory }));
  }
  writeFileSync(`${s.dir}registry.json`, JSON.stringify([...s.registry.words.values()]));
  writeFileSync(`${s.dir}state.json`, JSON.stringify(s.state));
}

export const NAMES = ['Ada', 'Bram', 'Cass', 'Dov', 'Esk', 'Fen', 'Gil', 'Hale', 'Ines', 'Joss', 'Kit', 'Lune', 'Mira', 'Nell', 'Oren', 'Pell',
  'Quin', 'Rook', 'Sela', 'Tam', 'Uma', 'Vex', 'Wynn', 'Yara', 'Zed', 'Arlo', 'Brin', 'Cora', 'Dace', 'Eli', 'Faye', 'Gage',
  'Hollis', 'Ivo', 'Juno', 'Kes', 'Lark', 'Moss', 'Nyx', 'Odo', 'Pim', 'Rhee', 'Sol', 'Teg', 'Ulla', 'Vale', 'Wren', 'Yew'];
