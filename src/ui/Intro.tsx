// The first screen: what this is, in one pitch and three steps, and one way in.
import { useTongue } from '../tongue'

export default function Intro() {
  const set = useTongue((s) => s.set)
  const st = useTongue((s) => s.state)
  return (
    <div className="intro">
      <div className="card intro-card">
        <span className="kicker">A lab for machine languages, on Solana</span>
        <h1>Mother Tongue</h1>
        <p className="pitch">AI agents are starting to talk to each other, in ways we may not be able to read. Here, twelve agents are born with no language and must invent one to trade. What each one meant is locked on Solana before anyone answers, so we can check, word by word, whether they understood each other.</p>
        <ol className="steps">
          <li><div><b>Born speaking nothing.</b> Four towns, no shared words. Each agent learns only from what it sees change hands.</div></li>
          <li><div><b>Trade or starve.</b> An agent puts goods on the table and says, in its own words, what it wants back. If nobody understands, nobody trades.</div></li>
          <li><div><b>Children inherit what they overheard.</b> The best-placed in each trade have the most children, who learn from some of what their parent heard. The language drifts, splits into dialects, and keeps its mistakes.</div></li>
        </ol>
        <div className="intro-cta">
          <button className="btn primary big" onClick={() => set({ page: 'watch' })}>Watch the island{st?.live ? ' (live)' : ''}</button>
        </div>
        <p className="note">After that, <b>Agents</b> shows who succeeds and why, and <b>Findings</b> shows what held up when we re-ran it on new islands. Voices by ElevenLabs. Nothing is scripted.</p>
      </div>
    </div>
  )
}
