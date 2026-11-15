// Island Radio's bed: looping town ambience (ElevenLabs sound effects from the gateway),
// following the camera, ducked under speech.
import { GATEWAY } from './endpoints'

const BED = 0.22, DUCKED = 0.07
let el: HTMLAudioElement | null = null
let cur = ''

export function setAmbience(name: string | null) {
  if ((name ?? '') === cur) return
  cur = name ?? ''
  const old = el
  if (old) fade(old, 0, () => old.pause())
  el = null
  if (!name) return
  const a = new Audio(`${GATEWAY}/sfx/${name}.mp3`)
  a.loop = true
  a.volume = 0
  a.play().then(() => fade(a, BED)).catch(() => {})
  el = a
}

export function duck(on: boolean) {
  if (el) fade(el, on ? DUCKED : BED)
}

function fade(a: HTMLAudioElement, to: number, done?: () => void) {
  const from = a.volume, t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 700)
    a.volume = from + (to - from) * k
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}
