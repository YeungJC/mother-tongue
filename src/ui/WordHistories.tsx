// How words change: real histories from the island on screen. Two views of the same data
// (the indexer's /words: each town's most common word for each meaning, every generation, and
// where every word form came from):
//  - sound changes: a word a child misheard that then became what the whole town says;
//  - a timeline for one meaning across the four towns, so dialects can be seen splitting.
// Descriptive, one island: the replicated claims are the numbered findings around it.
import { useEffect, useMemo, useState } from 'react'
import { indexerUrl, TOWNS } from '../tongue'
import { MEANINGS } from '../derive'
import { hearDrift } from './Watch'

interface Cell { word: string; share: number }
interface Words {
  dialects: { gen: number; dialect: (Cell | null)[][] }[]
  origins: Record<string, { kind: 'coined' | 'misheard'; by: string; gen: number; coinedFor: string | null; from: string | null }>
}
interface Run { word: string; from: number; to: number }
interface Change { town: number; meaning: number; runs: Run[]; misheard: { from: string; to: string; gen: number }[] }

const ONE = 5 // "one" is mostly left unsaid (a bare good means one), so it has few words to show
const TINTS = ['#cfe0f5', '#f9d5c3', '#c6eadb', '#efe0a6', '#e3cfee', '#f3c9d3', '#d4e6b5']
const BORDERS = ['#2a78d6', '#eb6834', '#1baf7a', '#a07d12', '#8a52b0', '#c0405f', '#5f8a2a']

/** Each town's word for a meaning, as runs of generations: dinu (1–9), tinu (10–12). */
function runsOf(w: Words, town: number, meaning: number): Run[] {
  const out: Run[] = []
  for (const g of w.dialects) {
    const word = g.dialect?.[town]?.[meaning]?.word
    if (!word) continue
    const last = out[out.length - 1]
    if (last && last.word === word && last.to === g.gen - 1) last.to = g.gen
    else out.push({ word, from: g.gen, to: g.gen })
  }
  return out
}

/** Did `to` come from `from` by mishearing, directly or through a chain of mishearings? */
function heardFrom(w: Words, to: string, from: string) {
  let o = w.origins[to]
  for (let i = 0; o && o.kind === 'misheard' && o.from && i < 12; i++) {
    if (o.from === from) return true
    o = w.origins[o.from]
  }
  return false
}

const span = (r: Run) => (r.from === r.to ? `generation ${r.from}` : `generations ${r.from}–${r.to}`)
const latest = (c: Change) => c.misheard[c.misheard.length - 1]
/** The word before the latest mishearing and the word it became. */
function around(c: Change): Run[] {
  const e = latest(c)
  const i = c.runs.findIndex((r) => r.word === e.to && r.from === e.gen)
  return i > 0 ? [c.runs[i - 1], c.runs[i]] : c.runs.slice(-2)
}

export default function WordHistories({ startedAsMistake, wordsInUse }: { startedAsMistake?: number; wordsInUse?: number }) {
  const [w, setW] = useState<Words | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    fetch(`${indexerUrl()}/words`).then((r) => r.json()).then((d: Words) => { if (live) setW(d) }).catch(() => {})
    return () => { live = false }
  }, [])

  const { changes, varied, best } = useMemo(() => {
    if (!w?.dialects?.length) return { changes: [] as Change[], varied: [] as number[], best: undefined as number | undefined }
    const changes: Change[] = []
    const variety = new Map<number, number>()
    for (let m = 0; m < MEANINGS.length; m++) {
      if (m === ONE) continue
      const forms = new Set<string>()
      for (let t = 0; t < TOWNS.length; t++) {
        const runs = runsOf(w, t, m)
        runs.forEach((r) => forms.add(r.word))
        const misheard: Change['misheard'] = []
        for (let i = 1; i < runs.length; i++) if (heardFrom(w, runs[i].word, runs[i - 1].word)) misheard.push({ from: runs[i - 1].word, to: runs[i].word, gen: runs[i].from })
        if (misheard.length) changes.push({ town: t, meaning: m, runs, misheard })
      }
      // How readable this meaning's timeline is: towns that disagree at the end (dialects), in
      // as few changes of word as possible.
      const ends = new Set(TOWNS.map((_, t) => w.dialects[w.dialects.length - 1]?.dialect?.[t]?.[m]?.word).filter(Boolean))
      const segments = TOWNS.reduce((n, _, t) => n + runsOf(w, t, m).length, 0)
      if (forms.size > 1) variety.set(m, (ends.size >= 2 ? 0 : 100) + segments)
    }
    // Cleanest first (a town that settled on one word, then misheard it), then the most recent;
    // one per meaning where possible, so the list isn't all "food".
    changes.sort((a, b) => a.runs.length - b.runs.length || b.misheard[b.misheard.length - 1].gen - a.misheard[a.misheard.length - 1].gen)
    const seen = new Set<number>()
    const firstPerMeaning = changes.filter((c) => (seen.has(c.meaning) ? false : (seen.add(c.meaning), true)))
    const picked = [...firstPerMeaning, ...changes.filter((c) => !firstPerMeaning.includes(c))]
    const goodsAndReactions = [...variety.keys()].filter((m) => m < 5 || m > 10).sort((a, b) => a - b)
    const best = [...goodsAndReactions].sort((a, b) => variety.get(a)! - variety.get(b)!)[0]
    return { changes: picked.slice(0, 4), varied: goodsAndReactions, best }
  }, [w])

  if (!w?.dialects?.length) return null
  const gens = w.dialects.map((g) => g.gen)
  const first = gens[0], last = gens[gens.length - 1]
  const meaning = pick ?? best ?? varied[0] ?? 0
  const rows = TOWNS.map((_, t) => runsOf(w, t, meaning))
  const palette = new Map<string, number>()
  for (const r of rows.flat()) if (!palette.has(r.word)) palette.set(r.word, palette.size)
  const tint = (word: string) => { const i = palette.get(word) ?? 0; return { background: TINTS[i % TINTS.length], borderColor: BORDERS[i % BORDERS.length] } }

  return (
    <section className="r-section wh">
      <div className="r-text">
        <span className="kicker">From this island</span>
        <h2>How words change</h2>
        <p className="lead">When a child mishears a word slightly and the new version catches on, the whole town ends up saying it. Real languages change the same way. Towns that rarely meet change separately, which is how dialects form.</p>
        {startedAsMistake !== undefined && wordsInUse ? <p className="lead"><b>{startedAsMistake} of the {wordsInUse}</b> words in use in the last generation started as a mistake.</p> : null}
        <p className="why"><span className="kicker">Read this as</span> examples from the island you're watching, not a result tested across islands. The tested results are the numbered findings around it.</p>
      </div>
      <div className="r-chart">
        <div className="chart wh-panel">
          <h3>Words that changed by mishearing</h3>
          {changes.length ? (
            <ul className="wh-list">
              {changes.map((c) => (
                <li key={`${c.town}-${c.meaning}`}>
                  <div className="wh-where"><b>{TOWNS[c.town]}</b>, the word for <b>{MEANINGS[c.meaning]}</b></div>
                  <div className="wh-chain">
                    {around(c).map((r, i) => (
                      <span key={i} className="wh-step">
                        {i > 0 && <span className="wh-arrow" aria-hidden="true">→</span>}
                        <i className="wh-word">{r.word}</i><small>{span(r)}</small>
                      </span>
                    ))}
                    <button className="lx-hear" onClick={() => hearDrift(c.meaning, c.town)} aria-label={`Hear how ${TOWNS[c.town]} has said ${MEANINGS[c.meaning]}, generation by generation`} title="Hear it change, generation by generation">▶</button>
                  </div>
                  <div className="wh-note">{`a child heard “${latest(c).from}” as “${latest(c).to}” in generation ${latest(c).gen}`}{c.runs.length > 2 ? ', after the town had switched between words a few times' : ''}</div>
                </li>
              ))}
            </ul>
          ) : <p className="note">No word has changed by mishearing on this island yet.</p>}
        </div>
        <div className="chart wh-panel">
          <h3>One meaning, four towns, every generation</h3>
          <div className="wh-pick" role="group" aria-label="Choose a meaning">
            {varied.slice(0, 7).map((m) => (
              <button key={m} className={`chip ${m === meaning ? 'on' : ''}`} aria-pressed={m === meaning} onClick={() => setPick(m)}>{MEANINGS[m]}</button>
            ))}
          </div>
          <div className="wh-time" style={{ gridTemplateColumns: `86px repeat(${last - first + 1}, minmax(0, 1fr))` }}>
            {TOWNS.map((town, t) => (
              <div className="wh-row" key={town} style={{ display: 'contents' }}>
                <span className="wh-town" style={{ gridRow: t + 1 }}>{town}</span>
                {rows[t].length ? rows[t].map((r, i) => (
                  <span key={i} className="wh-seg" title={`${town} said “${r.word}” for ${MEANINGS[meaning]} in ${span(r)}`}
                    style={{ gridRow: t + 1, gridColumn: `${r.from - first + 2} / ${r.to - first + 3}`, ...tint(r.word) }}>{r.word}</span>
                )) : <span className="wh-none" style={{ gridRow: t + 1, gridColumn: `2 / ${last - first + 3}` }}>no word</span>}
              </div>
            ))}
            <span className="wh-axis" style={{ gridRow: TOWNS.length + 1, gridColumn: 2 }}>gen {first}</span>
            <span className="wh-axis end" style={{ gridRow: TOWNS.length + 1, gridColumn: last - first + 2 }}>gen {last}</span>
          </div>
          <p className="note">Same colour = same word. Where a town's colour changes, its word changed; where towns differ, they've split into dialects.</p>
        </div>
      </div>
    </section>
  )
}
