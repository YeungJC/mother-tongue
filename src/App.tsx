import { useEffect } from 'react'
import Scene from './scene/Scene'
import HUD from './ui/HUD'
import { useGame } from './store'
import { startTongue } from './tongue'

export default function App() {
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const stop = startTongue()
    useGame.getState().start() // the island is always on (?play is no longer needed)
    const view = q.get('view') // island | 0 | 1 | 2
    if (view) useGame.getState().setFocus(view === 'island' ? 'island' : Number(view))
    const sel = q.get('sel')
    if (sel) {
      let done = false
      const unsub = useGame.subscribe((s) => {
        if (done || !s.villagers.some((v) => v.id === sel)) return
        done = true
        unsub()
        queueMicrotask(() => useGame.getState().select(sel)) // outside the notification, to avoid re-entry
      })
    }
    return stop
  }, [])
  return (
    <>
      <div className="stage"><Scene /></div>
      <div className="paper" aria-hidden="true" />
      {!new URLSearchParams(location.search).has('clean') && <HUD />}
    </>
  )
}
