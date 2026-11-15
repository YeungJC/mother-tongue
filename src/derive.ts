// Pure functions shared by every screen: what the data on screen means, up to the playhead.
// Nothing here fetches or stores; it reads the player's tables, the day rows and the dictionary.
import { GOODS, JOBS, TOWNS, type DayRow, type LexChange, type LexDay, type Person, type Table, type Thought } from './tongue'

export const MEANINGS = ['food', 'wood', 'ore', 'tools', 'planks', 'one', 'two', 'three', 'four', 'five', 'six', 'yes', 'no']
export const ONE = 5
/** The meanings that get words ("one" is left unsaid): 12. */
export const SAID = MEANINGS.map((_, k) => k).filter((k) => k !== ONE)
export type Cell = { word: string; share: number } | null
export type Dialect = Cell[][]

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Each listener's first guess at a table: was it exactly what the maker meant? */
export function firstRight(t: Table): boolean[] {
  if (!t.meant) return []
  return Object.values(t.guesses ?? {}).filter((gs) => gs.length).map((gs) => GOODS[gs[0][0]] === t.meant!.good && gs[0][1] === t.meant!.qty)
}

/** Understanding over some tables: first guesses right, and what context alone would have got. */
export function understanding(tables: Table[]) {
  const xs = tables.flatMap(firstRight)
  const blind = tables.filter((t) => typeof t.blind === 'number' && firstRight(t).length)
  return {
    rate: xs.length ? xs.filter(Boolean).length / xs.length : NaN,
    guesses: xs.length,
    // Per table, weighted by how many listeners guessed (as the director counts it).
    blind: blind.length ? blind.reduce((a, t) => a + (t.blind as number) * firstRight(t).length, 0) / blind.reduce((a, t) => a + firstRight(t).length, 0) : NaN,
  }
}

/** The tables up to and including the playhead. */
export const upTo = (all: Table[], idx: number) => all.slice(0, Math.max(0, idx + 1))

/** The day row in force at the playhead: the evening before `day` (live: the latest written). */
export function dayRowAt(days: DayRow[], day: number): DayRow | null {
  return days.filter((d) => d.day < day).pop() ?? null
}

/** Standing as the program ranks it: wealth ÷ the mean wealth of the living in the same trade. */
export function standings(row: DayRow | null, jobOf: (k: string) => number) {
  const out = new Map<string, number>()
  if (!row) return out
  for (const a of row.agents) {
    const peers = row.agents.filter((b) => b.alive && jobOf(b.key) === jobOf(a.key))
    const sum = peers.reduce((t, b) => t + Math.max(0, b.score), 0)
    out.set(a.key, a.alive && a.score > 0 && sum ? (a.score * peers.length) / sum : 0)
  }
  return out
}

export interface AgentNow {
  key: string; name: string; job: number; home: number; thinker: boolean; alive: boolean
  standing: number; wealth: number; hunger: number; travelling: boolean; loc: number
  /** As a speaker: tables it made so far this life, and how often listeners got it right. */
  made: number; understood: number
  /** As a listener: first guesses so far, and how often right. */
  guessed: number; understands: number
  deals: number
}

/** Every agent of the lifetime on screen, this life so far (up to the playhead). */
export function agentsNow(sofar: Table[], row: DayRow | null, people: Person[], current: Person[]): AgentNow[] {
  const byKey = new Map(people.map((p) => [p.key, p]))
  const keys = row ? row.agents.map((a) => a.key) : current.map((p) => p.key)
  const jobOf = (k: string) => byKey.get(k)?.job ?? -1
  const st = standings(row, jobOf)
  return keys.map((k) => {
    const p = byKey.get(k)
    const a = row?.agents.find((x) => x.key === k)
    const mine = sofar.filter((t) => t.makerKey === k && t.meant)
    const spoke = mine.flatMap(firstRight)
    const heard = sofar.flatMap((t) => { const g = t.guesses?.[k]?.[0]; return g && t.meant ? [GOODS[g[0]] === t.meant.good && g[1] === t.meant.qty] : [] })
    const deals = sofar.filter((t) => t.result !== 'no deal' && (t.makerKey === k || t.rounds.some((r) => r.taken === k))).length
    return {
      key: k, name: p?.name ?? k.split('-').pop() ?? k, job: p?.job ?? 0, home: p?.home ?? 0, thinker: p?.brain === 'thinker', alive: a?.alive ?? true,
      standing: st.get(k) ?? 0, wealth: a?.score ?? 0, hunger: a?.hunger ?? 0, travelling: a?.travelling ?? false, loc: a?.loc ?? p?.home ?? 0,
      made: spoke.length, understood: spoke.length ? spoke.filter(Boolean).length / spoke.length : NaN,
      guessed: heard.length, understands: heard.length ? heard.filter(Boolean).length / heard.length : NaN,
      deals,
    }
  })
}

/** One sentence about the leader: what sets it apart from the island average, from its numbers. */
export function leaderLine(ranked: AgentNow[]): string | null {
  const living = ranked.filter((a) => a.alive)
  const top = living[0]
  if (!top || !(top.standing > 0)) return null
  const avg = (f: (a: AgentNow) => number) => mean(living.map(f).filter(Number.isFinite))
  const lead = `${top.name} is the richest ${JOBS[top.job]}, with ${(top.standing).toFixed(1)}× the average ${JOBS[top.job]}'s wealth`
  // The measure on which the leader stands out most from the island average (if it does).
  const options = [
    { v: top.deals, m: avg((a) => a.deals), say: (v: number, m: number) => `It has made ${v} trade${v === 1 ? "" : "s"} so far (average ${m.toFixed(1)}).` },
    { v: top.understood, m: avg((a) => a.understood), ok: top.made >= 4, say: (v: number, m: number) => `Listeners guess its offers right ${Math.round(v * 100)}% of the time (average ${Math.round(m * 100)}%).` },
    { v: top.understands, m: avg((a) => a.understands), ok: top.guessed >= 4, say: (v: number, m: number) => `It guesses others' offers right ${Math.round(v * 100)}% of the time (average ${Math.round(m * 100)}%).` },
  ].filter((o) => o.ok !== false && Number.isFinite(o.v) && Number.isFinite(o.m) && o.m > 0)
  const best = options.sort((a, b) => b.v / b.m - a.v / a.m)[0]
  return best && best.v > best.m ? `${lead}. ${best.say(best.v, best.m)}` : `${lead}.`
}

/** The dictionary in force at the playhead: the evening before `day`, or (on a lifetime's first
 *  day) how the parents spoke at the end of theirs. */
export function dictionaryAt(lexDays: LexDay[], prevLast: LexDay | null, day: number): { day: LexDay | null; inherited: boolean } {
  const ev = lexDays.filter((x) => x.day < day).pop()
  if (ev) return { day: ev, inherited: false }
  return { day: prevLast, inherited: !!prevLast }
}

/** How complete the dictionary is: meanings with a word in every town, and shared by all four. */
export function coverage(dialect: Dialect | undefined) {
  if (!dialect) return { everyTown: 0, shared: 0, of: SAID.length }
  let everyTown = 0, shared = 0
  for (const k of SAID) {
    const ws = TOWNS.map((_, t) => dialect[t]?.[k]?.word ?? null)
    if (ws.every(Boolean)) { everyTown++; if (new Set(ws).size === 1) shared++ }
  }
  return { everyTown, shared, of: SAID.length }
}

export interface LogLine { key: string; gen: number; day: number; kind: LexChange['kind'] | 'birth' | 'thought' | 'generation'; text: string; who?: string }
const NUMERAL: Record<string, string> = { two: '2', three: '3', four: '4', five: '5', six: '6' }
/** A meaning in a sentence: goods and yes/no by name, numbers as "the number 3". */
export const meaningLabel = (k: number) => (NUMERAL[MEANINGS[k]] ? `the number ${NUMERAL[MEANINGS[k]]}` : null) ?? `“${MEANINGS[k]}”`.replace(/“(food|wood|ore|tools|planks)”/, '$1')

/** The language log: dictionary changes, thinkers' guesses about words, generations ending. */
export function languageLog(changes: LexChange[], thoughts: Thought[], ends: { gen: number; understood: number }[]): LogLine[] {
  const out: LogLine[] = []
  for (const c of changes) {
    const town = TOWNS[c.town], m = meaningLabel(c.meaning)
    const by = c.by ? ` (${c.origin === 'misheard' ? `${c.by.split('·')[0]} misheard it` : `${c.by.split('·')[0]} made it up`})` : ''
    let text = ''
    if (c.atBirth) text = c.to ? `${town}'s children say “${c.to}” for ${m}${c.from ? ` (their parents said “${c.from}”)` : ''}` : `${town}'s children have no word for ${m} (their parents said “${c.from}”)`
    else if (c.kind === 'new') text = `${town} settles on “${c.to}” for ${m}${by}`
    else if (c.kind === 'spread') text = `“${c.to}” for ${m} spreads to ${town}${c.from ? `, replacing “${c.from}”` : ''}`
    else if (c.kind === 'replaced') text = `${town} switches from “${c.from}” to “${c.to}” for ${m}${by}`
    else text = `${town} loses its word for ${m} (“${c.from}”)`
    out.push({ key: `c${c.gen}-${c.day}-${c.town}-${c.meaning}`, gen: c.gen, day: c.atBirth ? 0 : c.day, kind: c.atBirth ? 'birth' : c.kind, text })
  }
  for (const t of thoughts) if (t.kind === 'linguist' && t.word) out.push({ key: `t${t.gen}-${t.day}-${t.key}-${t.word}`, gen: t.gen, day: t.day, kind: 'thought', who: t.key, text: `💭 ${t.name.split('·')[0]} wonders if “${t.word}” means ${t.meaning ?? 'something'}` })
  for (const e of ends) out.push({ key: `g${e.gen}`, gen: e.gen, day: 99, kind: 'generation', text: `Generation ${e.gen} ends. Listeners guessed right ${Math.round(e.understood * 100)}% of the time.` })
  // Newest first.
  return out.sort((a, b) => b.gen - a.gen || b.day - a.day)
}
