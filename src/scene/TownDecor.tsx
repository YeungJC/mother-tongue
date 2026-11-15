// Hand-built base scenery for Oakhollow, Ironcrag and Saltmere (Wrenford keeps the
// original hamlet). Purely decorative: every building agents own or the village founds
// is drawn from on-chain plots in Settlements.tsx, around these centres.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh } from 'three'
import { TOWN_POS } from '../terrain'
import { At, Bx, Cn, Cy, Ic, V3 } from './kit'
import { PAT } from './ink'
import { Barrel, Cottage, Crate, Fence, Log, Smoke } from './Buildings'
import { SALT_OUT } from './Settlements'

const BEAM = '#5a3d26'

/** Places children at an offset from a town centre, standing on the ground. */
function T({ town, dx, dz, rot = 0, s = 1, children }: { town: number; dx: number; dz: number; rot?: number; s?: number; children: React.ReactNode }) {
  const [x, z] = TOWN_POS[town]
  return <At x={x + dx} z={z + dz} rot={rot} s={s}>{children}</At>
}

function Campfire() {
  const f = useRef<Mesh>(null!)
  useFrame(({ clock }) => f.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 9) * 0.15))
  return (
    <group>
      {[0, 1, 2, 3, 4, 5].map((i) => <Ic key={i} a={[0.16, 0]} p={[Math.cos(i) * 0.5, 0.08, Math.sin(i) * 0.5]} c="#a9a08a" line={0.02} />)}
      <Log p={[0, 0.12, 0]} r={[0, 0.6, 0]} len={0.7} rad={0.08} />
      <Log p={[0, 0.14, 0]} r={[0, -0.6, 0]} len={0.7} rad={0.08} />
      <mesh ref={f} position={[0, 0.35, 0]}>
        <coneGeometry args={[0.22, 0.55, 6]} />
        <meshBasicMaterial color="#f08a2e" />
      </mesh>
      <Smoke p={[0, 1.4, 0]} />
    </group>
  )
}

function Watchtower({ h = 3.6 }: { h?: number }) {
  return (
    <group>
      {[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z], i) => <Bx key={i} a={[0.14, h, 0.14]} p={[x, h / 2, z]} c={BEAM} line={0.02} />)}
      <Bx a={[1.6, 0.12, 1.6]} p={[0, h, 0]} c="#b08a58" o={PAT.planks} line={0.02} />
      <Bx a={[1.6, 0.5, 0.08]} p={[0, h + 0.3, 0.78]} c="#9a7448" o={PAT.planksV} line={0.02} />
      <Cn a={[1.25, 1.1, 4]} p={[0, h + 1.3, 0]} r={[0, Math.PI / 4, 0]} c="#6f5236" o={PAT.shingle} />
    </group>
  )
}

// ----------------------------------------------------------------- Oakhollow
function Oakhollow() {
  return (
    <group>
      <T town={1} dx={0} dz={-2.6}>
        <Cottage w={4.2} d={2.8} h={1.7} rh={1.5} wall="#9a7448" wallPat={PAT.planks} roof="#5e4a32" beams={false} shutter="#5e6b3a" sign="#5e6b3a" />
      </T>
      <T town={1} dx={0.2} dz={1}><Campfire /></T>
      {/* saw pit: a trestle with a log and a two-man saw */}
      <T town={1} dx={2.8} dz={0.6} rot={0.4}>
        {[-0.8, 0.8].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <Bx a={[0.1, 1.1, 0.1]} p={[0, 0.55, -0.35]} r={[0.25, 0, 0]} c={BEAM} line={0.02} />
            <Bx a={[0.1, 1.1, 0.1]} p={[0, 0.55, 0.35]} r={[-0.25, 0, 0]} c={BEAM} line={0.02} />
          </group>
        ))}
        <Log p={[0, 1.05, 0]} r={[0, 0, Math.PI / 2]} len={2.4} rad={0.2} />
        <Bx a={[0.04, 1.3, 0.3]} p={[0.3, 0.95, 0]} r={[0, 0, 0.1]} c="#8b9090" line={0.015} />
      </T>
      {/* log yard */}
      <T town={1} dx={-2.9} dz={0.8} rot={-0.3}>
        {[[0, 0.2, 0], [0.42, 0.2, 0], [0.84, 0.2, 0], [1.26, 0.2, 0], [0.21, 0.56, 0], [0.63, 0.56, 0], [1.05, 0.56, 0], [0.42, 0.92, 0], [0.84, 0.92, 0]].map((p, i) => (
          <Log key={i} p={p as V3} r={[0, 0, 0]} len={2.2} />
        ))}
        <Bx a={[0.1, 1.2, 0.1]} p={[-0.3, 0.6, 0.5]} c={BEAM} line={0} />
        <Bx a={[0.1, 1.2, 0.1]} p={[1.6, 0.6, 0.5]} c={BEAM} line={0} />
      </T>
      {/* woodcutters' cabins out among the trees */}
      {[[-10, -3, 0.8], [7.5, -8.5, -0.6], [9.5, 5, -2.2]].map(([dx, dz, r], i) => (
        <T key={i} town={1} dx={dx} dz={dz} rot={r}>
          <Cottage w={2.2} d={2} h={1.2} rh={1.1} wall="#a87a48" wallPat={PAT.planks} roof="#6f5236" beams={false} chimney={i !== 1} />
          {i !== 1 && <Smoke p={[0.5, 2.6, -0.3]} />}
          <Log p={[1.6, 0.18, 0.6]} r={[0, 0.3, 0]} len={1.2} rad={0.16} />
        </T>
      ))}
      <T town={1} dx={-9} dz={-9.5}><Watchtower /></T>
    </group>
  )
}

// ----------------------------------------------------------------- Ironcrag
function Smelter() {
  const g = useRef<Mesh>(null!)
  useFrame(({ clock }) => ((g.current.material as { opacity: number }).opacity = 0.65 + Math.sin(clock.elapsedTime * 5) * 0.25))
  return (
    <group>
      <Cy a={[1.0, 1.25, 2.4, 9]} p={[0, 1.2, 0]} c="#9a917c" o={PAT.cobble} />
      <Cy a={[0.45, 0.6, 1.8, 8]} p={[0, 3.2, 0]} c="#7d7a72" o={PAT.brick} />
      <mesh ref={g} position={[0, 0.5, 1.15]}>
        <boxGeometry args={[0.6, 0.6, 0.1]} />
        <meshBasicMaterial color="#f08a2e" transparent />
      </mesh>
      <Smoke p={[0, 4.6, 0]} />
      <Bx a={[1.3, 0.3, 0.8]} p={[1.6, 0.15, 0.6]} c="#5a5048" line={0.02} />
      <Ic a={[0.18, 0]} p={[1.4, 0.4, 0.6]} c="#c98a4a" line={0.015} />
    </group>
  )
}

function OreCart({ p, r = 0 }: { p: V3; r?: number }) {
  return (
    <group position={p} rotation={[0, r, 0]}>
      <Bx a={[0.9, 0.45, 0.6]} p={[0, 0.45, 0]} c="#6b5a44" o={PAT.planks} line={0.02} />
      {[[-0.3, -0.32], [0.3, -0.32], [-0.3, 0.32], [0.3, 0.32]].map(([x, z], i) => (
        <Cy key={i} a={[0.14, 0.14, 0.06, 8]} p={[x, 0.16, z]} r={[Math.PI / 2, 0, 0]} c="#3a3a3a" line={0.015} />
      ))}
      {[[-0.2, 0.75, 0], [0.15, 0.78, 0.1], [0, 0.85, -0.12]].map((q, i) => <Ic key={i} a={[0.16, 0]} p={q as V3} c="#7d7a72" line={0.015} />)}
    </group>
  )
}

function Ironcrag() {
  return (
    <group>
      <T town={2} dx={-1.2} dz={-1.4}><Smelter /></T>
      {/* rails from the mine to the smelter */}
      <T town={2} dx={-5.5} dz={-6} rot={0.78}>
        {[-0.35, 0.35].map((x) => <Bx key={x} a={[0.06, 0.06, 6.5]} p={[x, 0.08, 3.2]} c="#4a4a48" line={0} />)}
        {Array.from({ length: 12 }, (_, i) => <Bx key={i} a={[0.95, 0.06, 0.16]} p={[0, 0.04, i * 0.55]} c="#6b4a2b" line={0} />)}
        <OreCart p={[0, 0.05, 2.2]} />
      </T>
      {/* the mine mouth in the crag */}
      <T town={2} dx={-9} dz={-9.2} rot={0.8}>
        <Bx a={[3, 2.4, 1.8]} p={[0, 1.2, 0]} c="#9a917c" o={PAT.cobble} />
        <Bx a={[1.2, 1.5, 0.2]} p={[0, 0.75, 0.91]} c="#2b2118" line={0} />
        <Bx a={[1.7, 0.2, 0.24]} p={[0, 1.6, 0.95]} c={BEAM} line={0.02} />
        {[-0.7, 0.7].map((dx) => <Bx key={dx} a={[0.2, 1.55, 0.22]} p={[dx, 0.78, 0.95]} c={BEAM} line={0.02} />)}
        {/* headframe and wheel */}
        <Bx a={[0.16, 3.2, 0.16]} p={[-1.1, 3.4, -0.2]} r={[0, 0, 0.2]} c={BEAM} line={0.02} />
        <Bx a={[0.16, 3.2, 0.16]} p={[1.1, 3.4, -0.2]} r={[0, 0, -0.2]} c={BEAM} line={0.02} />
        <Cy a={[0.7, 0.7, 0.12, 12]} p={[0, 4.8, -0.2]} r={[0, 0, Math.PI / 2]} c="#4a4a48" line={0.02} />
      </T>
      <T town={2} dx={2.2} dz={2.2}><OreCart p={[0, 0, 0]} r={0.6} /></T>
      <T town={2} dx={2.8} dz={-1.8}>
        <Cy a={[0.55, 0.6, 0.6, 10]} p={[0, 0.3, 0]} c="#a9a08a" o={PAT.cobble} />
        <Bx a={[0.1, 1.1, 0.1]} p={[-0.5, 0.9, 0]} c={BEAM} line={0} />
        <Bx a={[0.1, 1.1, 0.1]} p={[0.5, 0.9, 0]} c={BEAM} line={0} />
        <Bx a={[1.2, 0.1, 0.1]} p={[0, 1.45, 0]} c={BEAM} line={0} />
      </T>
      {/* stone cottages up the hill */}
      {[[9.5, -2.5, -1.4], [-10, 3, 1.8], [4, 9.5, 3.2]].map(([dx, dz, r], i) => (
        <T key={i} town={2} dx={dx} dz={dz} rot={r}>
          <Cottage w={2.4} d={2.1} h={1.3} rh={1.1} wall="#b9b09a" wallPat={PAT.cobble} roof="#5b5f5a" beams={false} />
          <Smoke p={[0.5, 2.7, -0.3]} />
        </T>
      ))}
      <T town={2} dx={8.5} dz={-9}><Watchtower h={4.2} /></T>
    </group>
  )
}

// ----------------------------------------------------------------- Saltmere
function Boat({ p, r = 0, rock = 0 }: { p: V3; r?: number; rock?: number }) {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => { if (rock) g.current.rotation.z = Math.sin(clock.elapsedTime * 1.3 + p[0]) * rock })
  return (
    <group position={p} rotation={[0, r, 0]}>
      <group ref={g}>
        <Bx a={[0.9, 0.35, 2.4]} p={[0, 0.25, 0]} c="#7a5a3a" o={PAT.planks} line={0.025} />
        <Cn a={[0.45, 0.7, 4]} p={[0, 0.25, 1.5]} r={[Math.PI / 2, Math.PI / 4, 0]} s={[1, 1, 0.5]} c="#7a5a3a" line={0.02} />
        <Bx a={[0.06, 1.8, 0.06]} p={[0, 1.1, -0.2]} c={BEAM} line={0} />
        <Bx a={[0.04, 1.2, 0.9]} p={[0.05, 1.3, 0.2]} c="#efe2bd" line={0.02} />
      </group>
    </group>
  )
}

function Saltmere() {
  return (
    <group>
      {/* the pier runs out over the cliff edge, towards the sea */}
      <T town={3} dx={0} dz={0} rot={SALT_OUT}>
        <group position={[0, 0.25, 0]}>
          {Array.from({ length: 16 }, (_, i) => (
            <group key={i} position={[0, 0, 3 + i * 0.75]}>
              <Bx a={[1.5, 0.08, 0.68]} p={[0, 0, 0]} c="#b08a58" o={PAT.planksV} line={0.015} />
              {i % 3 === 0 && [-0.7, 0.7].map((x) => <Bx key={x} a={[0.14, 5, 0.14]} p={[x, -2.5, 0]} c={BEAM} line={0.02} />)}
            </group>
          ))}
          <Boat p={[1.6, -0.6, 13]} r={0.05} rock={0.06} />
          <Boat p={[-1.7, -0.7, 11]} r={-0.1} rock={0.05} />
          <Barrel p={[0.4, 0, 6]} />
          <Crate p={[-0.4, 0, 8]} r={0.3} fill="#9dbcb2" />
        </group>
        {/* lighthouse on the point */}
        <group position={[4.2, 0, 7]}>
          <Cy a={[0.55, 0.85, 4.4, 10]} p={[0, 2.2, 0]} c="#efe2bd" o={{ pat: 4, scale: 3, amt: 0.3 }} />
          {[1, 2.4, 3.6].map((y) => <Cy key={y} a={[0.8 - y * 0.06, 0.82 - y * 0.06, 0.3, 10]} p={[0, y, 0]} c="#8e3a34" line={0.02} />)}
          <Cy a={[0.5, 0.5, 0.7, 8]} p={[0, 4.75, 0]} c="#f3e9cb" line={0.02} />
          <mesh position={[0, 4.75, 0]}><sphereGeometry args={[0.3, 8, 8]} /><meshBasicMaterial color="#f8d878" /></mesh>
          <Cn a={[0.65, 0.7, 10]} p={[0, 5.45, 0]} c="#8e3a34" />
        </group>
      </T>
      {/* fish-drying racks and nets near the market */}
      <T town={3} dx={-2.4} dz={1.2} rot={0.5}>
        {[-0.9, 0.9].map((x) => <Bx key={x} a={[0.08, 1.4, 0.08]} p={[x, 0.7, 0]} c={BEAM} line={0} />)}
        <Bx a={[2, 0.05, 0.05]} p={[0, 1.35, 0]} c={BEAM} line={0} />
        {[-0.6, -0.2, 0.2, 0.6].map((x) => <Bx key={x} a={[0.12, 0.45, 0.04]} p={[x, 1.05, 0]} c="#c9b88e" line={0.01} />)}
      </T>
      <T town={3} dx={2.2} dz={-1.6} rot={-0.4}>
        <Bx a={[1.6, 0.05, 1.2]} p={[0, 0.03, 0]} r={[0, 0.2, 0]} c="#8a7a4a" o={{ pat: 1, scale: 12, aspect: 1, amt: 0.7 }} line={0} />
        <Barrel p={[1.1, 0, 0.5]} />
        <Barrel p={[1.3, 0, -0.3]} s={0.85} />
      </T>
      <T town={3} dx={0} dz={0}>
        <Cy a={[0.5, 0.55, 0.6, 10]} p={[0, 0.3, 0]} c="#a9a08a" o={PAT.cobble} />
        <Cn a={[0.7, 0.6, 6]} p={[0, 1.5, 0]} c="#6f5236" o={PAT.shingle} />
        {[-0.4, 0.4].map((x) => <Bx key={x} a={[0.08, 1, 0.08]} p={[x, 0.8, 0]} c={BEAM} line={0} />)}
      </T>
      {/* net huts and an upturned boat on the inland side */}
      {[[-9.5, -4, 1.1], [-3, -9.8, 0.2], [6.5, -8, -0.8]].map(([dx, dz, r], i) => (
        <T key={i} town={3} dx={dx} dz={dz} rot={r}>
          <Cottage w={2.1} d={1.9} h={1.15} rh={1.2} wall="#e6d3a8" wallPat={PAT.planksV} roof="#4f6b66" beams={false} chimney={i === 0} />
          {i === 0 && <Smoke p={[0.5, 2.6, -0.3]} />}
        </T>
      ))}
      <T town={3} dx={-6} dz={4} rot={1.2}>
        <group rotation={[Math.PI, 0, 0]} position={[0, 0.5, 0]}><Bx a={[0.9, 0.35, 2.4]} c="#7a5a3a" o={PAT.planks} line={0.025} /></group>
      </T>
      <Fence pts={[[TOWN_POS[3][0] - 8, TOWN_POS[3][1] + 2], [TOWN_POS[3][0] - 5, TOWN_POS[3][1] + 6]]} />
    </group>
  )
}

export default function TownDecor() {
  return (
    <group>
      <Oakhollow />
      <Ironcrag />
      <Saltmere />
    </group>
  )
}
