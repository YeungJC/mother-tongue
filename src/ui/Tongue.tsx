// The frame around the three screens: the top bar (what this is, where the player is, the chain),
// the page switch, the agent card (opens from any name, on any screen) and the offline notice.
import { useEffect } from 'react'
import { useGame } from '../store'
import { explorer, useTongue } from '../tongue'
import Intro from './Intro'
import Watch from './Watch'
import Agents, { AgentCard } from './Agents'
import Findings from './Findings'

/** Where the player is: live (with the newest table on screen) or a recording. */
function Status() {
  const st = useTongue((s) => s.state)
  const gen = useTongue((s) => s.gen)
  const day = useTongue((s) => s.day)
  const atLive = useTongue((s) => s.atLive)
  const lifetimes = useTongue((s) => s.lifetimes)
  if (!st) return null
  const where = gen ? `generation ${gen}${st.live ? '' : ` of ${lifetimes.length}`}, day ${day || 1}` : ''
  if (st.live) {
    const near = !!st.now && gen === st.now.gen && Math.abs((day || 1) - st.now.day) <= 1
    return atLive || near || !st.now
      ? <span className="status live" title="This island is running right now. You are watching its latest offer.">● LIVE{where ? ` · ${where}` : ''}</span>
      : <span className="status live behind" title="This island is running right now, but you are watching an earlier moment.">● LIVE island · watching {where} · live at generation {st.now.gen}, day {st.now.day}</span>
  }
  return <span className="status rec" title="A recording of a finished run, replayed from generation 1.">Recorded{where ? ` · ${where}` : ''}</span>
}

/** The chain, honestly: in-process for LiteSVM islands (with the devnet deployment linked). */
function ChainChip() {
  const st = useTongue((s) => s.state)
  const stats = useTongue((s) => s.stats)
  if (!st) return null
  const link = <a href={explorer('address', st.program)} target="_blank" rel="noreferrer">deployed on devnet ↗</a>
  const tx = stats?.transactions ? <><b>{stats.transactions.toLocaleString()}</b> transactions · </> : null
  return st.filesOnly
    ? <span className="chain-chip" title="Every word, offer and birth is a Solana transaction. For speed, this island runs our program locally (LiteSVM). The same program is deployed on devnet.">{tx}our Solana program, running locally · {link}</span>
    : <span className="chain-chip" title="Every word, offer and birth is a Solana transaction on devnet.">{tx}on Solana {st.cluster} · {link}</span>
}

function TopBar() {
  const page = useTongue((s) => s.page)
  const set = useTongue((s) => s.set)
  return (
    <header className="card top tongue-top">
      <div className="brand" onClick={() => set({ page: 'intro' })} role="button" title="What is this?">
        <span className="title">Mother Tongue <small>— AI agents invent a language from nothing</small></span>
        <ChainChip />
      </div>
      <div className="mode"><Status /></div>
      <nav className="tabs pages">
        {(['watch', 'agents', 'findings'] as const).map((p) => (
          <button key={p} className={`tab ${page === p ? 'on' : ''}`} onClick={() => set({ page: p })}>{p === 'watch' ? 'Watch' : p === 'agents' ? 'Agents' : 'Findings'}</button>
        ))}
      </nav>
    </header>
  )
}

function NotConnected() {
  const connected = useTongue((s) => s.connected)
  const st = useTongue((s) => s.state)
  const indexer = useTongue((s) => s.indexer)
  if (connected || st) return null
  return (
    <div className="card offline">
      <h2>Nothing to show yet</h2>
      <p>No indexer answered at <code>{indexer}</code>. Start one:</p>
      <p><code>./start.sh</code> for a live island, or <code>./start.sh --recorded</code> to replay a recorded one (no chain, no keys).</p>
    </div>
  )
}

/** Presenter mode reveals the Watch screen one panel at a time, in the order you'd narrate it. */
const STAGES = ['the exchange', 'the language so far', 'how it is changing', "who's winning", 'the generations']
const HIDE = ['hide-lang', 'hide-log', 'hide-win', 'hide-tp'] // stage n shows the first n-1 of these

function usePresenterKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const { present, set } = useTongue.getState()
      const k = e.key
      if (k === 'p' || k === 'P') { set({ present: present ? 0 : 1, page: 'watch' }); e.preventDefault(); return }
      if (!present) return
      if (k === 'Escape') set({ present: 0 })
      else if (k === 'ArrowRight' || k === 'PageDown') set({ present: Math.min(STAGES.length, present + 1) })
      else if (k === 'ArrowLeft' || k === 'PageUp') set({ present: Math.max(1, present - 1) })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function Tongue() {
  const page = useTongue((s) => s.page)
  const present = useTongue((s) => s.present)
  const selected = useGame((s) => s.selected)
  usePresenterKeys()
  const hidden = present && page === 'watch' ? `presenting ${HIDE.slice(present - 1).join(' ')}` : ''
  return (
    <div className={`hud tongue page-${page} ${selected ? 'has-agent' : ''} ${hidden}`}>
      {hidden && <span className="present-chip" aria-live="polite">{present}/{STAGES.length} · {STAGES[present - 1]}{present < STAGES.length ? ' · → next' : ''}</span>}
      <TopBar />
      {page === 'intro' && <Intro />}
      {page === 'watch' && <Watch />}
      {page === 'agents' && <Agents />}
      {page === 'findings' && <Findings />}
      {selected && page !== 'intro' && <AgentCard />}
      <NotConnected />
    </div>
  )
}
