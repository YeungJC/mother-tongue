import { useTongue } from '../tongue'
import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, TiltShift2, Vignette } from '@react-three/postprocessing'
import { Color, Vector3 } from 'three'
import { inkUniforms } from './ink'
import Terrain from './Terrain'
import Buildings from './Buildings'
import Nature from './Nature'
import Bridge from './Bridge'
import { Flights, Villagers } from './Actors'
import { useGame } from '../store'
import { posOf } from '../world'
import { TOWN_POS, groundY } from '../terrain'
import Wilds from './Wilds'
import Settlements from './Settlements'
import Sea from './Sea'
import Story from './Story'

const tgt = new Vector3()
const off = new Vector3()
const DAY = new Color('#e9dcb8')
const EVE = new Color('#e6b98c')

function Rig() {
  const controls = useThree((s) => s.controls) as any
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const selected = useGame((s) => s.selected)
  const phase = useGame((s) => s.phase)
  const focus = useGame((s) => s.focus)
  const lean = useGame((s) => s.lean)
  const zoom = useRef({ goal: 64, t: 0 })
  const size = useThree((s) => s.size)
  const touched = useRef(false)

  useEffect(() => {
    const far = focus === 'island' ? 140 : focus === 0 ? 50 : 44
    if (phase === 'lobby') zoom.current = { goal: 150, t: 3 }
    else zoom.current = { goal: selected ? 15 : focus === 'island' && lean !== null ? 78 : far, t: 2.4 }
  }, [selected, phase, focus, lean])

  // keep the island clear of the side panel and chronicle
  useEffect(() => {
    const cam = camera as any
    if (phase === 'lobby') cam.setViewOffset(size.width, size.height, -size.width * 0.16, 0, size.width, size.height)
    else if (size.width > 760) cam.setViewOffset(size.width, size.height, size.width * 0.1, size.height * 0.03, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }, [phase, size, camera])

  useFrame((_, dt) => {
    // the boil: the outlines re-seed ~4 times a second (gentle hand-drawn waver)
    inkUniforms.uSeed.value = Math.floor(performance.now() / 250) % 97
    inkUniforms.uTime.value = performance.now() / 1000
    // the light warms toward the evening bell as the round runs out
    const g = useGame.getState()
    // Mock: the light warms as the round runs out. Live: it follows the in-game day.
    // Live: the light follows the day on screen (a lifetime is 20 days).
    const dayFrac = Math.min(1, Math.max(0, (useTongue.getState().day - 1) / 19))
    const dusk = g.phase === 'lobby' ? 0.1 : g.mode === 'live' ? dayFrac * 0.85 : Math.min(1, Math.max(0, 1 - g.timeLeft / 300))
    inkUniforms.uDusk.value += (dusk - inkUniforms.uDusk.value) * Math.min(1, dt)
    inkUniforms.uBg.value.copy(DAY).lerp(EVE, inkUniforms.uDusk.value)
    ;(scene.background as Color).copy(inkUniforms.uBg.value)
    if (!controls) return
    if (selected) tgt.copy(posOf(selected)).add(off.set(0, 1, 0))
    else if (focus === 'island' && g.lean !== null && phase !== 'lobby') {
      // lean toward the town where the exchange on screen happens, keeping the island in view
      const [tx, tz] = TOWN_POS[g.lean]
      tgt.set(-1 + (tx + 1) * 0.75, 0, -3 + (tz + 3) * 0.75)
    } else if (phase === 'lobby' || focus === 'island') tgt.set(-1, 0, -3)
    else if (focus === 0) tgt.set(-0.5, 0.6, 0)
    else {
      const [tx, tz] = TOWN_POS[focus]
      tgt.set(tx, groundY(tx, tz) + 0.5, tz)
    }
    off.copy(camera.position).sub(controls.target)
    controls.target.lerp(tgt, 1 - Math.exp(-4 * dt))
    if (zoom.current.t > 0) {
      zoom.current.t -= dt
      off.setLength(off.length() + (zoom.current.goal - off.length()) * (1 - Math.exp(-3.2 * dt)))
    }
    camera.position.copy(controls.target).add(off)
    controls.autoRotate = phase === 'lobby' || (!touched.current && !selected)
    controls.autoRotateSpeed = phase === 'lobby' ? 0.9 : 0.25
    controls.update()
  })

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      minDistance={10}
      maxDistance={190}
      minPolarAngle={0.55}
      maxPolarAngle={1.3}
      onStart={() => (touched.current = true)}
    />
  )
}

export default function Scene() {
  const select = useGame((s) => s.select)
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      camera={{ fov: 30, position: [80, 85, 105], near: 0.5, far: 700 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#e9dcb8']} />
      <Rig />
      <Sea />
      <Terrain />
      <Buildings />
      <Nature />
      <Bridge />
      <Wilds />
      <Settlements />
      
      <Villagers />
      <Story />
      <Flights />
      <EffectComposer multisampling={4}>
        <TiltShift2 blur={0.045} taper={0.7} />
        <Vignette eskil={false} offset={0.3} darkness={0.4} />
      </EffectComposer>
    </Canvas>
  )
}
