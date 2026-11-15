// One exchange at a table, told in three beats instead of sentences (the Watch screen's card):
//   1. what's on the table and the words said, with an interlinear gloss (what the island takes
//      each word to mean that generation) and what the speaker really meant (sealed on-chain);
//   2. one chip per listener: what it thought was meant, and what it offered;
//   3. the result: understood, misunderstood (deal anyway), or no deal.
// Goods are drawn as small ink glyphs, one per good, used everywhere.
import type { ReactNode } from 'react'
import { useGame } from '../store'
import { GOODS, TOWNS, type Table, nameOf } from '../tongue'

// ---------------------------------------------------------------- goods, as ink glyphs
const INK = '#2b2118'
const GLYPH: Record<string, ReactNode> = {
  food: (
    <g>
      <path d="M10 18.5V6" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {[5, 8.5, 12].map((y) => <g key={y}><ellipse cx={7.6} cy={y} rx={2.2} ry={1.3} transform={`rotate(-35 7.6 ${y})`} fill="#e3b94f" stroke={INK} strokeWidth={1} /><ellipse cx={12.4} cy={y} rx={2.2} ry={1.3} transform={`rotate(35 12.4 ${y})`} fill="#e3b94f" stroke={INK} strokeWidth={1} /></g>)}
      <ellipse cx={10} cy={2.8} rx={1.2} ry={2} fill="#e3b94f" stroke={INK} strokeWidth={1} />
    </g>
  ),
  wood: (
    <g>
      <path d="M4 7.5h11a3 3.5 0 0 1 0 7H4z" fill="#a8743f" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <ellipse cx={4} cy={11} rx={2.6} ry={3.5} fill="#e2c38f" stroke={INK} strokeWidth={1.3} />
      <ellipse cx={4} cy={11} rx={1.1} ry={1.6} fill="none" stroke={INK} strokeWidth={0.8} />
      <path d="M8 9.5h5M9 12.5h4" stroke={INK} strokeWidth={0.8} strokeLinecap="round" />
    </g>
  ),
  ore: (
    <g>
      <path d="M3 14.5 5.5 7.5l5-3 5.5 2.5 1.5 6-4 3.5H6z" fill="#8f9399" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M5.5 7.5l4.5 3 6-3.5M10 10.5V16" stroke={INK} strokeWidth={0.9} fill="none" />
      <path d="M12 7.5l1.5-1" stroke="#f3e9cb" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  ),
  tools: (
    <g>
      <path d="M5 17.5 12.5 8" stroke="#a8743f" strokeWidth={2.6} strokeLinecap="round" />
      <path d="M5 17.5 12.5 8" stroke={INK} strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
      <path d="M9.2 5.2 13 2.4l4.6 3.9-2.6 3.6z" fill="#6f7378" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
    </g>
  ),
  planks: (
    <g>
      {[13, 9.2, 5.4].map((y, i) => <rect key={y} x={2.5 + i * 0.8} y={y} width={14.5} height={3.2} rx={0.6} fill={i === 1 ? '#d8b27a' : '#c99b5e'} stroke={INK} strokeWidth={1.1} />)}
      <path d="M6 14.6h3M11 10.8h3M7 7h3" stroke={INK} strokeWidth={0.7} strokeLinecap="round" />
    </g>
  ),
}

/** One good, drawn. `g` is the good's index or its name. */
export function GoodIcon({ g, size = 18 }: { g: number | string; size?: number }) {
  const name = typeof g === 'number' ? GOODS[g] : g
  return (
    <svg className="good-icon" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={name}>
      <title>{name}</title>
      {GLYPH[name] ?? <circle cx={10} cy={10} r={6} fill="none" stroke={INK} />}
    </svg>
  )
}
/** A quantity of a good: "3" and its glyph. */
export function Qty({ g, q, size }: { g: number | string; q: number; size?: number }) {
  const name = typeof g === 'number' ? GOODS[g] : g
  return <span className="qty" title={`${q} ${name}`}><b>{q}</b><GoodIcon g={name} size={size} /></span>
}

const NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' }
/** A gloss, readable at a glance: a glyph for a good, a digit for a number, yes/no as words. */
export function Gloss({ m }: { m: string | null | undefined }) {
  if (!m) return <span className="gl unknown" title="no settled meaning yet">?</span>
  if (GOODS.includes(m)) return <span className="gl"><GoodIcon g={m} size={15} />{m}</span>
  if (NUMBERS[m]) return <span className="gl num">{NUMBERS[m]}</span>
  return <span className="gl">{m}</span>
}

// ---------------------------------------------------------------- reading a table
export type Result = 'ok' | 'mis' | 'none'
export const resultOf = (t: Table): Result => (t.result === 'understood' ? 'ok' : t.result === 'no deal' ? 'none' : 'mis')
const GOOD_IX = (name: string) => GOODS.indexOf(name)

export interface Listener { key: string; name: string; g: number; q: number; ok: boolean; bid: { g: number; q: number } | null }
/** Each listener's first guess at what was meant, and what it actually offered (if anything). */
export function listenersOf(t: Table): Listener[] {
  const meant = t.meant
  return Object.entries(t.guesses ?? {}).filter(([, gs]) => gs.length).map(([k, gs]) => {
    const [g, q] = gs[0]
    const bid = t.rounds[0]?.bids.find((b) => b.key === k)
    return { key: k, name: nameOf(k), g, q, ok: !!meant && GOODS[g] === meant.good && q === meant.qty, bid: bid ? { g: bid.g, q: bid.q } : null }
  })
}
export function takenOf(t: Table) {
  const r = t.rounds.find((x) => x.taken)
  const b = r?.bids.find((x) => x.key === r.taken)
  return b ? { who: b.who, key: b.key, g: b.g, q: b.q, reaction: r!.reaction } : null
}

/** The words, each with its gloss underneath (interlinear). */
export function Interlinear({ t, big = false }: { t: Table; big?: boolean }) {
  const tokens = (t.said ?? '').split(' ').filter(Boolean)
  if (!tokens.length) return <span className={`interlinear ${big ? 'big' : ''}`}><span className="tok"><i>“…”</i><Gloss m="silence" /></span></span>
  return (
    <span className={`interlinear ${big ? 'big' : ''}`} aria-label={`“${t.said}”`}>
      {tokens.map((w, i) => (
        <span key={i} className="tok">
          <i>{i === 0 ? '“' : ''}{w}{i === tokens.length - 1 ? '”' : ''}</i>
          <Gloss m={t.gloss?.[i]} />
        </span>
      ))}
    </span>
  )
}

const STAMP: Record<Result, string> = { ok: '✓ understood, so they traded', mis: '✗ misunderstood, but they still traded', none: 'no trade' }
/** Why there was no trade: nobody understood, nobody offered, or every offer was turned down. */
function noTradeReason(t: Table) {
  const ls = listenersOf(t)
  if (!ls.length) return 'no trade: nobody else was there'
  if (!ls.some((l) => l.ok)) return 'no trade: nobody understood'
  if (!ls.some((l) => l.bid)) return 'understood, but nobody made an offer'
  return 'understood, but the offers were turned down'
}
export const Stamp = ({ t }: { t: Table }) => <span className={`stamp ${resultOf(t)}`}>{resultOf(t) === 'none' ? noTradeReason(t) : STAMP[resultOf(t)]}</span>

/** A listener: who, what it thought was meant (✓/✗), and what it offered. */
function ListenerChip({ l, compact = false }: { l: Listener; compact?: boolean }) {
  const select = useGame((s) => s.select)
  return (
    <span className={`lchip ${l.ok ? 'yes' : 'no'}`} onClick={(e) => { e.stopPropagation(); select(l.key) }} title={`${l.name}'s first guess: ${l.q} ${GOODS[l.g]}`}>
      <b>{l.name}</b>
      {compact ? <Qty g={l.g} q={l.q} size={14} /> : <> guessed <Qty g={l.g} q={l.q} /></>}
      <em>{l.ok ? '✓' : '✗'}</em>
      {!compact && <span className="offer">{l.bid ? <>— offered <Qty g={l.bid.g} q={l.bid.q} /></> : '— didn\'t offer'}</span>}
    </span>
  )
}

/** The full card: three beats. */
export function ExchangeCard({ t, controls }: { t: Table; controls?: ReactNode }) {
  const select = useGame((s) => s.select)
  const ls = listenersOf(t)
  const taken = takenOf(t)
  const meant = t.meant
  return (
    <div className={`xcard ${resultOf(t)}`}>
      <div className="beat beat-say">
        <div className="who-line">
          <button className="who" onClick={() => select(t.makerKey)}>{t.maker}</button>
          <span className="sc">{TOWNS[t.town]} · generation {t.gen}, day {t.day}</span>
        </div>
        <div className="say-line">
          <span className="on-table" title="what it puts on the table"><Qty g={t.give} q={t.giveQ} size={22} /><small>on the table</small></span>
          <Interlinear t={t} big />
          {meant && <span className="wants" title={t.revealed ? 'What it really meant. Locked on Solana before anyone answered, then revealed and checked after its life.' : 'What it really meant. Locked on Solana until its life ends.'}>
            <small>meant</small><Qty g={GOOD_IX(meant.good)} q={meant.qty} size={22} /><span className="seal">{t.revealed ? '✓ verified on Solana' : 'locked on Solana'}</span>
          </span>}
        </div>
      </div>
      <div className="beat beat-hear">
        {ls.length ? ls.map((l) => <ListenerChip key={l.key} l={l} />) : <span className="note">nobody else was there to hear it</span>}
      </div>
      <div className="beat beat-result">
        <Stamp t={t} />
        {taken && <span className="took">{t.maker} takes {taken.who}'s <Qty g={taken.g} q={taken.q} />{taken.reaction ? <> · “<i>{taken.reaction}</i>”</> : null}</span>}
        {controls}
      </div>
    </div>
  )
}
