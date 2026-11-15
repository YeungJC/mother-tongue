// Agents: what makes an agent succeed? One computed sentence, then two charts (what predicts
// children on this island, and in which worlds being understood pays: RESEARCH.md §10), then every
// life, sortable. The agent card (any name, any screen) is here too.
import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../store'
import { JOBS, TOWNS, type Person, castOf, loadMind, personOf, useTongue } from '../tongue'
import { agentsNow, dayRowAt, dictionaryAt, upTo } from '../derive'
import { GoodIcon } from './Exchange'
import { Compare, type CompareRow, Ranked } from './charts'
import { play, stopAll } from '../audio'
import Interview from './Interview'

const pct = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`)

interface Driver { feature: string; label: string; kind: 'rank' | 'group'; children: { effect: number; p: number; n: number }; standing: { effect: number; p: number; n: number } }
interface RepDriver { feature: string; label: string; kind: 'rank' | 'group'; children: { positive?: number; negative?: number; significant?: number; islands: number; meanEffect: number } }
/** A world from RESEARCH.md §10, run on the confirmation islands (older data: a market rule, `flex`). */
export interface Condition { id?: string; flex?: number; label: string; rule?: string; mine?: boolean; islands: number; gens: number; survived: number; understoodLate: number; clarity: { k: number; of: number; meanRho: number; positive?: number }; comprehension: { k: number; of: number; meanRho: number }; deathsPerGen: number; misunderstoodDeals: number; clarityHalves: { top: number; bottom: number }; drivers: RepDriver[] }

/** The replication condition matching this island's market (or the lenient one, if unknown). */
export function useCondition() {
  const conditions: Condition[] = useTongue((s) => s.conditions)?.conditions ?? []
  const market = useTongue((s) => s.state?.market)
  return { conditions, mine: conditions.find((c) => c.mine) ?? conditions.find((c) => c.flex === market) ?? null, market }
}

/** "holds on k of N islands" for a driver, in its own direction (null if the replication
 *  islands couldn't test it, e.g. thinkers on habit-only islands). */
const holds = (d: RepDriver | undefined, sign: number) => {
  if (!d || d.children.meanEffect === null || !Number.isFinite(d.children.meanEffect)) return null
  const k = d.kind === 'group' ? d.children.significant ?? 0 : sign >= 0 ? d.children.positive ?? 0 : d.children.negative ?? 0
  return { k, of: d.children.islands }
}

// ---------------------------------------------------------------- what successful agents share
// Every chart here compares average children between two groups of agents (e.g. the half who
// traded most against the half who traded least). Correlations stay in the research files.
type LifeRec = { children: number; brain: string; tables: number; guesses: number; [k: string]: any }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const avgKids = (g: LifeRec[]) => mean(g.map((x) => x.children))
const kids = (v: number) => v.toFixed(1)

/** Splits lives at the median of a feature, keeping ties together, into more and less of it. */
function split(rows: LifeRec[], f: string) {
  const vals = rows.map((x) => x[f] as number).sort((a, b) => a - b)
  const cut = vals[Math.floor((vals.length - 1) / 2)]
  let hi = rows.filter((x) => x[f] > cut), lo = rows.filter((x) => x[f] <= cut), inclusive = false
  if (hi.length < rows.length * 0.25) { hi = rows.filter((x) => x[f] >= cut); lo = rows.filter((x) => x[f] < cut); inclusive = true }
  return { hi, lo, cut, inclusive }
}
/** Group names for a count: "6+ trades" against "0–5 trades". */
const counted = (unit: string) => (c: number, inc: boolean): [string, string] => {
  const top = inc ? c : c + 1
  return [`${top}+ ${unit}`, top - 1 <= 0 ? `no ${unit}` : `0–${top - 1} ${unit}`]
}
interface Factor { feature: string; label: string; sub?: string; eligible?: (x: LifeRec) => boolean; groups?: (cut: number, inclusive: boolean) => [string, string] }
const FACTORS: Factor[] = [
  { feature: 'hungryDays', label: 'Going hungry', groups: (c, inc) => (c === 0 && !inc ? ['went hungry', 'never hungry'] : counted('hungry days')(c, inc)) },
  { feature: 'trips', label: 'Travelling', sub: 'trips to other towns', groups: counted('trips') },
  { feature: 'trades', label: 'Trading', sub: 'trades made in its life', groups: counted('trades') },
  { feature: 'clarity', label: 'Speaking clearly', sub: 'how often listeners guessed its offers right', eligible: (x) => x.tables >= 3, groups: () => ['clearer half', 'less clear half'] },
  { feature: 'comprehension', label: 'Listening well', sub: "how often it guessed others' offers right", eligible: (x) => x.guesses >= 3, groups: () => ['better half', 'worse half'] },
  { feature: 'greed', label: 'Greed', groups: () => ['greedier half', 'less greedy half'] },
  { feature: 'inheritedWords', label: 'Words inherited', groups: counted('words') },
  { feature: 'thinker', label: 'AI reasoning' },
]

function Shared() {
  const r = useTongue((s) => s.research)
  const { mine } = useCondition()
  const rows: LifeRec[] = r?.selection?.rows ?? []
  const drivers: Driver[] = r?.drivers ?? []
  if (!rows.length) return <p className="note">No finished lives to compare yet.</p>
  const built = FACTORS.flatMap((f) => {
    const pool = rows.filter(f.eligible ?? (() => true))
    let a: CompareRow['a'], b: CompareRow['b']
    if (f.feature === 'thinker') {
      const t = pool.filter((x) => x.brain === 'thinker'), h = pool.filter((x) => x.brain !== 'thinker')
      if (!t.length || !h.length) return []
      a = { label: 'AI reasoning (LLM)', value: avgKids(t), n: t.length }; b = { label: 'simple rules', value: avgKids(h), n: h.length }
    } else {
      const s = split(pool, f.feature)
      if (!s.hi.length || !s.lo.length) return []
      const [hl, ll] = f.groups!(s.cut, s.inclusive)
      a = { label: hl, value: avgKids(s.hi), n: s.hi.length }; b = { label: ll, value: avgKids(s.lo), n: s.lo.length }
    }
    const d = drivers.find((x) => x.feature === f.feature)
    const h = d ? holds(mine?.drivers.find((x) => x.feature === f.feature), d.children.effect) : null
    return [{ row: { key: f.feature, label: f.label, sub: f.sub, a, b, note: h ? `${h.k} of ${h.of}` : undefined } as CompareRow, real: !!d && d.children.p < 0.05, gap: Math.abs(a.value - b.value) }]
  })
  const real = built.filter((x) => x.real).sort((x, y) => y.gap - x.gap)
  const weak = built.filter((x) => !x.real)
  return (
    <>
      <Compare rows={real.map((x) => x.row)} unit="average children" noteHead={mine ? 'new islands' : undefined} format={kids} />
      {weak.length > 0 && <p className="minor">Made little difference: {weak.map((x) => x.row.label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())).join(', ')}.</p>}
    </>
  )
}

const WORLD: Record<string, string> = { neither: 'Neither rule', "need each other's goods": "Need each other's goods", 'one try per offer': 'One try per offer', both: 'Both rules' }
/** Clear speakers against unclear ones, in average children, under each set of rules. */
export function WorldsChart() {
  const { conditions } = useCondition()
  if (!conditions.length || !conditions[0].id) return <p className="note">The four sets of rules haven't been run yet (lab/confirm.ts).</p>
  return (
    <Compare fixed unit="average children" noteHead="clear link" format={kids}
      rows={conditions.map((c) => ({ key: c.id ?? c.label, label: WORLD[c.label] ?? c.label, sub: c.mine ? 'this island' : undefined, a: { label: 'clearer half', value: c.clarityHalves.top }, b: { label: 'less clear half', value: c.clarityHalves.bottom }, note: `${c.clarity.k} of ${c.clarity.of}` }))} />
  )
}

function TalkPays() {
  const { conditions } = useCondition()
  if (!conditions.length || !conditions[0].id) return <p className="note">The four sets of rules haven't been run yet (lab/confirm.ts).</p>
  return (
    <>
      <p className="takeaway">We tested four sets of rules, on {conditions[0].islands} new islands each. Clear speakers only came out ahead when both rules were on: agents <b>need each other's goods</b> (a smith needs ore to make tools), and a misread offer is a <b>lost trade</b>.</p>
      <div className="ag-panel"><WorldsChart /></div>
      <p className="minor">"Clear link" counts the islands where the pattern was too strong to be chance.</p>
    </>
  )
}

function JobAndTown() {
  const r = useTongue((s) => s.research)
  const rows: LifeRec[] = r?.selection?.rows ?? []
  if (!rows.length) return null
  const by = (key: 'job' | 'home', names: string[]) => names.map((name, i) => { const g = rows.filter((x) => x[key] === i); return { label: name, value: avgKids(g), n: g.length } }).filter((x) => x.n > 0).sort((a, b) => b.value - a.value)
  const jobs = by('job', JOBS.map((j) => `${j}s`)), towns = by('home', TOWNS)
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  return (
    <section className="ag-jobtown">
      <h2>Job and home town matter a lot too</h2>
      <p className="takeaway">{cap(jobs[0].label)} average {kids(jobs[0].value)} children, {jobs[jobs.length - 1].label} {kids(jobs[jobs.length - 1].value)}. Agents from {towns[0].label} average {kids(towns[0].value)}, those from {towns[towns.length - 1].label} {kids(towns[towns.length - 1].value)}.</p>
      <div className="ag-charts small">
        <div className="ag-panel"><h3 className="sc">Average children, by job</h3><Ranked rows={jobs} unit="average children" format={kids} /></div>
        <div className="ag-panel"><h3 className="sc">Average children, by home town</h3><Ranked rows={towns} unit="average children" format={kids} /></div>
      </div>
    </section>
  )
}


// ---------------------------------------------------------------- every life
type Col = 'name' | 'gen' | 'job' | 'home' | 'mind' | 'standing' | 'children' | 'clarity' | 'comprehension' | 'inherited' | 'trades'
interface LifeRow { key: string; name: string; gen: number; job: number; home: number; mind: string; standing: number; children: number | null; clarity: number; comprehension: number; inherited: number | null; trades: number; alive: boolean; living: boolean; madeN: number; guessN: number }
const MIN_N = 3 // fewer tries than this and a percentage says more about luck than the agent
const COLS: [Col, string, string][] = [
  ['name', 'name', ''], ['gen', 'gen', 'generation'], ['job', 'job', ''], ['home', 'town', ''], ['mind', 'type', 'rule-based, or AI reasoning (LLM)'],
  ['standing', 'wealth', 'wealth compared with others in the same job (1.0× = average)'], ['children', 'children', ''],
  ['clarity', 'speaks clearly', 'how often listeners guessed its offers right'], ['comprehension', 'listens well', 'how often it guessed others\' offers right'],
  ['inherited', 'words inherited', 'words it was born knowing (founders: none)'], ['trades', 'trades', 'trades made in its life'],
]

function Lives() {
  const r = useTongue((s) => s.research)
  const gen = useTongue((s) => s.gen)
  const lifetime = useTongue((s) => s.lifetime)
  const all = useTongue((s) => s.all)
  const idx = useTongue((s) => s.idx)
  const days = useTongue((s) => s.days)
  const day = useTongue((s) => s.day)
  const people = useTongue((s) => s.people)
  const st = useTongue((s) => s.state)
  const select = useGame((s) => s.select)
  const [which, setWhich] = useState<'screen' | 'all'>('screen')
  const [sort, setSort] = useState<{ col: Col; dir: number }>({ col: 'children', dir: -1 })
  const finished: LifeRow[] = useMemo(() => (r?.selection?.rows ?? []).map((x: any) => ({ key: x.key, name: x.name, gen: x.gen, job: x.job, home: x.home, mind: x.brain, standing: x.standing, children: x.children, clarity: x.clarity, comprehension: x.comprehension, inherited: x.inheritedWords ?? null, trades: x.trades, alive: x.survived, living: false, madeN: x.tables, guessN: x.guesses })), [r])
  // The generation on screen, if it isn't over: its agents so far.
  const living: LifeRow[] = useMemo(() => {
    if (finished.some((x) => x.gen === gen)) return []
    const current = castOf(lifetime, people, st, useTongue.getState().lifetimes)
    return agentsNow(upTo(all, idx), dayRowAt(days, day), people, current).map((a) => ({ key: a.key, name: a.name, gen: gen ?? 0, job: a.job, home: a.home, mind: a.thinker ? 'thinker' : 'habit', standing: a.standing, children: null, clarity: a.understood, comprehension: a.understands, inherited: null, trades: a.deals, alive: a.alive, living: true, madeN: a.made, guessN: a.guessed }))
  }, [finished, gen, people, lifetime, st, all, idx, days, day])
  const rows = [...(which === 'screen' ? [...finished.filter((x) => x.gen === gen), ...living] : [...finished, ...living])]
  const val = (x: LifeRow) => { const v = x[sort.col === 'job' ? 'job' : sort.col]; return v === null || (typeof v === 'number' && !Number.isFinite(v)) ? -Infinity : v }
  rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? String(x).localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir || a.name.localeCompare(b.name) })
  const cell = (x: LifeRow, c: Col) => {
    switch (c) {
      case 'name': return <><button className="linkish name-link" onClick={() => select(x.key)}>{x.name}</button>{!x.alive && <small className="bad"> starved</small>}</>
      case 'job': return <><GoodIcon g={x.job} size={15} /> {JOBS[x.job]}</>
      case 'home': return TOWNS[x.home]
      case 'mind': return x.mind === 'thinker' ? '💭 AI (LLM)' : 'rules'
      case 'standing': return x.alive ? `${x.standing.toFixed(2)}×` : '0'
      case 'children': return x.children === null ? <small>not yet</small> : x.children
      case 'clarity': return x.madeN >= MIN_N ? pct(x.clarity) : '–'
      case 'comprehension': return x.guessN >= MIN_N ? pct(x.comprehension) : '–'
      case 'inherited': return x.inherited === null ? '–' : x.inherited
      case 'trades': return x.trades
      default: return String(x[c])
    }
  }
  return (
    <section className="lives">
      <header>
        <h2>Every life</h2>
        <div className="tabs small">
          <button className={`tab ${which === 'screen' ? 'on' : ''}`} onClick={() => setWhich('screen')}>generation {gen ?? '–'} (on screen)</button>
          <button className={`tab ${which === 'all' ? 'on' : ''}`} onClick={() => setWhich('all')}>all {finished.length + living.length} lives</button>
        </div>
      </header>
      <p className="caption">Sorted by {COLS.find((c) => c[0] === sort.col)?.[1]}. Click a column to sort, or a name to open that agent.{living.length ? ` Generation ${gen} is still alive, so its numbers are only so far (– means fewer than 3 tries).` : ''}</p>
      {rows.length ? (
        <div className="scroll lives-scroll">
          <table className="lives-t">
            <thead><tr>{COLS.map(([c, l, t]) => <th key={c} title={t || undefined} className={sort.col === c ? 'on' : ''} onClick={() => setSort({ col: c, dir: sort.col === c ? -sort.dir : c === 'name' || c === 'gen' ? 1 : -1 })}>{l}{sort.col === c ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
            <tbody>{rows.map((x) => <tr key={x.key} className={`${x.alive ? '' : 'dead'} ${x.living ? 'living' : ''}`}>{COLS.map(([c]) => <td key={c}>{cell(x, c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="note">No lives here yet.</p>}
    </section>
  )
}

export default function Agents() {
  const r = useTongue((s) => s.research)
  const lives: number = r?.selection?.lives ?? 0
  return (
    <div className="page card agents-page">
      <header className="ag-head">
        <span className="kicker">Agents</span>
        <h1>What makes an agent succeed?</h1>
        <p className="lead">{!r ? 'Loading…' : !lives ? 'No agent has finished its life yet. The first answers come when generation 1 ends.'
          : `Success here means children. The wealthiest agents in each job have the most, and their children inherit their words. These charts compare the ${lives} agents who have finished their lives on this island.`}</p>
      </header>
      <div className="ag-charts">
        <section>
          <h2>What successful agents had in common</h2>
          <p className="takeaway">Each row splits the agents into two groups and compares their average number of children. "New islands" shows how many of 8 separate test islands had the same result.</p>
          <div className="ag-panel"><Shared /></div>
        </section>
        <section><h2>Does speaking clearly pay?</h2><TalkPays /></section>
      </div>
      <JobAndTown />
      <Lives />
    </div>
  )
}

// ---------------------------------------------------------------- the agent card
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

/** One sentence about a life, from its own numbers. */
function lifeLine(p: Person, done: any | undefined, now: ReturnType<typeof agentsNow>[number] | undefined) {
  const job = JOBS[p.job]
  if (done) {
    const kids = `${done.children} ${done.children === 1 ? 'child' : 'children'}`
    const fate = done.survived ? `It ended with ${done.standing.toFixed(1)}× the average ${job}'s wealth, ranked ${ord((p.place ?? 0) + 1)} among ${job}s, and had ${kids}.` : `It starved, and had ${kids}.`
    const talk = Number.isFinite(done.clarity) ? ` Listeners guessed its offers right ${pct(done.clarity)} of the time, and it guessed theirs right ${pct(done.comprehension)}.` : ''
    return `Lived in generation ${p.generation} as a ${job} in ${TOWNS[p.home]} and made ${done.trades} trades.${talk} ${fate}`
  }
  if (now) {
    if (!now.alive) return `A ${job} in ${TOWNS[p.home]}, generation ${p.generation}. It starved.`
    return `A ${job} in ${TOWNS[p.home]}, generation ${p.generation}, alive now. It has ${now.standing.toFixed(1)}× the average ${job}'s wealth and ${now.deals} trades so far.${now.made ? ` Listeners have guessed its offers right ${pct(now.understood)} of the time (${now.made} offers).` : ''}`
  }
  return `A ${job} in ${TOWNS[p.home]}, generation ${p.generation}.${p.lived === null ? ' Not born yet at this point in the replay.' : ''}`
}

export function AgentCard() {
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const mind = useTongue((s) => s.mind)
  const thoughts = useTongue((s) => s.thoughts)
  const people = useTongue((s) => s.people)
  const research = useTongue((s) => s.research)
  const lifetime = useTongue((s) => s.lifetime)
  const all = useTongue((s) => s.all)
  const idx = useTongue((s) => s.idx)
  const days = useTongue((s) => s.days)
  const day = useTongue((s) => s.day)
  const lexDays = useTongue((s) => s.lexDays)
  const prevLex = useTongue((s) => s.prevLex)
  const generations = useTongue((s) => s.generations)
  const st = useTongue((s) => s.state)
  const [talking, setTalking] = useState(false)
  useEffect(() => { if (selected) void loadMind(selected); setTalking(false) }, [selected])
  if (!selected) return null
  const p = personOf(selected)
  if (!p) return null
  const parent = p.parent ? personOf(p.parent) : null
  const kids = people.filter((x) => x.parent === p.key)
  const done = (research?.selection?.rows ?? []).find((x: any) => x.key === p.key)
  const onScreen = castOf(lifetime, people, st ?? null, useTongue.getState().lifetimes).some((x) => x.key === p.key)
  const row = onScreen ? dayRowAt(days, day) : null
  const now = onScreen ? agentsNow(upTo(all, idx), row, people, [p]).find((a) => a.key === p.key) : undefined
  const holding = row?.agents.find((a) => a.key === p.key)
  // The town's words: at the playhead if it is living on screen, else at the end of its generation.
  const dialect = onScreen ? dictionaryAt(lexDays, prevLex, day).day?.dialect : generations.find((g) => g.gen === p.generation)?.dialect
  const MEANING = ['food', 'wood', 'ore', 'tools', 'planks', 'one', 'two', 'three', 'four', 'five', 'six', 'yes', 'no']
  const townWord = (meaning: string) => dialect?.[p.home]?.[MEANING.indexOf(meaning)]?.word
  const voiced = all.filter((t) => t.makerKey === p.key && t.voice).pop()
  const hear = () => { if (!voiced?.voice) return; useGame.setState({ muted: false }); stopAll(); play({ hash: voiced.voice.hash, who: p.key, label: p.name, text: voiced.said }, true) }
  return (
    <aside className="card agent-card">
      <header>
        <div>
          <h2>{p.name}</h2>
          <span className="sc">{JOBS[p.job]} in {TOWNS[p.home]} · generation {p.generation} · {p.family}'s family · {p.brain === 'thinker' ? '💭 AI reasoning (LLM)' : 'rule-based'}</span>
        </div>
        <button className="close-btn" onClick={() => select(null)} aria-label="Close">×</button>
      </header>
      <p className="life-line">{lifeLine(p, done, now)}</p>
      {holding && <div className="holdings">{['food', 'wood', 'ore', 'tools', 'planks'].map((g, i) => <span key={g} title={g}><GoodIcon g={i} size={15} /><b>{holding.inv[i]}</b></span>)}<span title="wealth: the total value of its goods">wealth <b>{holding.score}</b></span></div>}
      <p className="sc family">{parent ? <>child of <button className="linkish" onClick={() => select(parent.key)}>{parent.name}</button></> : 'a founder'}{kids.length ? <> · children: {kids.map((k, i) => <span key={k.key}>{i ? ', ' : ''}<button className="linkish" onClick={() => select(k.key)}>{k.name}</button></span>)}</> : null}</p>
      {thoughts.length > 0 && <div className="thoughts">{thoughts.slice(-3).map((t, i) => <p key={i}><span className="sc">day {t.day} · {t.kind === 'plan' ? 'plans' : `wonders about “${t.word}”`}</span> {t.thought}</p>)}</div>}
      <h3>What {p.name.split('·')[0]} thinks words mean</h3>
      <p className="caption">Its own private dictionary, which no other agent can see{mind ? `, built from ${mind.remembered} moments it remembers` : ''}. Where its town uses a different word, that's marked.</p>
      <div className="scroll">
        {(mind?.words ?? []).slice(0, 24).map((w) => {
          const top = w.means[0]
          const theirs = townWord(top.meaning)
          return (
            <div className="belief" key={w.word}>
              <span className="w">{w.word}</span>
              <span className="m">{top.meaning}{w.means[1] && w.means[1].s > 0.2 && <small> or {w.means[1].meaning}?</small>}</span>
              <span className="bar" title={`${Math.round(top.s * 100)}% sure`}><div style={{ width: `${Math.round(top.s * 100)}%` }} /></span>
              {theirs && theirs !== w.word && top.s > 0.3 && <small className="odd">{TOWNS[p.home]} says “{theirs}” for {top.meaning}</small>}
            </div>
          )
        })}
        {mind && !mind.words.length && <p className="note">No words yet.</p>}
        {!mind && <p className="note">Loading…</p>}
      </div>
      <div className="extras">
        {talking ? <Interview agent={selected} name={p.name} onClose={() => setTalking(false)} /> : <button className="chip" onClick={() => setTalking(true)} title="Talk to it out loud (ElevenLabs). It answers only from what it saw and did.">🎙 Interview</button>}
        {voiced && !talking && <button className="chip" onClick={hear} title={`Its last offer on screen: “${voiced.said}”`}>🔊 hear it speak</button>}
      </div>
    </aside>
  )
}
