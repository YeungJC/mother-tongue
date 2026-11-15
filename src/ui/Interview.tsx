// Live voice interview with an islander: ElevenLabs Conversational AI, given only what the agent
// saw and did (and its thoughts, if it's a thinker) by the gateway. Beside it, the receipts: the
// same record joined to what everyone REALLY meant (sealed on-chain), so a viewer can check the
// agent's explanations. The agent itself never sees the sealed meanings.
import { useEffect, useRef, useState } from 'react'
import { Conversation } from '@elevenlabs/client'
import { GATEWAY, stopAll } from '../audio'
import { indexerUrl } from '../tongue'

type Line = { role: 'user' | 'agent'; text: string }
type Gq = { good: string; qty: number } | null
type Entry = { day: number; town: string; role: 'offered' | 'bid'; shows: string; said: string; meant: Gq; maker?: string; outcome: string; got?: string | null; from?: string | null; guessed?: Gq; offered?: string; falseBlame?: boolean }
type Rec = { entries: Entry[]; thoughts: { day: number; kind: string; thought: string }[]; revealed: boolean }
const gq = (x: Gq | undefined) => (x ? `${x.qty} ${x.good}` : '?')

/** The record beside the interview: what the agent did, against what was really meant. */
function Receipts({ rec, name }: { rec: Rec; name: string }) {
  const [only, setOnly] = useState(true)
  const blamed = rec.entries.filter((e) => e.falseBlame)
  const shown = (only && blamed.length ? blamed : rec.entries).slice(-12)
  return (
    <div className="receipts">
      <div className="receipts-head">
        <b>The record</b> <span className="sc tiny">what {name} saw, next to what everyone really meant (locked on Solana{rec.revealed ? ', now revealed' : ''})</span>
        {blamed.length > 0 && <button className="btn small" onClick={() => setOnly(!only)}>{only ? `all ${rec.entries.length} exchanges` : `${blamed.length} times it was wrong about why`}</button>}
      </div>
      {shown.map((e, i) => (
        <div key={i} className={`receipt ${e.falseBlame ? 'blame' : ''}`}>
          <span className="sc tiny">day {e.day} · {e.town}</span>
          {e.role === 'offered'
            ? <p>Showed <b>{e.shows}</b>, said <i>“{e.said}”</i> meaning <b>{gq(e.meant)}</b> → {e.got ? <>got {e.got} from {e.from}</> : 'no trade'}</p>
            : <p>{e.maker} showed {e.shows}, said <i>“{e.said}”</i>, meant <b>{gq(e.meant)}</b>. {name} guessed <b>{gq(e.guessed)}</b> {e.guessed && e.meant && e.guessed.good === e.meant.good && e.guessed.qty === e.meant.qty ? '✓' : '✗'}, offered {e.offered} → {e.outcome}</p>}
          {e.falseBlame && <p className="why-wrong">It had the right good. The offer was turned down because it was too small, not because of the words. But all {name} learns is “no”, so it trusts <i>“{e.said}”</i> a little less.</p>}
        </div>
      ))}
      {rec.thoughts.length > 0 && (
        <details><summary className="sc">{rec.thoughts.length} logged thoughts</summary>
          {rec.thoughts.slice(-8).map((t, i) => <p key={i} className="tiny">day {t.day}: “{t.thought}”</p>)}
        </details>
      )}
    </div>
  )
}
type Status = 'idle' | 'connecting' | 'live' | 'ended' | 'error'

export default function Interview({ agent, name, onClose }: { agent: string; name: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [mode, setMode] = useState<'speaking' | 'listening'>('listening')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState('')
  const [diary, setDiary] = useState<{ day: number; memo: string }[]>([])
  const [rec, setRec] = useState<Rec | null>(null)
  const [typed, setTyped] = useState('')
  useEffect(() => { fetch(`${indexerUrl()}/record/${encodeURIComponent(agent)}`).then((r) => r.json()).then(setRec).catch(() => setRec(null)) }, [agent])
  const session = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null)
  const scroll = useRef<HTMLDivElement>(null)

  useEffect(() => { scroll.current?.scrollTo(0, scroll.current.scrollHeight) }, [lines])
  useEffect(() => () => { session.current?.endSession() }, [])

  async function start() {
    stopAll() // hush the market while we talk
    setStatus('connecting')
    setError('')
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }) // ask for the mic up front
      const ix = indexerUrl()
      const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(ix) ? `?indexer=${encodeURIComponent(ix)}` : ''
      const s = await fetch(`${GATEWAY}/interview/${encodeURIComponent(agent)}${local}`).then((r) => r.json())
      if (s.error) throw new Error(s.error)
      setDiary(s.diaryDays ?? [])
      session.current = await Conversation.startSession({
        signedUrl: s.signedUrl,
        connectionType: 'websocket',
        overrides: s.overrides,
        onConnect: () => setStatus('live'),
        onDisconnect: () => setStatus((st) => (st === 'error' ? st : 'ended')),
        onError: (m: unknown) => { setError(String(m)); setStatus('error') },
        onModeChange: ({ mode }: { mode: 'speaking' | 'listening' }) => setMode(mode),
        onMessage: (m: { message: string; role?: string; source?: string }) =>
          setLines((ls) => {
            const role = (m.role ?? m.source) === 'user' ? 'user' : 'agent'
            if (role === 'user' && /^[\s.…]*$/.test(m.message)) return ls // silence, not speech
            // A typed question is shown when sent; don't show it twice if the server echoes it.
            if (role === 'user' && ls.length && ls[ls.length - 1].role === 'user' && ls[ls.length - 1].text === m.message) return ls
            return [...ls, { role, text: m.message }]
          }),
      } as Parameters<typeof Conversation.startSession>[0])
    } catch (e) {
      setError(String((e as Error).message ?? e))
      setStatus('error')
    }
  }

  /** A typed question, sent into the same live conversation (no microphone needed). */
  function ask(e: React.FormEvent) {
    e.preventDefault()
    const q = typed.trim()
    if (!q || !session.current) return
    session.current.sendUserMessage(q)
    setLines((ls) => [...ls, { role: 'user', text: q }])
    setTyped('')
  }

  async function end() {
    await session.current?.endSession()
    session.current = null
    setStatus('ended')
  }

  return (
    <div className="interview">
      <div className="interview-head">
        <b>Interview with {name}</b>
        <button className="x" onClick={() => { end(); onClose() }} aria-label="Close interview">×</button>
      </div>
      {status === 'idle' && (
        <>
          <p className="sc">Ask {name} out loud why it did what it did. It only knows what it saw and did, not what the others really meant, so you can check its answers against the record below.</p>
          <button className="btn primary" onClick={start}>🎙 Start talking</button>
        </>
      )}
      {status === 'connecting' && <p className="sc">Knocking on {name}'s door…</p>}
      {(status === 'live' || status === 'ended' || lines.length > 0) && (
        <div className="transcript" ref={scroll}>
          {lines.map((l, i) => (
            <p key={i} className={l.role}><span className="sc">{l.role === 'user' ? 'You' : name}</span> {l.text}</p>
          ))}
        </div>
      )}
      {status === 'live' && (
        <form className="interview-ask" onSubmit={ask}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type a question" aria-label="Type a question" />
          <button className="btn small" type="submit">Ask</button>
        </form>
      )}
      {status === 'live' && (
        <div className="interview-foot">
          <span className={`live-dot ${mode}`} /> <span className="sc">{mode === 'speaking' ? `${name} is speaking` : 'Listening… just talk'}</span>
          <button className="btn small" onClick={end}>End</button>
        </div>
      )}
      {status === 'ended' && <button className="btn small" onClick={start}>Talk again</button>}
      {status === 'error' && <p className="err">Couldn't start the interview: {error}</p>}
      {diary.length > 0 && <p className="sc tiny">Based on {diary.length} days of its diary.</p>}
      {rec && rec.entries.length > 0 && <Receipts rec={rec} name={name} />}
    </div>
  )
}
