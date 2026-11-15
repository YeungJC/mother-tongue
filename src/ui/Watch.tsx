// Watch: the island playing, every exchange in order. Left: the language so far (each town's word
// for each meaning, as of last night). Right: who is winning, and why. Bottom: the exchange on
// screen, the language log, and the transport (generations, day, speed, live).
import { useMemo, useState } from 'react'
import { useGame } from '../store'
import { JOBS, TOWNS, castOf, type Speed, indexerUrl, jumpToGeneration, jumpToLive, resume, setSpeed, step, useTongue, voiceTable } from '../tongue'
import { type AgentNow, MEANINGS, agentsNow, coverage, dayRowAt, dictionaryAt, languageLog, leaderLine, understanding, upTo } from '../derive'
import { ExchangeCard, GoodIcon } from './Exchange'
import { play, stopAll } from '../audio'

const pct = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`)
/** "The same word, the same colour": tints of the validated chart palette, ink text. */
export const WORD_TINTS = [{ bg: '#cfe0f5', bd: '#2a78d6' }, { bg: '#f9d5c3', bd: '#eb6834' }, { bg: '#c6eadb', bd: '#1baf7a' }]
const OTHER_TINT = { bg: '#e9dfc6', bd: '#a89878' }
const ROWS = [0, 1, 2, 3, 4, 11, 12]
const NUMBERS = [6, 7, 8, 9, 10]
const NUMERAL: Record<string, string> = { two: '2', three: '3', four: '4', five: '5', six: '6' }

// ---------------------------------------------------------------- understanding, by generation
interface GenPoint { gen: number; rate: number; context: number }
/** Finished generations (research) plus the one on screen, so far. */
function useUnderstanding() {
  const research = useTongue((s) => s.research)
  const all = useTongue((s) => s.all)
  const idx = useTongue((s) => s.idx)
  const gen = useTongue((s) => s.gen)
  const rows: GenPoint[] = research?.emergence?.byGeneration ?? []
  const sofar = useMemo(() => understanding(upTo(all, idx)), [all, idx])
  const done = rows.find((r) => r.gen === gen)
  const prevCtx = [...rows].reverse().find((r) => r.gen < (gen ?? 0))?.context ?? NaN
  const now = { rate: sofar.rate, blind: Number.isFinite(sofar.blind) ? sofar.blind : done?.context ?? prevCtx, guesses: sofar.guesses }
  const line = gen && !done && Number.isFinite(sofar.rate) ? [...rows.filter((r) => r.gen < gen), { gen, rate: sofar.rate, context: now.blind }] : rows
  return { rows: line, gen: gen ?? 1, now }
}

function Sparkline({ rows, gen, w = 150, h = 34 }: { rows: GenPoint[]; gen: number; w?: number; h?: number }) {
  if (rows.length < 2) return null
  const g0 = rows[0].gen, g1 = rows[rows.length - 1].gen
  const X = (g: number) => 3 + ((g - g0) / (g1 - g0 || 1)) * (w - 6)
  const Y = (v: number) => h - 3 - v * (h - 6)
  const line = (f: (r: GenPoint) => number) => rows.filter((r) => Number.isFinite(f(r))).map((r, i) => `${i ? 'L' : 'M'}${X(r.gen).toFixed(1)},${Y(f(r)).toFixed(1)}`).join('')
  const cur = rows.find((r) => r.gen === gen)
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Guessed right, by generation (solid), against guessing without words (dashed)">
      <path d={line((r) => r.context)} fill="none" stroke="#a89878" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={line((r) => r.rate)} fill="none" stroke="#2f6f2a" strokeWidth={2} strokeLinejoin="round" />
      {cur && Number.isFinite(cur.rate) && <circle cx={X(cur.gen)} cy={Y(cur.rate)} r={4} fill="#2f6f2a" stroke="#f3e9cb" strokeWidth={2} />}
    </svg>
  )
}

// ---------------------------------------------------------------- left: the language so far
export function hearDrift(k: number, town: number) {
  void fetch(`${indexerUrl()}/drift?meaning=${k}&town=${town}`).then((r) => r.json()).then((rows: { gen: number; word: string | null; hash: string | null }[]) => {
    useTongue.getState().set({ listening: true }); useGame.setState({ muted: false }); stopAll()
    let prev = ''
    for (const r of rows) if (r.hash && r.word && r.word !== prev) { prev = r.word; play({ hash: r.hash, label: `${TOWNS[town]}, generation ${r.gen}`, text: r.word }, false, 40) }
  }).catch(() => {})
}

function Language() {
  const lexDays = useTongue((s) => s.lexDays)
  const prevLex = useTongue((s) => s.prevLex)
  const day = useTongue((s) => s.day)
  const gen = useTongue((s) => s.gen)
  const generations = useTongue((s) => s.generations)
  const [numbers, setNumbers] = useState(false)
  const { rows, now } = useUnderstanding()
  const dict = dictionaryAt(lexDays, prevLex, day)
  const dialect = dict.day?.dialect
  const cov = coverage(dialect)
  const recorded = generations.length > 0
  const row = (k: number) => {
    const cells = TOWNS.map((_, t) => dialect?.[t]?.[k] ?? null)
    const count = new Map<string, number>()
    for (const c of cells) if (c?.word) count.set(c.word, (count.get(c.word) ?? 0) + 1)
    const ranked = [...count].sort((a, b) => b[1] - a[1]).map(([w]) => w)
    const main = ranked[0]
    const tint = (w: string) => (count.get(w)! > 1 ? WORD_TINTS[ranked.filter((x) => count.get(x)! > 1).indexOf(w)] ?? OTHER_TINT : OTHER_TINT)
    const m = MEANINGS[k]
    return (
      <tr key={k}>
        <th scope="row">
          <span className="lx-m">{k < 5 ? <GoodIcon g={k} size={18} /> : NUMERAL[m] ? <b className="numeral">{NUMERAL[m]}</b> : null}{m}</span>
          {main && recorded && <button className="lx-hear" onClick={() => hearDrift(k, Math.max(0, cells.findIndex((c) => c?.word === main)))} title={`Hear how ${TOWNS[Math.max(0, cells.findIndex((c) => c?.word === main))]} has said “${m}”, generation by generation`} aria-label={`Hear the drift of the word for ${m}`}>▶</button>}
        </th>
        {cells.map((c, t) => {
          const col = c?.word ? tint(c.word) : null
          return (
            <td key={t}>
              {c?.word
                ? <span key={c.word} className="lx-word" style={{ background: col!.bg, borderColor: col!.bd }} title={`In ${TOWNS[t]}, ${pct(c.share)} of people say “${c.word}” for ${m}`}>{c.word}</span>
                : <span className="lx-none">no word yet</span>}
            </td>
          )
        })}
      </tr>
    )
  }
  return (
    <section className="card wpanel language-panel">
      <h2>The language so far</h2>
      <div className="lx-head">
        <div className="lx-num">
          <span className="u">Guessed right <b>{pct(now.rate)}</b></span>
          <span className="c">without words <b>{pct(now.blind)}</b></span>
        </div>
        <Sparkline rows={rows} gen={gen ?? 1} />
      </div>
      <p className="caption">How often listeners guess exactly what the speaker meant, this generation so far. The line shows each generation.</p>
      <table className="lexicon">
        <thead><tr><th />{TOWNS.map((t) => <th key={t} scope="col">{t}</th>)}</tr></thead>
        <tbody>
          {ROWS.slice(0, 5).map(row)}
          {ROWS.slice(5).map(row)}
          <tr className="lx-toggle"><th colSpan={5}><button className="linkish" onClick={() => setNumbers(!numbers)} aria-expanded={numbers}>{numbers ? '▾ hide the numbers' : '▸ show the numbers (two to six)'}</button></th></tr>
          {numbers && NUMBERS.map(row)}
        </tbody>
      </table>
      <p className="caption">{dialect
        ? <>Same colour in a row = same word. <b>{cov.everyTown} of {cov.of}</b> meanings {cov.everyTown === 1 ? 'has' : 'have'} a word in every town, and <b>{cov.shared}</b> {cov.shared === 1 ? 'is' : 'are'} shared by all four.{dict.inherited ? ' These are the words the last generation left behind.' : ''}</>
        : <>No words yet. On the first morning nobody has a word for anything. Each evening, the word each town uses most appears here.</>}</p>
    </section>
  )
}

// ---------------------------------------------------------------- right: who's winning, and why
const MIN_N = 3 // fewer than this and a percentage says more about luck than the agent
function Meter({ v, n, label }: { v: number; n: number; label: string }) {
  const ok = Number.isFinite(v) && n >= MIN_N
  return (
    <span className="wmeter" title={ok ? `${label}: ${pct(v)} (${n} tries)` : `${label}: not enough tries yet (${n})`}>{ok ? pct(v) : '–'}</span>
  )
}

function Winning() {
  const all = useTongue((s) => s.all)
  const idx = useTongue((s) => s.idx)
  const days = useTongue((s) => s.days)
  const day = useTongue((s) => s.day)
  const people = useTongue((s) => s.people)
  const st = useTongue((s) => s.state)
  const lifetime = useTongue((s) => s.lifetime)
  const select = useGame((s) => s.select)
  const row = dayRowAt(days, day)
  const lifetimes = useTongue((s) => s.lifetimes)
  const current = useMemo(() => castOf(lifetime, people, st, lifetimes), [people, lifetime, st, lifetimes])
  const agents = useMemo(() => agentsNow(upTo(all, idx), row, people, current), [all, idx, row, people, current])
  const ranked = [...agents].sort((a, b) => +b.alive - +a.alive || b.standing - a.standing || b.wealth - a.wealth)
  const maxS = Math.max(1, ...ranked.map((a) => a.standing))
  const line = leaderLine(ranked)
  const rowOf = (a: AgentNow) => (
    <li key={a.key} className={a.alive ? '' : 'dead'} onClick={() => select(a.key)} title={`${a.name}, a ${JOBS[a.job]} in ${TOWNS[a.home]}. Wealth ${a.wealth}, ${a.deals} trades so far. Click to see what it thinks words mean.`}>
      <span className="nm"><GoodIcon g={a.job} size={16} />{a.name}{a.thinker && <span title="uses AI reasoning (LLM)"> 💭</span>}{a.hunger > 0 && a.alive && <span className="hungry-mark" title={`${a.hunger} hungry day${a.hunger > 1 ? 's' : ''} in a row`}>!</span>}</span>
      <span className="sbar" title="Wealth compared with others in the same job (1.0× = average)">{!row ? <b>–</b> : a.alive ? <><i style={{ width: `calc((100% - 34px) * ${a.standing / maxS})` }} /><b>{a.standing.toFixed(1)}×</b></> : <b className="bad">starved</b>}</span>
      <Meter v={a.understood} n={a.made} label="Speaks clearly: listeners guessed its offers right" />
      <Meter v={a.understands} n={a.guessed} label="Listens well: it guessed others' offers right" />
    </li>
  )
  return (
    <section className="card wpanel winning-panel">
      <h2>Who's winning, and why</h2>
      <p className="headline">{line ?? (row ? 'Nobody is ahead yet.' : 'Day one. Everyone starts level.')}</p>
      <div className="wcols"><span>agent</span><span title="Wealth compared with others in the same job (1.0× = average)">wealth</span><span title="How often listeners guessed its offers right">speaks clearly</span><span title="How often it guessed others' offers right">listens well</span></div>
      <ol className="wlist">{ranked.map(rowOf)}</ol>
    </section>
  )
}

// ---------------------------------------------------------------- bottom: the exchange, the log
function NowExchange() {
  const t = useTongue((s) => s.current)
  const paused = useTongue((s) => s.paused)
  const listening = useTongue((s) => s.listening)
  const genCard = useTongue((s) => s.genCard)
  const idx = useTongue((s) => s.idx)
  const all = useTongue((s) => s.all)
  const set = useTongue((s) => s.set)
  if (genCard) return null
  if (!t) return <div className="card now-x empty"><p className="note">Waiting for the first offer of this generation…</p></div>
  const voices = () => { const on = !listening; set({ listening: on }); useGame.setState({ muted: !on }); stopAll(); if (on) voiceTable(t) }
  return (
    <div className={`card now-x ${t.result === 'understood' ? 'ok' : t.result === 'no deal' ? 'none' : 'mis'}`}>
      <ExchangeCard t={t} controls={
        <span className="now-controls">
          <button onClick={() => step(-1)} disabled={idx <= 0} aria-label="Previous exchange">◀</button>
          {paused ? <button onClick={resume} aria-label="Play">▶ play</button> : <button onClick={() => set({ paused: true })} aria-label="Pause">⏸</button>}
          <button onClick={() => step(1)} disabled={idx >= all.length - 1} aria-label="Next exchange">▶▶</button>
          {t.voice && <button className={listening ? 'on' : ''} onClick={voices} aria-pressed={listening} title="Hear the agents speak (ElevenLabs voices)">🔊 {listening ? 'voices on' : 'hear them'}</button>}
        </span>
      } />
    </div>
  )
}

function Log() {
  const lexDays = useTongue((s) => s.lexDays)
  const thoughts = useTongue((s) => s.lifeThoughts)
  const day = useTongue((s) => s.day)
  const gen = useTongue((s) => s.gen)
  const generations = useTongue((s) => s.generations)
  const lines = useMemo(() => {
    const changes = lexDays.filter((x) => x.day < day).flatMap((x) => x.changes)
    const ends = generations.filter((g) => g.gen < (gen ?? 0)).slice(-2).map((g) => ({ gen: g.gen, understood: g.understood }))
    return languageLog(changes, thoughts.filter((t) => t.day <= day), ends)
  }, [lexDays, thoughts, day, gen, generations])
  return (
    <section className="card lang-log">
      <h3>How the language is changing</h3>
      {lines.length ? <ul>{lines.slice(0, 40).map((l) => <li key={l.key} className={l.kind}><span className="sc">{l.day === 0 ? 'new generation' : l.day === 99 ? `generation ${l.gen}` : `day ${l.day}`}</span> {l.text}</li>)}</ul>
        : <p className="note">Nothing yet. Each evening, changes appear here when a town settles on a word, drops one or picks one up from another town.</p>}
    </section>
  )
}

// ---------------------------------------------------------------- bottom: the transport
function Transport() {
  const { rows, gen } = useUnderstanding()
  const st = useTongue((s) => s.state)
  const days = useTongue((s) => s.days)
  const day = useTongue((s) => s.day)
  const speed = useTongue((s) => s.speed)
  const paused = useTongue((s) => s.paused)
  const atLive = useTongue((s) => s.atLive)
  const set = useTongue((s) => s.set)
  const total = Math.max(20, ...days.map((d) => d.day))
  const events = dayRowAt(days, day + 1)?.events ?? []
  const w = 1000, h = 40
  const g0 = rows[0]?.gen ?? 1, g1 = Math.max(rows[rows.length - 1]?.gen ?? 1, gen)
  const X = (g: number) => 16 + ((g - g0) / (g1 - g0 || 1)) * (w - 32)
  const Y = (v: number) => h - 6 - Math.max(0, Math.min(1, (v - 0.2) / 0.7)) * (h - 12)
  const path = rows.filter((r) => Number.isFinite(r.rate)).map((r, i) => `${i ? 'L' : 'M'}${X(r.gen).toFixed(1)},${Y(r.rate).toFixed(1)}`).join('')
  return (
    <div className="card transport">
      <div className="tp-where">
        <b>Generation {gen}</b>
        <span className="tp-day"><span className="sc">day {day || 1} of {total}</span><span className="tp-bar"><i style={{ width: `${((day || 1) / total) * 100}%` }} /></span></span>
        {events.length > 0 && <span className="events">{events.map((e, i) => <span key={i} className="event now">{e.kind}{e.town ? ` in ${e.town}` : ''}</span>)}</span>}
      </div>
      <div className="tp-line">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="tl-svg" role="img" aria-label="Guessed right, by generation">
          <path d={path} fill="none" stroke="#2f6f2a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="tl-dots">
          {rows.map((r) => (
            <button key={r.gen} className={`tl-dot ${r.gen === gen ? 'on' : ''} ${r.rate >= 0.5 ? 'hi' : 'lo'}`} style={{ left: `${(X(r.gen) / w) * 100}%`, top: `${Y(r.rate) - 7}px` }}
              onClick={() => jumpToGeneration(r.gen)} title={`Generation ${r.gen}: guessed right ${pct(r.rate)}. Click to play from here.`}><span>{r.gen}</span></button>
          ))}
        </div>
        <span className="tp-cap sc">each dot is a generation. higher means more guesses were right. click one to play it</span>
      </div>
      <div className="tp-ctl">
        <div className="speeds" role="group" aria-label="Speed">
          {([1, 4, 16] as Speed[]).map((v) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)} aria-pressed={speed === v}>{v}×</button>)}
          {paused ? <button onClick={resume} aria-label="Play">▶</button> : <button onClick={() => set({ paused: true })} aria-label="Pause">⏸</button>}
        </div>
        {st?.live && <button className={`golive ${atLive ? 'on' : ''}`} onClick={jumpToLive} disabled={atLive}>{atLive ? '● live' : 'Jump to live'}</button>}
        <button className="help-btn" onClick={() => set({ help: !useTongue.getState().help })} aria-label="How to read this">?</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- between generations
function GenCardView() {
  const card = useTongue((s) => s.genCard)
  const generations = useTongue((s) => s.generations)
  const people = useTongue((s) => s.people)
  const history = useTongue((s) => s.history)
  if (!card) return null
  const { gen, lifetime } = card
  if (card.kind === 'start') {
    return (
      <div className="card gen-card start">
        <span className="kicker">Generation {gen}</span>
        <h2>12 agents, no shared words</h2>
        <p>They live in four towns. To eat, they have to trade, and to trade, they have to make themselves understood. Watch the word table on the left fill in and the <b>guessed right</b> number go up.</p>
      </div>
    )
  }
  const r = generations.find((x) => x.match === lifetime)
  const prev = generations.find((x) => x.gen === gen - 1)
  const lived = people.filter((p) => p.lived === lifetime)
  const parents = [...lived].filter((p) => (p.children ?? 0) > 0).sort((a, b) => (b.children ?? 0) - (a.children ?? 0))
  const changes: { town: string; meaning: string; from: string; to: string }[] = []
  if (r && prev) for (let t = 0; t < 4; t++) for (let k = 0; k < MEANINGS.length; k++) {
    if (k === 5) continue
    const a = prev.dialect[t]?.[k]?.word, b = r.dialect[t]?.[k]?.word
    if (a && b && a !== b) changes.push({ town: TOWNS[t], meaning: MEANINGS[k], from: a, to: b })
  }
  const h = history.find((x) => x.lifetime === lifetime)
  return (
    <div className="card gen-card">
      <span className="kicker">Generation {gen} is over</span>
      <h2>Guessed right <b>{r ? pct(r.understood) : '–'}</b>{r ? <small> (without words: {pct(r.contextOnly)})</small> : null}</h2>
      <ul>
        {parents[0] && <li>👶 <b>{parents[0].name}</b> had {parents[0].children} children{parents[1] ? <> and {parents[1].name} had {parents[1].children}</> : null}, because they were the wealthiest in their jobs</li>}
        {changes.slice(0, 2).map((c, i) => <li key={i}>✎ {c.town}'s word for {c.meaning} changed: <i>{c.from}</i> → <i>{c.to}</i></li>)}
        {r && <li>{r.deaths ? <>✝ {r.deaths} starved.</> : 'Nobody starved.'} {r.deals} trades, {r.exact} of them understood as meant.</li>}
      </ul>
      {h && <p className="historian-line">“{h.text}”</p>}
    </div>
  )
}

function Help() {
  const help = useTongue((s) => s.help)
  const set = useTongue((s) => s.set)
  if (!help) return null
  return (
    <div className="card help-card" role="dialog" aria-label="How to read this">
      <button className="close-btn" onClick={() => set({ help: false })} aria-label="Close">×</button>
      <div><span className="htw-icon pct">%</span><span><b>Guessed right</b> is how often a listener's first guess is exactly what the speaker meant. What they meant is locked on Solana before anyone answers, and checked afterwards. <b>Without words</b> is how often you'd be right just by looking at the goods on the table.</span></div>
      <div><span className="htw-icon ok">✓</span><span><b>Green means guessed right</b>, red means guessed wrong (they may still trade). Each card shows what's on the table, the words said, what the speaker meant, each listener's guess and how it ended.</span></div>
      <div><span className="htw-icon gl"><i>zuru</i><small>ore</small></span><span><b>The small word under each word</b> is what most people use it for. The agents never see this. They only learn from what changes hands.</span></div>
      <div><span className="htw-icon pct">·4</span><span><b>Wren·4</b> means Wren from generation 4. <b>1.8×</b> means 1.8 times the average wealth for that job. <b>!</b> means hungry, and <b>–</b> means not enough tries yet to tell.</span></div>
    </div>
  )
}

export default function Watch() {
  return (
    <>
      <Language />
      <Winning />
      <GenCardView />
      <div className="watch-bottom">
        <NowExchange />
        <Log />
      </div>
      <Transport />
      <Help />
    </>
  )
}
