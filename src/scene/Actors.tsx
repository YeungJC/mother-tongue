import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Group, Mesh, Vector3 } from 'three'
import { PAT } from './ink'
import { Blob, Bx, Cn, Cy, Ic } from './kit'
import { Flight, useGame } from '../store'
import { groundY } from '../terrain'
import { VillagerDef, posOf } from '../world'
import { useTongue } from '../tongue'

const tmp = new Vector3()
const SKIN = '#e9c9a0'
const DARK = '#3a322a'

function Outfit({ v }: { v: VillagerDef }) {
  switch (v.look) {
    case 'farmer':
      return (
        <>
          <Cy a={[0.4, 0.42, 0.04, 10]} p={[0, 1.47, 0]} c="#d9b24e" o={PAT.thatch} line={0.03} />
          <Cy a={[0.17, 0.2, 0.16, 9]} p={[0, 1.56, 0]} c="#d9b24e" o={PAT.thatch} line={0.03} />
          <Cy a={[0.2, 0.2, 0.04, 9]} p={[0, 1.5, 0]} c="#8e3a34" line={0} />
          <Ic a={[0.2, 1]} p={[0, 1.24, -0.06]} s={[1.05, 1, 1]} c="#8a5a36" line={0} />
          <Bx a={[0.34, 0.42, 0.04]} p={[0, 0.72, 0.24]} c="#f3e9cb" line={0.02} />
        </>
      )
    case 'lumberjack':
      return (
        <>
          <Cn a={[0.24, 0.3, 8]} p={[0, 1.53, 0]} c={v.hat} line={0.03} />
          <Cy a={[0.23, 0.23, 0.07, 9]} p={[0, 1.4, 0]} c="#f3e9cb" line={0.02} />
          <Ic a={[0.17, 1]} p={[0, 1.15, 0.1]} s={[1.1, 1, 0.8]} c="#7a4a2a" line={0.025} />
          <Bx a={[0.5, 0.07, 0.04]} p={[0, 0.95, 0.26]} r={[0, 0, 0.6]} c="#3a322a" line={0} />
        </>
      )
    case 'miner':
      return (
        <>
          <Ic a={[0.22, 1]} p={[0, 1.38, 0]} s={[1, 0.6, 1]} c="#7a6a4a" line={0.03} />
          <Bx a={[0.08, 0.08, 0.06]} p={[0, 1.42, 0.2]} c="#f0d070" line={0} />
          <Bx a={[0.42, 0.5, 0.05]} p={[0, 0.74, 0.26]} c="#5a5048" line={0.02} />
        </>
      )
    case 'merchant':
      return (
        <>
          <Cy a={[0.3, 0.3, 0.04, 10]} p={[0, 1.44, 0]} c={v.hat} line={0.03} />
          <Cy a={[0.16, 0.19, 0.2, 9]} p={[0, 1.55, 0]} c={v.hat} line={0.03} />
          <Bx a={[0.3, 0.34, 0.22]} p={[0, 0.85, -0.3]} c="#8a5a36" o={PAT.planks} line={0.025} />
        </>
      )
    case 'blacksmith':
      return (
        <>
          <Cy a={[0.21, 0.21, 0.07, 9]} p={[0, 1.36, 0]} c={v.hat} line={0.02} />
          <Ic a={[0.2, 1]} p={[0, 1.3, -0.07]} s={[1, 0.9, 0.9]} c="#c9825a" line={0} />
          <Bx a={[0.4, 0.62, 0.05]} p={[0, 0.72, 0.26]} c="#4a3d32" line={0.025} />
          <Bx a={[0.08, 0.3, 0.04]} p={[-0.14, 1.05, 0.2]} c="#4a3d32" line={0} />
          <Bx a={[0.08, 0.3, 0.04]} p={[0.14, 1.05, 0.2]} c="#4a3d32" line={0} />
        </>
      )
    default:
      return (
        <>
          <Cy a={[0.2, 0.23, 0.14, 9]} p={[0, 1.46, 0]} c={v.hat} line={0.03} />
          <Bx a={[0.26, 0.03, 0.2]} p={[0, 1.41, 0.24]} c={v.hat} line={0.02} />
          <Ic a={[0.19, 1]} p={[0, 1.22, -0.08]} c="#6b4a2b" line={0} />
          <Bx a={[0.1, 0.14, 0.08]} p={[0.2, 0.5, 0.18]} c="#8a5a36" line={0.015} />
        </>
      )
  }
}

function Tool({ id }: { id: string }) {
  if (id === 'miner')
    return (
      <group position={[0, -0.4, 0.06]} rotation={[0.5, 0, 0]}>
        <Bx a={[0.04, 0.75, 0.04]} p={[0, 0.25, 0]} c="#8a6b45" line={0.012} />
        <Bx a={[0.05, 0.07, 0.45]} p={[0, 0.6, 0]} r={[0.25, 0, 0]} c="#8b9090" line={0.02} />
      </group>
    )
  if (id === 'farmer')
    return (
      <group position={[0, -0.4, 0.06]} rotation={[0.2, 0, 0]}>
        <Bx a={[0.035, 1.3, 0.035]} p={[0, 0.3, 0]} c="#8a6b45" line={0.012} />
        <Bx a={[0.26, 0.03, 0.03]} p={[0, 0.95, 0]} c={DARK} line={0} />
        {[-0.12, 0, 0.12].map((x) => <Bx key={x} a={[0.025, 0.22, 0.025]} p={[x, 1.06, 0]} c={DARK} line={0} />)}
      </group>
    )
  if (id === 'lumberjack')
    return (
      <group position={[0, -0.4, 0.06]} rotation={[0.5, 0, 0]}>
        <Bx a={[0.04, 0.8, 0.04]} p={[0, 0.25, 0]} c="#8a6b45" line={0.012} />
        <Bx a={[0.05, 0.2, 0.28]} p={[0, 0.6, 0.1]} c="#8b9090" line={0.02} />
      </group>
    )
  if (id === 'blacksmith')
    return (
      <group position={[0, -0.4, 0.06]} rotation={[0.6, 0, 0]}>
        <Bx a={[0.04, 0.5, 0.04]} p={[0, 0.15, 0]} c="#8a6b45" line={0.012} />
        <Bx a={[0.12, 0.14, 0.28]} p={[0, 0.42, 0]} c="#4a4a48" line={0.02} />
      </group>
    )
  return (
    <group position={[0, -0.4, 0.06]} rotation={[0.5, 0, 0]}>
      <Bx a={[0.04, 0.5, 0.04]} p={[0, 0.15, 0]} c="#8a6b45" line={0.012} />
      <Cy a={[0.09, 0.09, 0.26, 8]} p={[0, 0.42, 0]} r={[Math.PI / 2, 0, 0]} c="#c9a26b" line={0.02} />
    </group>
  )
}

function Villager({ v }: { v: VillagerDef }) {
  const g = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const ring = useRef<Mesh>(null!)
  const legL = useRef<Group>(null!), legR = useRef<Group>(null!), armL = useRef<Group>(null!), armR = useRef<Group>(null!)
  const st = useRef({ i: 0, wait: 1 + Math.random() * 4, pos: new Vector3(...v.route[0]), yaw: 0, route: v.route })
  const selected = useGame((s) => s.selected === v.id)
  const line = useGame((s) => s.bubbles[v.id])
  const select = useGame((s) => s.select)
  const [hover, setHover] = useState(false)
  // Live: the people in the exchange on screen are in the spotlight (label, family colour); the
  // rest step back.
  const spot = useTongue((s) => s.spot)
  const lit = spot.includes(v.id)
  const dim = spot.length > 0 && !lit

  useFrame(({ clock }, dt) => {
    const s = st.current
    const t = clock.elapsedTime
    if (s.route !== v.route) { s.route = v.route; s.i = v.oneWay ? 0 : s.i % v.route.length; s.wait = 0 } // moved town or set off travelling
    let walking = false
    if (s.wait > 0 || line) {
      s.wait -= dt
    } else {
      const target = tmp.set(...v.route[(s.i + 1) % v.route.length])
      const dx = target.x - s.pos.x, dz = target.z - s.pos.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.08) {
        if (v.oneWay && s.i + 1 >= v.route.length - 1) s.wait = 1e9 // reached the end of the road
        else {
          s.i = (s.i + 1) % v.route.length
          s.wait = v.oneWay ? 0 : 3 + Math.random() * 4
        }
      } else {
        walking = true
        const step = Math.min(dist, (v.speed ?? 1.6) * dt)
        s.pos.x += (dx / dist) * step
        s.pos.z += (dz / dist) * step
        s.yaw = Math.atan2(dx, dz)
      }
    }
    s.pos.y = groundY(s.pos.x, s.pos.z)
    g.current.position.copy(s.pos)
    posOf(v.id).copy(s.pos)
    let dy = s.yaw - g.current.rotation.y
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    g.current.rotation.y += dy * (1 - Math.exp(-8 * dt))

    const swing = walking ? Math.sin(t * 9) * 0.7 : 0
    legL.current.rotation.x = swing
    legR.current.rotation.x = -swing
    armL.current.rotation.x = walking ? -swing * 0.8 : line ? -1.2 + Math.sin(t * 9) * 0.5 : Math.sin(t * 1.5) * 0.06
    armR.current.rotation.x = walking ? swing * 0.8 : line ? -0.5 + Math.cos(t * 7) * 0.4 : -0.25 - Math.max(0, Math.sin(t * 3 + s.i)) * 0.9
    body.current.position.y = walking ? Math.abs(Math.sin(t * 9)) * 0.07 : Math.sin(t * 2 + s.i) * 0.012
    body.current.rotation.z = walking ? Math.sin(t * 9) * 0.05 : 0
    const sc = hover || selected ? 1.75 : lit ? 1.7 : dim ? 1.25 : 1.5
    body.current.scale.lerp(tmp.set(sc, sc, sc), 1 - Math.exp(-10 * dt))
    ring.current.visible = selected
    ring.current.rotation.z = t * 0.8
  })

  const big = v.look === 'blacksmith' ? 1.15 : 1
  return (
    <group ref={g}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[0.66, 0.8, 5]} />
        <meshBasicMaterial color="#7a2e2a" />
      </mesh>
      <Blob s={0.7} />
      {v.disc && !dim && (
        // the family colour, on the ground under its people
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
          <circleGeometry args={[0.55, 20]} />
          <meshBasicMaterial color={v.tunic} transparent opacity={0.85} />
        </mesh>
      )}
      {!!v.hungry && (
        <Html center position={[0, 2.4, 0]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="hungry-mark" title={`${v.hungry} hungry day(s)`}>{'!'.repeat(Math.min(3, v.hungry))}</div>
        </Html>
      )}
      <group
        ref={body}
        onClick={(e) => { e.stopPropagation(); select(v.id) }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
      >
        {/* legs */}
        {[[-0.11, legL], [0.11, legR]].map(([x, ref]: any, i) => (
          <group key={i} ref={ref} position={[x, 0.5, 0]}>
            <Cy a={[0.075, 0.065, 0.42, 6]} p={[0, -0.21, 0]} c="#5c4a36" line={0.02} />
            <Bx a={[0.13, 0.1, 0.22]} p={[0, -0.44, 0.04]} c={DARK} line={0.02} />
          </group>
        ))}
        {/* torso and belt */}
        <Cy a={[0.19 * big, 0.3 * big, 0.62, 9]} p={[0, 0.78, 0]} c={v.tunic} o={{ pat: 4, scale: 2.5, amt: 0.25 }} line={0.03} />
        <Cy a={[0.275 * big, 0.3 * big, 0.07, 9]} p={[0, 0.56, 0]} c={DARK} line={0} />
        <Bx a={[0.07, 0.07, 0.03]} p={[0, 0.56, 0.29 * big]} c="#d9b24e" line={0} />
        {/* arms */}
        {[[-0.26 * big, armL, false], [0.26 * big, armR, true]].map(([x, ref, tool]: any, i) => (
          <group key={i} ref={ref} position={[x, 1.02, 0]}>
            <Cy a={[0.065 * big, 0.055 * big, 0.42, 6]} p={[0, -0.2, 0]} c={v.tunic} line={0.02} />
            <Ic a={[0.065, 0]} p={[0, -0.44, 0]} c={SKIN} line={0.015} />
            {tool && <Tool id={v.look} />}
          </group>
        ))}
        {/* head and face */}
        <Ic a={[0.2, 1]} p={[0, 1.27, 0]} c={SKIN} line={0.03} />
        <Ic a={[0.028, 0]} p={[-0.075, 1.3, 0.175]} c={DARK} line={0} />
        <Ic a={[0.028, 0]} p={[0.075, 1.3, 0.175]} c={DARK} line={0} />
        <Ic a={[0.035, 0]} p={[0, 1.24, 0.2]} c="#dbb088" line={0} />
        <Outfit v={v} />
      </group>
      {(hover || selected || line || lit || useGame.getState().mode !== 'live') && (
        // Live: a name only when it matters (hovered, selected, speaking), so twelve tags don't pile up.
        <Html center position={[0, 3, 0]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`tag ${selected ? 'on' : ''} ${lit ? 'lit' : ''} ${v.entrant ? `arena-tag ${v.entrant}` : ''}`}>{v.entrant ? '⚑ ' : ''}{v.role}</div>
        </Html>
      )}
      {line && (
        <Html center position={[0, 4.1, 0]} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bubble">
            {line}
            <span className="wave"><i /><i /><i /><i /></span>
          </div>
        </Html>
      )}
    </group>
  )
}

export function Villagers() {
  const villagers = useGame((s) => s.villagers)
  return <group>{villagers.map((v) => <Villager key={v.id} v={v} />)}</group>
}

function Cargo({ kind }: { kind: string }) {
  if (kind === 'coin')
    return (
      <>
        <Cy a={[0.2, 0.2, 0.06, 10]} c="#e0b23c" line={0.03} />
        <Cy a={[0.12, 0.12, 0.07, 6]} c="#f0d070" line={0} />
      </>
    )
  if (kind === 'wood')
    return (
      <>
        <Cy a={[0.13, 0.13, 0.6, 8]} r={[0, 0, Math.PI / 2]} c="#9a7448" o={PAT.planks} line={0.03} />
        <Cy a={[0.1, 0.1, 0.61, 8]} r={[0, 0, Math.PI / 2]} c="#e4c99a" line={0} />
      </>
    )
  if (kind === 'ore')
    return (
      <>
        <Ic a={[0.18, 0]} s={[1.2, 0.9, 1]} c="#7d7a72" o={PAT.cobble} line={0.03} />
        <Ic a={[0.07, 0]} p={[0.08, 0.1, 0.06]} c="#c98a4a" line={0} />
      </>
    )
  if (kind === 'planks')
    return (
      <>
        <Bx a={[0.7, 0.07, 0.22]} c="#b08a58" o={PAT.planksV} line={0.025} />
        <Bx a={[0.7, 0.07, 0.22]} p={[0, 0.08, 0]} r={[0, 0.2, 0]} c="#c49a62" o={PAT.planksV} line={0.025} />
      </>
    )
  if (kind === 'food')
    return (
      <>
        <Ic a={[0.2, 1]} s={[1, 1.15, 0.9]} c="#e4d3a4" o={{ pat: 1, scale: 9, aspect: 1 }} line={0.03} />
        <Cy a={[0.07, 0.11, 0.1, 6]} p={[0, 0.24, 0]} c="#c9b88e" line={0.02} />
      </>
    )
  return (
    <>
      <Bx a={[0.05, 0.5, 0.05]} c="#8a6b45" line={0.015} />
      <Bx a={[0.3, 0.13, 0.13]} p={[0, 0.25, 0]} c="#8b9090" line={0.025} />
    </>
  )
}

function FlightMesh({ f }: { f: Flight }) {
  const m = useRef<Group>(null!)
  const remove = useGame((s) => s.removeFlight)
  useFrame(() => {
    const t = (performance.now() - f.t0) / f.dur
    if (t < 0) { m.current.visible = false; return }
    if (t >= 1) { remove(f.id); return }
    m.current.visible = true
    const e = f.arc ? t : t * t
    m.current.position.set(
      f.from[0] + (f.to[0] - f.from[0]) * e,
      f.from[1] + (f.to[1] - f.from[1]) * e + Math.sin(Math.PI * t) * f.arc,
      f.from[2] + (f.to[2] - f.from[2]) * e,
    )
    m.current.rotation.set(t * 9, t * 6, 0)
  })
  return (
    <group ref={m} visible={false}>
      <Cargo kind={f.kind} />
    </group>
  )
}

export function Flights() {
  const flights = useGame((s) => s.flights)
  return <group>{flights.map((f) => <FlightMesh key={f.id} f={f} />)}</group>
}
