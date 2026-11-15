// Plays voice lines from the gateway (ElevenLabs audio, synthesised on first listen).
// A small queue so villagers take turns instead of talking over each other.
import { useGame } from './store'
import { GATEWAY } from './endpoints'

export { GATEWAY }
export const audioUrl = (hash: string) => `${GATEWAY}/audio/${hash}.mp3`

interface Item { hash: string; who?: string; label: string; text: string }
const queue: Item[] = []
let current: HTMLAudioElement | null = null

function next() {
  const item = queue.shift()
  if (!item) { current = null; return }
  const g = useGame.getState()
  if (g.muted) { queue.length = 0; current = null; return }
  current = new Audio(audioUrl(item.hash))
  g.setLive({ speaking: item.label })
  if (item.who) g.liveSay(item.who, item.text)
  else useGame.setState({ subtitle: { who: item.label, text: item.text } })
  const done = () => { useGame.getState().setLive({ speaking: null }); next() }
  current.onended = done
  current.onerror = done
  current.play().catch(done) // autoplay blocked until the viewer has clicked once
}

/** Queue a line. Market chatter is dropped when the queue is long; the radio jumps the queue. */
export function play(item: Item, priority = false, maxQueue = 2) {
  if (useGame.getState().muted) return
  if (priority) { queue.unshift(item); current?.pause(); current = null }
  else if (queue.length >= maxQueue) return
  else queue.push(item)
  if (!current) next()
}

/** Whether a line is playing or waiting. */
export const busy = () => !!current || queue.length > 0

export function stopAll() {
  queue.length = 0
  current?.pause()
  current = null
  useGame.getState().setLive({ speaking: null })
}
