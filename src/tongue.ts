// Mother Tongue in the viewer: the indexer's records → one player that plays every exchange of a
// lifetime in order, live or recorded alike. A live island's newest tables arrive over SSE and are
// appended; at the newest table the player waits for the next. A recorded island loops from
// generation 1. The player drives the island (figures, speech bubbles, camera) and every screen.

import { create } from 'zustand'
import { useGame } from './store'
import { BY_ID, SPOTS, type Look, type VillagerDef } from './world'
import { ROADS, along } from './terrain'
import { INDEXER } from './endpoints'
import { busy, play, stopAll } from './audio'

export const TOWNS = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere']
export const GOODS = ['food', 'wood', 'ore', 'tools', 'planks']
export const JOBS = ['farmer', 'woodcutter', 'miner', 'smith', 'carpenter']
const TRAVEL = [[0, 2, 2, 1], [2, 0, 3, 2], [2, 3, 0, 3], [1, 2, 3, 0]]
const TOWN_SPOTS = [SPOTS.market, SPOTS.oakhollow, SPOTS.ironcrag, SPOTS.saltmere]
const LOOK: Record<string, Look> = { farmer: 'farmer', woodcutter: 'lumberjack', miner: 'miner', smith: 'blacksmith', carpenter: 'builder' }

// ---------- wire types (mirror chain/client/server/indexer.ts) ----------
export interface Thought { match: number; gen: number; day: number; key: string; name: string; kind: 'plan' | 'linguist'; thought: string; word?: string; meaning?: string; sure?: number; focus?: string; travel?: string | null }
export interface Person { key: string; wallet: string; name: string; family: string; generation: number; home: number; job: number; parent: string | null; brain?: string; lived: number | null; place: number | null; score: number | null; survived: boolean | null; children?: number }
export interface TongueState {
  cluster: string; program: string; filesOnly: boolean; generation: number; lifetimes: number[]; current: Person[]; match: unknown
  /** A director is playing this island now (fresh heartbeat), where, and how fast. */
  live?: boolean; now?: { gen: number; day: number; tableMs: number; done: boolean } | null
  /** The market rule: chance a maker takes a bid that isn't what it asked for (null: unknown). */
  market?: number | null
}
export interface Voiced { hash: string; text: string }
export interface Bid { who: string; key: string; said: string; g: number; q: number; offered: string; tone?: string; voice?: Voiced | null }
export interface Round { bids: Bid[]; outcome: string; reaction: string; taken: string | null; tone?: string; voice?: Voiced | null }
export interface History { gen: number; lifetime: number; text: string; hash: string; facts: string[] }
export interface DayAgent { key: string; score: number; alive: boolean; hunger: number; inv: number[]; loc: number; dest: number; travelling: boolean; trades: number; builds: number }
export interface DayRow { match: number; gen: number; day: number; events: { kind: string; town: string | null }[]; agents: DayAgent[] }
export interface ChainStats { cluster: string; onChain: boolean; program: string; transactions: number; lifetimes: number; utterances: number; revealed: number; births: number; confirmMs: number | null }
export interface Table {
  /** Its line in the lifetime's talk file (the player's position). */
  i: number
  match: number; gen: number; day: number; town: number; table: number; maker: string; makerKey: string; makerHome: number
  give: number; giveQ: number; shows: string; said: string; intent: string; present: string[]; rounds: Round[]; result: string
  guesses: Record<string, [number, number][]>; meant: { good: string; qty: number } | null; revealed: boolean
  /** Context alone would have guessed right (1/0; null: nobody guessed; absent in old records). */
  blind?: number | null
  voice?: Voiced | null; tone?: string
  /** What the island took each spoken word to mean at the time (indexer; null = unsettled). */
  gloss?: (string | null)[]
}
export interface LexChange { day: number; gen: number; town: number; meaning: number; from: string | null; to: string | null; kind: 'new' | 'replaced' | 'spread' | 'lost'; by: string | null; origin: string | null; atBirth: boolean }
export interface LexDay { day: number; gen: number; dialect: ({ word: string; share: number } | null)[][]; known: number; withinTown: number; betweenTowns: number; living: number; changes: LexChange[] }
export interface GenRow { gen: number; match: number; market?: number; understood: number; contextOnly: number; deaths: number; deals: number; exact: number; dialect: LexDay['dialect']; ranking: { name: string; score: number; alive: boolean }[] }
export interface MindWord { word: string; means: { meaning: string; s: number }[]; heardIn: string[] }
export interface Mind { key: string; words: MindWord[]; remembered: number; history: { lifetime: number; day: number; tops: ([string, number] | null)[] }[]; meanings: string[] }
export interface GenCard { gen: number; lifetime: number; kind: 'start' | 'end' }
export type Page = 'intro' | 'watch' | 'agents' | 'findings'
export type Speed = 1 | 4 | 16

interface Tongue {
  state: TongueState | null
  people: Person[]
  research: any | null
  replication: any | null
  conditions: any | null
  /** The pre-declared confirmation tests (RESEARCH.md §10.3–10.4). */
  evidence: { confirm: any; confirm2: any } | null
  generations: GenRow[]
  history: History[]
  stats: ChainStats | null
  mind: Mind | null
  thoughts: Thought[]
  /** The indexer actually in use (falls back to the recorded island if the live one is down). */
  indexer: string
  connected: boolean
  page: Page
  // ---- the player
  lifetimes: number[]
  /** The lifetime on screen, its generation, and every table of it (live: so far). */
  lifetime: number | null
  gen: number | null
  all: Table[]
  /** The playhead: the table on screen (index into `all`). */
  idx: number
  speed: Speed
  paused: boolean
  /** Showing the newest table of a live island, waiting for the next. */
  atLive: boolean
  /** The day on screen, its day rows, its evenings' dictionaries, its thoughts. */
  day: number
  days: DayRow[]
  lexDays: LexDay[]
  /** The previous lifetime's last evening (the parents' words, for a lifetime's first day). */
  prevLex: LexDay | null
  lifeThoughts: Thought[]
  current: Table | null
  genCard: GenCard | null
  /** The people in the exchange on screen: only they get labels and full colour. */
  spot: string[]
  /** Voices on: tables play as little scenes; the historian speaks after each lifetime. */
  listening: boolean
  /** The camera follows each exchange to its town. */
  follow: boolean
  /** The three-line "how to read this" legend on the Watch screen. */
  help: boolean
  /** Presenter mode: 0 = off (everything shown); 1..PRESENT_STAGES = how many panels are revealed. */
  present: number
  set: (p: Partial<Tongue>) => void
}
export const useTongue = create<Tongue>((set) => ({
  state: null, people: [], research: null, replication: null, conditions: null, evidence: null, generations: [], history: [], stats: null, mind: null, thoughts: [],
  indexer: INDEXER, connected: false, page: 'intro',
  lifetimes: [], lifetime: null, gen: null, all: [], idx: -1, speed: 1, paused: false, atLive: false,
  day: 0, days: [], lexDays: [], prevLex: null, lifeThoughts: [], current: null, genCard: null, spot: [], listening: false, follow: true, help: false,
  present: new URLSearchParams(location.search).has('present') ? 1 : 0,
  set: (p) => set(p),
}))

/** The people of a lifetime: those who lived it, or (for the newest lifetime of an island still
 *  being played) the current generation, who have no finished life yet. */
export function castOf(lifetime: number | null, people: Person[], st: TongueState | null, lifetimes: number[]): Person[] {
  if (lifetime === null) return []
  const lived = people.filter((p) => p.lived === lifetime)
  if (lived.length || lifetime !== lifetimes[lifetimes.length - 1]) return lived
  const now = new Set(st?.current.map((c) => c.key) ?? [])
  return people.filter((p) => p.lived === null && now.has(p.key))
}
export const personOf = (key: string | null | undefined) => (key ? useTongue.getState().people.find((p) => p.key === key) : undefined)
export const nameOf = (key: string) => personOf(key)?.name ?? key.split('-').pop() ?? key
export const explorer = (kind: 'tx' | 'address', id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`

// ---------- people → figures on the island ----------
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
/** A family's colours: the tunic is the bloodline, the hat varies per person. */
const FAMILY = ['#7d8a4a', '#8e3a34', '#4f6b66', '#7a5a3a', '#c29a45', '#5b4a6e', '#3a5a7a', '#9a6a3a', '#6a7a3a', '#7a3a5a', '#3a6a5a', '#8a5a2a']
const HATS = ['#d9b24e', '#5e6b3a', '#8e3a34', '#4f6b66', '#3a322a', '#7a2e2a', '#c9a26b']

/** Each villager's own little patch of its town: a spot on a ring around the town centre. */
function ownSpot(town: number, seed: number): [number, number, number][] {
  const [cx, , cz] = TOWN_SPOTS[town][0]
  const angle = ((seed % 997) / 997) * Math.PI * 2
  const r = 1.4 + ((seed >> 10) % 100) / 100 * (town === 0 ? 1.2 : 2.6)
  const hx = cx + Math.cos(angle) * r, hz = cz + Math.sin(angle) * r
  return [0, 1, 2].map((k) => {
    const a = angle + k * 2.1 + ((seed >> (k * 4)) & 15) / 15
    return [hx + Math.cos(a) * 0.7, 0, hz + Math.sin(a) * 0.7] as [number, number, number]
  })
}
function travelRoute(loc: number, dest: number, arriveDay: number, day: number): [number, number, number][] {
  const lo = Math.min(loc, dest), hi = Math.max(loc, dest)
  let road = ROADS[`${lo}-${hi}`] ?? ROADS['0-1']
  if (loc > dest) road = [...road].reverse()
  const total = TRAVEL[loc][dest] || 1
  const t0 = Math.min(0.95, Math.max(0, 1 - Math.max(0.3, arriveDay - day) / total))
  return Array.from({ length: 15 }, (_, i) => { const [x, z] = along(road, t0 + ((1 - t0) * i) / 14); return [x, 0, z] as [number, number, number] })
}
function figure(p: { key: string; name: string; family: string; job: number }, town: number, prev: VillagerDef | undefined, travel?: [number, number, number][]): VillagerDef {
  const seed = hash(p.key)
  const route = travel ? (prev?.oneWay ? prev.route : travel) : ownSpot(town, seed)
  const same = prev && JSON.stringify(prev.route) === JSON.stringify(route)
  return {
    id: p.key, look: LOOK[JOBS[p.job]] ?? 'merchant', name: p.name, short: p.name, role: p.name, trait: `${JOBS[p.job]} of ${TOWNS[town]}, ${p.family}'s line`,
    tunic: FAMILY[hash(p.family) % FAMILY.length], hat: HATS[(seed >> 4) % HATS.length],
    route: same ? prev!.route : route, building: [0, 0, 0], oneWay: !!travel, speed: travel ? 1.2 : undefined,
  }
}

/** Who stands where on the day on screen: the evening before's positions (or, on a lifetime's
 *  first day, everyone at home). */
function placeFigures() {
  const t = useTongue.getState()
  const g = useGame.getState()
  const prev = new Map(g.villagers.map((v) => [v.id, v]))
  const row = t.days.filter((d) => d.day < (t.day || 1)).pop()
  const lifers = row ? null : castOf(t.lifetime, t.people, t.state, t.lifetimes)
  const villagers: VillagerDef[] = row
    ? row.agents.filter((a) => a.alive).map((a) => {
      const p = personOf(a.key) ?? { key: a.key, name: a.key, family: a.key, job: 0 }
      const road = a.travelling ? travelRoute(a.loc, a.dest, row.day + 1, row.day) : undefined
      return { ...figure(p, a.loc, prev.get(a.key), road), hungry: a.hunger, disc: true }
    })
    : (lifers?.length ? lifers : t.state?.current ?? []).map((p) => ({ ...figure(p, p.home, prev.get(p.key)), disc: true }))
  for (const k of Object.keys(BY_ID)) delete BY_ID[k]
  for (const v of villagers) BY_ID[v.id] = v
  g.setLive({ villagers })
}

/** A table as a little scene, in the speakers' own voices: maker, bids, reaction. */
export function voiceTable(t: Table) {
  const line = (key: string, name: string, v: Voiced | null | undefined, words: string) => v && play({ hash: v.hash, who: BY_ID[key] ? key : undefined, label: name, text: words }, false, 16)
  line(t.makerKey, t.maker, t.voice, t.said)
  for (const r of t.rounds) {
    for (const b of r.bids) line(b.key, b.who, b.voice, b.said)
    line(t.makerKey, t.maker, r.voice, r.reaction)
  }
}
export function sayHistory(h: History) { play({ hash: h.hash, label: 'The historian', text: h.text }, true) }

/** A spoken line: a bubble over the speaker (if on screen), in its invented words. */
function speak(key: string | null | undefined, words: string) {
  if (!key || !words || !BY_ID[key]) return
  useGame.getState().liveSay(key, words)
}

// ---------- loading ----------
const base = () => useTongue.getState().indexer
const get = (path: string) => fetch(`${base()}${path}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
export const indexerUrl = base
export async function loadMind(key: string) {
  const [mind, thoughts] = await Promise.all([get(`/mind/${encodeURIComponent(key)}`), get(`/thoughts?key=${encodeURIComponent(key)}&n=8`)])
  useTongue.getState().set({ mind, thoughts: thoughts ?? [] })
}
async function loadResearch() {
  const [research, replication, conditions, generations, stats, evidence] = await Promise.all(['/research', '/replication', '/conditions', '/generations', '/stats', '/evidence'].map(get))
  useTongue.getState().set({ research, replication, conditions, generations: generations ?? [], stats, evidence })
}
let researchAt = 0
/** At most every 3 s: a fast live island ends generations quicker than that. */
function researchSoon() {
  const wait = Math.max(0, researchAt + 3000 - Date.now())
  if (wait === 0) { researchAt = Date.now(); void loadResearch(); void loadPeople() } else if (wait > 0 && !researchTimer) researchTimer = setTimeout(() => { researchTimer = null; researchSoon() }, wait)
}
let researchTimer: ReturnType<typeof setTimeout> | null = null
const loadPeople = () => get('/people').then((p) => p && useTongue.getState().set({ people: p }))

// ---------- the player ----------
const STEP_MS = 1500 // per exchange at 1×
const CARD_MS = 4500 // a generation card at 1×
/** The live director's pause between tables, per player speed. */
// 16× is not 0: the director would race generations ahead of anyone watching.
export const TABLE_MS: Record<Speed, number> = { 1: 1200, 4: 300, 16: 80 }
let token = 0
/** Every lifetime's tables (finished lifetimes are fetched once; the live one grows). */
const talk = new Map<number, Table[]>()
const dayRows = new Map<number, DayRow[]>()
const lex = new Map<number, LexDay[]>()
const finished = (lifetime: number) => useTongue.getState().generations.some((g) => g.match === lifetime)
const isNewest = (lifetime: number) => { const ls = useTongue.getState().lifetimes; return lifetime === ls[ls.length - 1] }

async function loadLifetime(lifetime: number, fresh = false) {
  if (fresh || !talk.has(lifetime) || !finished(lifetime)) {
    const have = talk.get(lifetime) ?? []
    const t = await get(`/talk?lifetime=${lifetime}&from=${fresh ? 0 : have.length ? have[have.length - 1].i + 1 : 0}`)
    const rows = (t?.tables ?? []) as Table[]
    talk.set(lifetime, fresh ? rows : [...have, ...rows.filter((r) => !have.length || r.i > have[have.length - 1].i)])
  }
  const prevId = useTongue.getState().lifetimes.filter((x) => x < lifetime).pop()
  const [days, lx, prev, thoughts] = await Promise.all([
    dayRows.has(lifetime) && finished(lifetime) ? dayRows.get(lifetime) : get(`/days?lifetime=${lifetime}`),
    lex.has(lifetime) && finished(lifetime) ? { days: lex.get(lifetime) } : get(`/lexicon?lifetime=${lifetime}`),
    prevId === undefined ? null : lex.has(prevId) ? { days: lex.get(prevId) } : get(`/lexicon?lifetime=${prevId}`),
    get(`/thoughts?lifetime=${lifetime}&n=400`),
  ])
  dayRows.set(lifetime, days ?? [])
  lex.set(lifetime, lx?.days ?? [])
  if (prevId !== undefined && prev?.days) lex.set(prevId, prev.days)
  return { all: talk.get(lifetime)!, days: days ?? [], lexDays: lx?.days ?? [], prevLex: (prev?.days ?? []).slice(-1)[0] ?? null, thoughts: thoughts ?? [] }
}

/** Waits `ms` of unpaused time (and for voices, if listening). False if the player moved on.
 *  Counts wall-clock time, so throttled timers (a background tab) don't slow the island down. */
async function hold(my: number, ms: number) {
  let left = ms
  let last = performance.now()
  while (left > 0 || (useTongue.getState().listening && busy())) {
    await new Promise((r) => setTimeout(r, Math.min(100, Math.max(left, 20))))
    if (my !== token) return false
    const now = performance.now()
    if (!useTongue.getState().paused) left -= now - last
    last = now
  }
  return my === token
}

/** Puts one exchange on screen: the day's figures, spotlight, camera, speech. */
function show(t: Table, idx: number) {
  const s = useTongue.getState()
  const dayChanged = s.day !== t.day
  const spot = [t.makerKey, ...Object.keys(t.guesses ?? {}), ...t.rounds.flatMap((r) => r.bids.map((b) => b.key))]
  s.set({ idx, day: t.day, current: t, spot: [...new Set(spot)], atLive: !!s.state?.live && isNewest(t.match) && idx >= s.all.length - 1 && !finished(t.match) })
  if (dayChanged) placeFigures()
  const g = useGame.getState()
  if (s.follow && !g.selected && s.page === 'watch') useGame.setState({ lean: t.town, focus: 'island' })
  if (s.listening) { voiceTable(t); return }
  const k = 1 / s.speed
  if (s.speed >= 16) { speak(t.makerKey, t.said); return }
  speak(t.makerKey, t.said)
  t.rounds.forEach((r, n) => {
    r.bids.forEach((b, j) => setTimeout(() => speak(b.key, b.said), (500 + n * 900 + j * 250) * k))
    setTimeout(() => speak(t.makerKey, r.reaction), (900 + n * 900) * k)
  })
}

/** Plays from lifetime index `li`, table `from` (−1: the newest table, for "jump to live"). */
async function playFrom(li: number, from = 0) {
  const my = ++token
  stopAll()
  for (;;) {
    const ls = useTongue.getState().lifetimes
    if (!ls.length) return
    li = Math.max(0, Math.min(ls.length - 1, li))
    const lifetime = ls[li]
    const got = await loadLifetime(lifetime)
    if (my !== token) return
    const gen = got.all[0]?.gen ?? got.days[0]?.gen ?? useTongue.getState().generations.find((g) => g.match === lifetime)?.gen ?? li + 1
    let idx = from < 0 ? Math.max(0, got.all.length - 1) : Math.min(from, Math.max(0, got.all.length - 1))
    useTongue.getState().set({ lifetime, gen, all: got.all, days: got.days, lexDays: got.lexDays, prevLex: got.prevLex, lifeThoughts: got.thoughts, idx: -1, current: null, spot: [], day: got.all[idx]?.day ?? 1, genCard: null })
    placeFigures()
    if (li === 0 && from === 0) {
      useTongue.getState().set({ genCard: { gen, lifetime, kind: 'start' } })
      if (!(await hold(my, CARD_MS / Math.min(3, useTongue.getState().speed)))) return
      useTongue.getState().set({ genCard: null })
    }
    from = 0
    // Every exchange, in order. At the newest table of a live lifetime: wait for the next.
    for (;;) {
      const all = talk.get(lifetime) ?? []
      if (idx < all.length) {
        if (useTongue.getState().all !== all) useTongue.getState().set({ all, days: dayRows.get(lifetime) ?? [], lexDays: lex.get(lifetime) ?? [] })
        show(all[idx], idx)
        const s = useTongue.getState()
        // Following a live island and fallen behind it: catch up a little faster.
        const behind = all.length - 1 - idx
        const ms = (STEP_MS / s.speed) * (s.state?.live && isNewest(lifetime) && behind > 3 ? 0.5 : 1)
        if (!(await hold(my, ms))) return
        idx++
        continue
      }
      if (finished(lifetime) || !isNewest(lifetime) || !useTongue.getState().state?.live) {
        // A newer lifetime started while this one played its last tables: catch any stragglers.
        if (!finished(lifetime) && !isNewest(lifetime)) { await loadLifetime(lifetime); if ((talk.get(lifetime) ?? []).length > idx) continue }
        break
      }
      useTongue.getState().set({ atLive: true })
      if (!(await hold(my, 250))) return
    }
    // The generation is over (or its records end here): its card, then the next.
    useTongue.getState().set({ current: null, spot: [], atLive: false })
    if (finished(lifetime)) {
      useTongue.getState().set({ genCard: { gen, lifetime, kind: 'end' } })
      const h = useTongue.getState().history.find((x) => x.lifetime === lifetime)
      if (h && useTongue.getState().listening) sayHistory(h)
      if (!(await hold(my, CARD_MS / Math.min(3, useTongue.getState().speed)))) return
      useTongue.getState().set({ genCard: null })
    }
    const ls2 = useTongue.getState().lifetimes
    if (li < ls2.length - 1) { li++; continue }
    if (useTongue.getState().state?.live && !useTongue.getState().state?.now?.done) {
      // Live: the next lifetime hasn't begun yet; wait for it.
      while (useTongue.getState().lifetimes.length === ls2.length) { if (!(await hold(my, 500))) return }
      li++
      continue
    }
    li = 0 // a recording (or a finished live run): from the beginning again
  }
}

/** Jump to a generation (the timeline's dots). */
export function jumpToGeneration(gen: number) {
  const s = useTongue.getState()
  const row = s.generations.find((g) => g.gen === gen)
  const li = row ? s.lifetimes.indexOf(row.match) : gen - 1
  s.set({ paused: false })
  void playFrom(li < 0 ? gen - 1 : li, 0)
}
/** Jump to the newest table of a live island. */
export function jumpToLive() {
  const s = useTongue.getState()
  s.set({ paused: false })
  void playFrom(s.lifetimes.length - 1, -1)
}
/** Step the playhead (◀ ▶), pausing the player. */
export function step(d: number) {
  const s = useTongue.getState()
  const n = Math.max(0, Math.min(s.all.length - 1, s.idx + d))
  if (!s.all[n]) return
  s.set({ paused: true })
  show(s.all[n], n)
  resumeAt = { lifetime: s.lifetime, idx: n }
}
let resumeAt: { lifetime: number | null; idx: number } | null = null
/** Resume after stepping: play on from the exchange on screen. */
export function resume() {
  const s = useTongue.getState()
  s.set({ paused: false })
  if (resumeAt && resumeAt.lifetime === s.lifetime) { const li = s.lifetimes.indexOf(s.lifetime!); void playFrom(li, resumeAt.idx + 1) }
  resumeAt = null
}
/** Player speed; on a live island, the director keeps the same pace. */
export function setSpeed(speed: Speed) {
  const s = useTongue.getState()
  s.set({ speed })
  if (s.state?.live) void fetch(`${base()}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tableMs: TABLE_MS[speed] }) }).catch(() => {})
}

export function startTongue() {
  Object.assign(window, { __tongue: useTongue, __token: () => token }) // for debugging and the test driver
  const g = useGame.getState()
  g.setLive({ mode: 'live', villagers: [] })
  // Open on the whole island: every town sign (and its dialect) in view.
  if (!new URLSearchParams(location.search).has('view')) g.setFocus('island')
  for (const k of Object.keys(BY_ID)) delete BY_ID[k]
  const s = useTongue.getState()
  const q = new URLSearchParams(location.search)
  const page = q.get('page')
  if (page === 'intro' || page === 'watch' || page === 'agents' || page === 'findings') s.set({ page })
  if (q.has('speed')) { const v = Number(q.get('speed')); if (v === 1 || v === 4 || v === 16) s.set({ speed: v }) }
  // ?voices: start with the agents' voices on (as if "hear them" was clicked), e.g. for recordings.
  if (q.has('voices')) { s.set({ listening: true }); useGame.setState({ muted: false }) }
  // ?once: plain fetches, no open stream (headless screenshots).
  const once = q.has('once')
  let es: EventSource | null = null
  const onState = (st: TongueState | null) => {
    if (!st) return
    const ls = [...(st.lifetimes ?? [])].sort((a, b) => a - b)
    useTongue.getState().set({ state: st, lifetimes: ls })
  }
  const openStream = () => {
    es = new EventSource(`${base()}/stream`)
    es!.onopen = () => useTongue.getState().set({ connected: true })
    es!.onerror = () => useTongue.getState().set({ connected: false })
    const on = (type: string, fn: (d: any) => void) => es!.addEventListener(type, (m) => fn(JSON.parse((m as MessageEvent).data)))
    on('state', (st: TongueState) => onState(st))
    on('table', (t: Table) => {
      // Appended in order; a gap (a missed row) is filled from /talk on the next look.
      const have = talk.get(t.match)
      if (!have) return // fetched in full when the player reaches it
      const last = have[have.length - 1]
      if (!last || t.i === last.i + 1) talk.set(t.match, [...have, t])
      else if (t.i > last.i + 1) void loadLifetime(t.match)
    })
    on('day', (d: DayRow) => { dayRows.set(d.match, [...(dayRows.get(d.match) ?? []).filter((x) => x.day !== d.day), d]); if (useTongue.getState().lifetime === d.match) useTongue.getState().set({ days: dayRows.get(d.match)! }) })
    on('lexicon', (x: { lifetime: number; days: LexDay[] }) => { lex.set(x.lifetime, x.days); if (useTongue.getState().lifetime === x.lifetime) useTongue.getState().set({ lexDays: x.days }) })
    on('history', (h: History) => { const x = useTongue.getState(); x.set({ history: [...x.history, h].slice(-60) }) })
    on('generation', (g: GenRow) => { const x = useTongue.getState(); x.set({ generations: [...x.generations.filter((r) => r.match !== g.match), g] }); researchSoon() })
    on('birth', () => researchSoon())
    on('research', (research) => useTongue.getState().set({ research }))
    on('thought', (t: Thought) => {
      const x = useTongue.getState()
      if (x.lifetime === t.match) x.set({ lifeThoughts: [...x.lifeThoughts, t] })
      if (useGame.getState().selected === t.key) x.set({ thoughts: [...x.thoughts, t].slice(-8) })
    })
  }
  ;(async () => {
    // No indexer where we looked? Fall back to the default local one (./start.sh serves :8412).
    let st = await get('/state')
    if (!st && !q.has('indexer')) { s.set({ indexer: 'http://localhost:8412' }); st = await get('/state') }
    s.set({ connected: !!st })
    onState(st)
    await Promise.all([loadPeople(), loadResearch(), get('/history').then((h) => h && useTongue.getState().set({ history: h }))])
    if (!once) openStream() // only now: the fallback above may have changed which indexer to follow
    const ls = useTongue.getState().lifetimes
    if (!ls.length) return
    // Live: start at the newest table (?gen=N to start from a generation instead). Recorded: from generation 1.
    const gen = q.get('gen')
    if (gen) jumpToGeneration(Number(gen))
    else if (st?.live) jumpToLive()
    else void playFrom(0, 0)
  })().catch(() => s.set({ connected: false }))
  return () => { es?.close(); token++ }
}
