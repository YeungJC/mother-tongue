import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh } from 'three'
import { InkOpts, PAT } from './ink'
import { At, Blob, Bx, Cn, Cy, Gable, Ic, V3 } from './kit'
import { useGame } from '../store'
import { groundY } from '../terrain'
import { VillagerId } from '../world'

const BEAM = '#5a3d26'
const GLOW = '#ffd98a'

export function Smoke({ p }: { p: V3 }) {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    g.current.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.25 + i / 6) % 1
      c.position.set(Math.sin(t * 5 + i) * 0.3, t * 3.6, Math.cos(t * 4 + i) * 0.25)
      c.scale.setScalar(0.16 + t * 0.55)
      ;((c as Mesh).material as any).opacity = 0.9 * (1 - t)
    })
  })
  return (
    <group ref={g} position={p}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color="#fbf4dc" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Window({ p, r, shutter = '#4f6b66', box = true }: { p: V3; r?: V3; shutter?: string; box?: boolean }) {
  return (
    <group position={p} rotation={r}>
      <Bx a={[0.6, 0.62, 0.07]} c={BEAM} line={0.02} />
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.46, 0.48, 0.05]} />
        <meshBasicMaterial color={GLOW} />
      </mesh>
      <Bx a={[0.04, 0.48, 0.03]} p={[0, 0, 0.06]} c={BEAM} line={0} />
      <Bx a={[0.46, 0.04, 0.03]} p={[0, 0, 0.06]} c={BEAM} line={0} />
      <Bx a={[0.2, 0.58, 0.05]} p={[-0.42, 0, 0.02]} r={[0, 0.35, 0]} c={shutter} o={PAT.planksV} line={0.02} />
      <Bx a={[0.2, 0.58, 0.05]} p={[0.42, 0, 0.02]} r={[0, -0.35, 0]} c={shutter} o={PAT.planksV} line={0.02} />
      {box && (
        <group position={[0, -0.42, 0.12]}>
          <Bx a={[0.66, 0.14, 0.2]} c="#7a5a3a" line={0.02} />
          {[-0.22, 0, 0.22].map((x, i) => (
            <Ic key={i} a={[0.09, 0]} p={[x, 0.13, 0]} c={['#b5484a', '#f3e9cb', '#d9b24e'][i]} line={0} />
          ))}
          <Ic a={[0.12, 0]} p={[-0.1, 0.08, 0]} c="#6f7f45" line={0} />
          <Ic a={[0.12, 0]} p={[0.13, 0.08, 0]} c="#6f7f45" line={0} />
        </group>
      )}
    </group>
  )
}

function Lantern({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Bx a={[0.05, 0.05, 0.3]} p={[0, 0.22, -0.12]} c={BEAM} line={0} />
      <Bx a={[0.18, 0.05, 0.18]} p={[0, 0.14, 0]} c="#3a3a3a" line={0.015} />
      <mesh>
        <boxGeometry args={[0.14, 0.22, 0.14]} />
        <meshBasicMaterial color={GLOW} />
      </mesh>
      <Bx a={[0.18, 0.04, 0.18]} p={[0, -0.13, 0]} c="#3a3a3a" line={0.015} />
    </group>
  )
}

function Sign({ p, c }: { p: V3; c: string }) {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => (g.current.rotation.x = Math.sin(clock.elapsedTime * 1.8 + p[0]) * 0.18))
  return (
    <group position={p}>
      <Bx a={[0.07, 0.07, 0.75]} p={[0, 0, 0.3]} c={BEAM} line={0.02} />
      <group ref={g} position={[0, -0.04, 0.5]}>
        <Bx a={[0.06, 0.46, 0.5]} p={[0, -0.3, 0]} c="#e4d3a4" o={PAT.planksV} line={0.025} />
        <Cy a={[0.13, 0.13, 0.08, 10]} p={[0, -0.3, 0]} r={[0, 0, Math.PI / 2]} c={c} line={0.02} />
      </group>
    </group>
  )
}

interface CottageP {
  w?: number; d?: number; h?: number; rh?: number
  wall?: string; wallPat?: InkOpts; roof?: string; roofPat?: InkOpts
  beams?: boolean; chimney?: boolean; shutter?: string; sign?: string
  owner?: VillagerId
  children?: React.ReactNode
}

export function Cottage({
  w = 2.6, d = 2.4, h = 1.5, rh = 1.35, wall = '#efe2bd', wallPat, roof = '#9a4a3c', roofPat = PAT.shingle,
  beams = true, chimney = true, shutter, sign, owner, children,
}: CottageP) {
  const g = useRef<Group>(null!)
  const [hover, setHover] = useState(false)
  const select = useGame((s) => s.select)
  useFrame((_, dt) => {
    const s = hover && owner ? 1.05 : 1
    g.current.scale.lerp({ x: s, y: s, z: s } as any, 1 - Math.exp(-10 * dt))
  })
  const base = 0.35
  const top = base + h
  const hw = w / 2
  const ang = Math.atan2(rh, hw)
  const sl = Math.hypot(hw, rh) + 0.38
  const fz = d / 2
  return (
    <group
      ref={g}
      onClick={owner ? (e) => { e.stopPropagation(); select(owner) } : undefined}
      onPointerOver={owner ? (e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' } : undefined}
      onPointerOut={owner ? () => { setHover(false); document.body.style.cursor = '' } : undefined}
    >
      <Blob s={Math.max(w, d) * 0.95} />
      {/* stone footing, walls, gable ends */}
      <Bx a={[w + 0.24, 1.1, d + 0.24]} p={[0, -0.2, 0]} c="#b9b09a" o={PAT.cobble} />
      <Bx a={[w, h, d]} p={[0, base + h / 2, 0]} c={wall} o={wallPat} />
      <Gable w={w} h={rh} d={d} p={[0, top, 0]} c={wall} o={wallPat} />
      {beams && (
        <>
          {[[-hw, -fz], [hw, -fz], [-hw, fz], [hw, fz]].map(([x, z], i) => (
            <Bx key={i} a={[0.17, h, 0.17]} p={[x, base + h / 2, z]} c={BEAM} line={0.02} />
          ))}
          {[-1, 1].map((sgn) => (
            <group key={sgn}>
              <Bx a={[w + 0.12, 0.15, 0.09]} p={[0, top - 0.02, sgn * (fz + 0.02)]} c={BEAM} line={0.02} />
              <Bx a={[0.09, 0.15, d + 0.1]} p={[sgn * (hw + 0.02), top - 0.02, 0]} c={BEAM} line={0.02} />
              <Bx a={[0.09, 0.13, d]} p={[sgn * (hw + 0.02), base + h * 0.48, 0]} c={BEAM} line={0.02} />
              <Bx a={[0.08, h * 0.62, 0.1]} p={[sgn * (hw + 0.02), base + h * 0.25, d * 0.27]} r={[0.7, 0, 0]} c={BEAM} line={0} />
              <Bx a={[0.08, h * 0.62, 0.1]} p={[sgn * (hw + 0.02), base + h * 0.25, -d * 0.27]} r={[-0.7, 0, 0]} c={BEAM} line={0} />
              {/* king post and braces in the gable */}
              <Bx a={[0.1, rh * 0.8, 0.07]} p={[0, top + rh * 0.4, sgn * (fz + 0.02)]} c={BEAM} line={0} />
              <Bx a={[0.08, rh * 0.5, 0.07]} p={[-hw * 0.4, top + rh * 0.2, sgn * (fz + 0.02)]} r={[0, 0, -0.6]} c={BEAM} line={0} />
              <Bx a={[0.08, rh * 0.5, 0.07]} p={[hw * 0.4, top + rh * 0.2, sgn * (fz + 0.02)]} r={[0, 0, 0.6]} c={BEAM} line={0} />
            </group>
          ))}
        </>
      )}
      {/* roof: two overhanging slabs and a ridge cap */}
      {[-1, 1].map((sgn) => (
        <Bx
          key={sgn}
          a={[sl, 0.14, d + 0.7]}
          p={[sgn * Math.cos(ang) * (sl / 2 - 0.02), top + rh - Math.sin(ang) * (sl / 2 - 0.02) + 0.08, 0]}
          r={[0, 0, -sgn * ang]}
          c={roof}
          o={roofPat}
          line={0.04}
        />
      ))}
      <Bx a={[0.2, 0.2, d + 0.8]} p={[0, top + rh + 0.12, 0]} r={[0, 0, Math.PI / 4]} c={BEAM} line={0.025} />
      {/* door, step, lantern */}
      <Bx a={[0.78, 1.2, 0.08]} p={[-w * 0.16, base + 0.56, fz + 0.03]} c={BEAM} line={0.02} />
      <Bx a={[0.6, 1.05, 0.1]} p={[-w * 0.16, base + 0.52, fz + 0.05]} c="#8a5a36" o={PAT.planksV} line={0.02} />
      <Ic a={[0.045, 0]} p={[-w * 0.16 + 0.2, base + 0.5, fz + 0.12]} c="#d9b24e" line={0} />
      <Bx a={[1, 0.18, 0.5]} p={[-w * 0.16, base - 0.1, fz + 0.3]} c="#b9b09a" o={PAT.cobble} line={0.025} />
      <Bx a={[1.2, 0.16, 0.5]} p={[-w * 0.16, base - 0.27, fz + 0.62]} c="#a9a08a" o={PAT.cobble} line={0.025} />
      <Lantern p={[-w * 0.16 + 0.62, base + 1, fz + 0.2]} />
      {/* windows */}
      <Window p={[w * 0.25, base + h * 0.55, fz + 0.03]} shutter={shutter} />
      <Window p={[hw + 0.03, base + h * 0.55, d * 0.02]} r={[0, Math.PI / 2, 0]} shutter={shutter} box={false} />
      <Window p={[-hw - 0.03, base + h * 0.55, d * 0.02]} r={[0, -Math.PI / 2, 0]} shutter={shutter} box={false} />
      <Cy a={[0.2, 0.2, 0.08, 10]} p={[0, top + rh * 0.42, fz + 0.06]} r={[Math.PI / 2, 0, 0]} c={BEAM} line={0.02} />
      <mesh position={[0, top + rh * 0.42, fz + 0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.05, 10]} />
        <meshBasicMaterial color={GLOW} />
      </mesh>
      {chimney && (
        <>
          <Bx a={[0.46, rh + 0.7, 0.46]} p={[hw * 0.5, top + rh * 0.5 + 0.2, -d * 0.22]} c="#b9b09a" o={PAT.brick} />
          <Bx a={[0.6, 0.12, 0.6]} p={[hw * 0.5, top + rh + 0.6, -d * 0.22]} c="#8a8272" line={0.025} />
          <Smoke p={[hw * 0.5, top + rh + 0.8, -d * 0.22]} />
        </>
      )}
      {sign && <Sign p={[hw * 0.75, base + h + 0.1, fz + 0.1]} c={sign} />}
      {children}
    </group>
  )
}

/* ---------- props ---------- */

export function Barrel({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <group position={p} scale={s}>
      <Cy a={[0.24, 0.24, 0.56, 10]} p={[0, 0.28, 0]} c="#a87a48" o={PAT.planksV} line={0.03} />
      <Cy a={[0.265, 0.265, 0.05, 10]} p={[0, 0.14, 0]} c="#4a4a48" line={0} />
      <Cy a={[0.265, 0.265, 0.05, 10]} p={[0, 0.42, 0]} c="#4a4a48" line={0} />
    </group>
  )
}

export function Crate({ p, r = 0, fill }: { p: V3; r?: number; fill?: string }) {
  return (
    <group position={p} rotation={[0, r, 0]}>
      <Bx a={[0.5, 0.36, 0.5]} p={[0, 0.18, 0]} c="#c29a62" o={PAT.planks} line={0.03} />
      {fill && [[-0.12, -0.1], [0.12, -0.08], [0, 0.12], [-0.13, 0.13], [0.14, 0.12]].map(([x, z], i) => (
        <Ic key={i} a={[0.11, 0]} p={[x, 0.4, z]} c={fill} line={0.015} />
      ))}
    </group>
  )
}

export function Log({ p, r = [0, 0, 0], len = 1.5, rad = 0.2 }: { p: V3; r?: V3; len?: number; rad?: number }) {
  return (
    <group position={p} rotation={r}>
      <Cy a={[rad, rad, len, 8]} r={[Math.PI / 2, 0, 0]} c="#9a7448" o={PAT.planks} line={0.03} />
      <Cy a={[rad * 0.82, rad * 0.82, len + 0.02, 8]} r={[Math.PI / 2, 0, 0]} c="#e4c99a" line={0} />
    </group>
  )
}

export function Fence({ pts, y = 0 }: { pts: [number, number][]; y?: number }) {
  const out: React.ReactNode[] = []
  pts.forEach(([ax, az], i) => {
    if (i === pts.length - 1) return
    const [bx, bz] = pts[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / 0.75))
    const rot = Math.atan2(bx - ax, bz - az)
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n
      out.push(<Bx key={`p${i}-${k}`} a={[0.1, 0.62, 0.1]} p={[x, groundY(x, z) + 0.28 + y, z]} c="#8a6b45" line={0.02} />)
    }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, gy = groundY(mx, mz) + y
    out.push(<Bx key={`a${i}`} a={[0.05, 0.07, len]} p={[mx, gy + 0.44, mz]} r={[0, rot, 0]} c="#a88458" line={0} />)
    out.push(<Bx key={`b${i}`} a={[0.05, 0.07, len]} p={[mx, gy + 0.22, mz]} r={[0, rot, 0]} c="#a88458" line={0} />)
  })
  return <group>{out}</group>
}

function LampPost({ x, z }: { x: number; z: number }) {
  return (
    <At x={x} z={z}>
      <Cy a={[0.05, 0.07, 1.7, 6]} p={[0, 0.85, 0]} c="#3a3a3a" line={0.02} />
      <Bx a={[0.26, 0.05, 0.26]} p={[0, 1.95, 0]} c="#3a3a3a" line={0.015} />
      <mesh position={[0, 1.8, 0]}>
        <boxGeometry args={[0.18, 0.26, 0.18]} />
        <meshBasicMaterial color={GLOW} />
      </mesh>
      <Cn a={[0.2, 0.16, 4]} p={[0, 2.05, 0]} r={[0, Math.PI / 4, 0]} c="#3a3a3a" line={0.015} />
    </At>
  )
}

export function Stall({ x, z, rot, a, b, goods }: { x: number; z: number; rot: number; a: string; b: string; goods: string[] }) {
  return (
    <At x={x} z={z} rot={rot}>
      <Blob s={1.3} />
      {[[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]].map(([px, pz], i) => (
        <Bx key={i} a={[0.08, pz < 0 ? 1.7 : 1.4, 0.08]} p={[px, pz < 0 ? 0.85 : 0.7, pz]} c="#8a6b45" line={0.02} />
      ))}
      <Bx a={[1.7, 0.1, 0.9]} p={[0, 0.62, 0]} c="#c29a62" o={PAT.planks} line={0.03} />
      {Array.from({ length: 7 }, (_, i) => (
        <Bx key={i} a={[0.27, 0.05, 1.25]} p={[-0.81 + i * 0.27, 1.56, 0]} r={[0.3, 0, 0]} c={i % 2 ? a : b} line={0.02} />
      ))}
      {goods.map((c, i) => (
        <Ic key={i} a={[0.12, 0]} p={[-0.6 + (i % 5) * 0.3, 0.76 + (i > 4 ? 0.12 : 0), i > 4 ? -0.15 : 0.12]} c={c} line={0.015} />
      ))}
      <Crate p={[1.25, 0, 0.2]} r={0.4} fill={goods[0]} />
    </At>
  )
}

function Windmill() {
  const blades = useRef<Group>(null!)
  useFrame((_, dt) => (blades.current.rotation.z += dt * 0.7))
  return (
    <At x={-10.7} z={5.5} rot={0.9}>
      <Blob s={1.7} />
      <Cy a={[0.75, 1.15, 3.2, 8]} p={[0, 1.6, 0]} c="#e4d3a4" o={PAT.brick} />
      <Cy a={[1.2, 1.25, 0.3, 8]} p={[0, 0.15, 0]} c="#b9b09a" o={PAT.cobble} />
      <Cn a={[0.95, 1, 8]} p={[0, 3.7, 0]} c="#7a2e2a" o={PAT.shingle} />
      <Bx a={[0.5, 0.85, 0.1]} p={[0, 0.72, 1.08]} r={[-0.12, 0, 0]} c="#8a5a36" o={PAT.planksV} line={0.02} />
      <Window p={[0, 2.2, 0.9]} r={[-0.12, 0, 0]} box={false} />
      <Cy a={[0.1, 0.1, 0.6, 6]} p={[0, 3.2, 0.95]} r={[Math.PI / 2, 0, 0]} c={BEAM} line={0.02} />
      <group ref={blades} position={[0, 3.2, 1.25]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <Bx a={[0.08, 2.3, 0.06]} p={[0, 1.15, 0]} c={BEAM} line={0.02} />
            <Bx a={[0.55, 1.7, 0.03]} p={[0.3, 1.4, 0]} c="#f3e9cb" o={{ pat: 1, scale: 5, aspect: 1.2 }} line={0.025} />
          </group>
        ))}
        <Ic a={[0.16, 0]} c={BEAM} line={0.02} />
      </group>
    </At>
  )
}

function BellPost() {
  const bell = useRef<Group>(null!)
  const low = useGame((s) => s.timeLeft < 60 && s.phase === 'playing')
  useFrame(({ clock }) => (bell.current.rotation.z = Math.sin(clock.elapsedTime * (low ? 7 : 1.2)) * (low ? 0.5 : 0.08)))
  return (
    <At x={-4.9} z={-0.7} rot={0.5}>
      <Bx a={[0.14, 2.3, 0.14]} p={[-0.5, 1.15, 0]} c={BEAM} line={0.025} />
      <Bx a={[0.14, 2.3, 0.14]} p={[0.5, 1.15, 0]} c={BEAM} line={0.025} />
      <Bx a={[1.5, 0.14, 0.2]} p={[0, 2.3, 0]} c={BEAM} line={0.025} />
      <Bx a={[0.95, 0.1, 0.7]} p={[-0.3, 2.55, 0]} r={[0, 0, 0.5]} c="#7a5a3a" o={PAT.shingle} line={0.03} />
      <Bx a={[0.95, 0.1, 0.7]} p={[0.3, 2.55, 0]} r={[0, 0, -0.5]} c="#7a5a3a" o={PAT.shingle} line={0.03} />
      <group ref={bell} position={[0, 2.2, 0]}>
        <Cy a={[0.12, 0.3, 0.42, 10]} p={[0, -0.3, 0]} c="#d9b24e" line={0.03} />
        <Ic a={[0.07, 0]} p={[0, -0.55, 0]} c="#3a3a3a" line={0} />
      </group>
    </At>
  )
}

function Well() {
  return (
    <At x={-3.4} z={0.6}>
      <Blob s={1.1} />
      <Cy a={[0.62, 0.68, 0.62, 12]} p={[0, 0.31, 0]} c="#b9b09a" o={PAT.cobble} />
      <Cy a={[0.5, 0.5, 0.04, 12]} p={[0, 0.6, 0]} c="#5f7f78" line={0} />
      <Bx a={[0.1, 1.3, 0.1]} p={[-0.58, 1, 0]} c={BEAM} line={0.02} />
      <Bx a={[0.1, 1.3, 0.1]} p={[0.58, 1, 0]} c={BEAM} line={0.02} />
      <Cy a={[0.07, 0.07, 1.4, 6]} p={[0, 1.4, 0]} r={[0, 0, Math.PI / 2]} c="#8a6b45" line={0.02} />
      <Bx a={[0.02, 0.5, 0.02]} p={[0, 1.15, 0]} c="#3a3a3a" line={0} />
      <Cy a={[0.13, 0.1, 0.2, 8]} p={[0, 0.9, 0]} c="#a87a48" line={0.02} />
      <Bx a={[0.95, 0.08, 1]} p={[-0.38, 1.85, 0]} r={[0, 0, 0.55]} c="#8e4a3a" o={PAT.shingle} line={0.03} />
      <Bx a={[0.95, 0.08, 1]} p={[0.38, 1.85, 0]} r={[0, 0, -0.55]} c="#8e4a3a" o={PAT.shingle} line={0.03} />
    </At>
  )
}

function Forge() {
  const fire = useRef<Mesh>(null!)
  useFrame(({ clock }) => fire.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 11) * 0.12))
  return (
    <group position={[-2.3, 0, 0.6]}>
      {/* lean-to */}
      {[[-0.7, 0.9], [0.7, 0.9]].map(([x, z], i) => (
        <Bx key={i} a={[0.12, 1.6, 0.12]} p={[x, 0.8, z]} c={BEAM} line={0.02} />
      ))}
      <Bx a={[1.9, 0.1, 1.5]} p={[0, 1.75, 0.3]} r={[0.3, 0, 0]} c="#5b5f5a" o={PAT.shingle} line={0.03} />
      <Bx a={[1, 0.7, 0.8]} p={[0, 0.35, -0.1]} c="#a9a08a" o={PAT.brick} />
      <mesh ref={fire} position={[0, 0.78, -0.1]}>
        <icosahedronGeometry args={[0.24, 0]} />
        <meshBasicMaterial color="#f08a2e" />
      </mesh>
      <Ic a={[0.14, 0]} p={[0.25, 0.74, 0]} c="#3a3a3a" line={0} />
      <Ic a={[0.12, 0]} p={[-0.25, 0.74, -0.2]} c="#3a3a3a" line={0} />
      {/* anvil on a stump */}
      <Cy a={[0.22, 0.26, 0.4, 8]} p={[0.2, 0.2, 1.3]} c="#9a7448" o={PAT.planksV} line={0.03} />
      <Bx a={[0.5, 0.14, 0.2]} p={[0.2, 0.52, 1.3]} c="#4a4a48" line={0.025} />
      <Bx a={[0.22, 0.12, 0.16]} p={[0.2, 0.42, 1.3]} c="#4a4a48" line={0} />
      <Cn a={[0.08, 0.26, 6]} p={[0.55, 0.52, 1.3]} r={[0, 0, -Math.PI / 2]} c="#4a4a48" line={0.02} />
      {/* quench barrel, tool rack, grindstone */}
      <Barrel p={[-0.9, 0, 1.4]} />
      <Bx a={[0.9, 0.06, 0.06]} p={[1.3, 0.9, 0.6]} r={[0, 0.5, 0]} c={BEAM} line={0} />
      {[0, 1, 2].map((i) => (
        <Bx key={i} a={[0.05, 0.6, 0.05]} p={[1.05 + i * 0.25, 0.6, 0.75 - i * 0.14]} c={i === 1 ? '#8b9090' : '#8a6b45'} line={0.015} />
      ))}
      <Cy a={[0.3, 0.3, 0.1, 12]} p={[1.6, 0.4, 1.5]} r={[Math.PI / 2, 0, 0]} c="#b9b09a" o={PAT.cobble} line={0.03} />
      <Bx a={[0.1, 0.4, 0.3]} p={[1.6, 0.2, 1.5]} c={BEAM} line={0.02} />
    </group>
  )
}

function Flag({ p, c }: { p: V3; c: string }) {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    g.current.children.forEach((s, i) => (s.rotation.y = Math.sin(clock.elapsedTime * 3 - i * 0.9) * 0.35))
  })
  return (
    <group position={p}>
      <Cy a={[0.03, 0.03, 1.2, 5]} p={[0, 0.6, 0]} c={BEAM} line={0.015} />
      <group ref={g} position={[0, 1, 0]}>
        {[0, 1, 2].map((i) => (
          <group key={i}>
            <Bx a={[0.26, 0.34 - i * 0.07, 0.02]} p={[0.14 + i * 0.25, 0, 0]} c={c} line={0.02} />
          </group>
        ))}
      </group>
    </group>
  )
}

/* ---------- the village ---------- */

export default function Buildings() {
  return (
    <group>
      {/* lumber camp */}
      <At x={-9.5} z={-5.2} rot={0.35}>
        <Cottage w={2.7} d={2.3} h={1.4} wall="#c9a26b" wallPat={PAT.planks} roof="#6f5236" beams={false} shutter="#8e3a34" sign="#5e6b3a" owner="lumberjack" />
        <group position={[2.3, 0, 0.8]}>
          {[[0, 0.2, 0], [0.42, 0.2, 0], [0.84, 0.2, 0], [0.21, 0.56, 0], [0.63, 0.56, 0], [0.42, 0.92, 0]].map((p, i) => (
            <Log key={i} p={p as V3} len={1.6} />
          ))}
          <Bx a={[0.08, 0.9, 0.08]} p={[-0.3, 0.45, 0.4]} c={BEAM} line={0} />
          <Bx a={[0.08, 0.9, 0.08]} p={[1.14, 0.45, 0.4]} c={BEAM} line={0} />
        </group>
        {/* chopping block with axe */}
        <group position={[1.4, 0, 2.3]}>
          <Cy a={[0.32, 0.36, 0.42, 9]} p={[0, 0.21, 0]} c="#9a7448" o={PAT.planksV} />
          <Cy a={[0.26, 0.26, 0.43, 9]} p={[0, 0.215, 0]} c="#e4c99a" line={0} />
          <Bx a={[0.05, 0.75, 0.05]} p={[0.12, 0.7, 0]} r={[0, 0, -0.5]} c="#8a6b45" line={0.015} />
          <Bx a={[0.26, 0.2, 0.05]} p={[-0.08, 0.5, 0]} r={[0, 0, -0.5]} c="#8b9090" line={0.02} />
          <Log p={[0.7, 0.14, 0.3]} r={[0, 0.8, 0]} len={0.6} rad={0.14} />
          <Log p={[-0.6, 0.14, 0.4]} r={[0, -0.4, 0]} len={0.6} rad={0.14} />
        </group>
        {/* sawhorse */}
        <group position={[-2.2, 0, 1.6]} rotation={[0, 0.6, 0]}>
          {[-0.5, 0.5].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <Bx a={[0.07, 0.9, 0.07]} p={[-0.2, 0.38, 0]} r={[0, 0, -0.4]} c="#8a6b45" line={0.015} />
              <Bx a={[0.07, 0.9, 0.07]} p={[0.2, 0.38, 0]} r={[0, 0, 0.4]} c="#8a6b45" line={0.015} />
            </group>
          ))}
          <Log p={[0, 0.72, 0]} len={1.9} rad={0.17} />
        </group>
      </At>
      {[[-6.6, -5.4], [-11.9, -3.6], [-7.3, -1.6], [-10.6, -1.2]].map(([x, z], i) => (
        <At key={i} x={x} z={z}>
          <Cy a={[0.28, 0.34, 0.3, 8]} p={[0, 0.15, 0]} c="#9a7448" o={PAT.planksV} line={0.03} />
          <Cy a={[0.23, 0.23, 0.31, 8]} p={[0, 0.155, 0]} c="#e4c99a" line={0} />
        </At>
      ))}

      {/* smithy */}
      <At x={-1} z={-5.6} rot={-0.2}>
        <Cottage w={3} d={2.5} h={1.6} wall="#cfc8b2" wallPat={PAT.cobble} roof="#5b5f5a" beams={false} shutter="#7a2e2a" sign="#4a4a48" owner="blacksmith">
          <Forge />
        </Cottage>
      </At>

      {/* farmstead */}
      <At x={-9.5} z={2.6} rot={0.25}>
        <Cottage w={3} d={2.7} h={1.7} rh={1.6} wall="#b5584a" wallPat={PAT.planksV} roof="#d2b062" roofPat={PAT.thatch} beams={false} chimney={false} shutter="#f3e9cb" sign="#d9b24e" owner="farmer">
          <Bx a={[0.7, 0.6, 0.08]} p={[0, 2.5, 1.38]} c="#8a5a36" o={PAT.planksV} line={0.02} />
          <Bx a={[0.5, 0.06, 0.5]} p={[0, 2.95, 1.6]} c={BEAM} line={0} />
        </Cottage>
        {/* hay and cart */}
        <Ic a={[0.6, 1]} p={[2.4, 0.4, 0.2]} s={[1, 0.85, 1]} c="#d9b24e" o={PAT.thatch} />
        <Ic a={[0.45, 1]} p={[2.9, 0.3, 1]} s={[1, 0.85, 1]} c="#d2a843" o={PAT.thatch} />
        <group position={[-0.4, 0, 2.9]} rotation={[0, 0.5, 0]}>
          <Bx a={[1.3, 0.3, 0.8]} p={[0, 0.5, 0]} c="#a87a48" o={PAT.planks} />
          <Cy a={[0.32, 0.32, 0.08, 10]} p={[0.3, 0.32, 0.46]} r={[Math.PI / 2, 0, 0]} c="#8a6b45" line={0.03} />
          <Cy a={[0.32, 0.32, 0.08, 10]} p={[0.3, 0.32, -0.46]} r={[Math.PI / 2, 0, 0]} c="#8a6b45" line={0.03} />
          <Bx a={[0.9, 0.06, 0.06]} p={[-1, 0.42, 0.3]} c="#8a6b45" line={0} />
          <Bx a={[0.9, 0.06, 0.06]} p={[-1, 0.42, -0.3]} c="#8a6b45" line={0} />
          <Ic a={[0.3, 0]} p={[-0.2, 0.8, 0]} c="#d9b24e" o={PAT.thatch} line={0.02} />
          <Ic a={[0.26, 0]} p={[0.3, 0.76, 0.1]} c="#d28a3a" line={0.02} />
        </group>
      </At>
      <Windmill />
      <Fence pts={[[-8.8, 4.65], [-3.1, 4.65], [-3.1, 7.6]]} />
      {/* sheep pen */}
      <Fence pts={[[-12.6, -0.3], [-9.9, -0.3], [-9.9, 1.3], [-12.6, 1.3]]} />

      {/* builder's yard */}
      <At x={2} z={4.9} rot={-0.35}>
        <Cottage w={2.4} d={2.1} h={1.35} rh={1.15} wall="#efe2bd" roof="#c29a45" shutter="#4f6b66" sign="#c29a45" owner="builder" />
        {[0, 1, 2, 3].map((i) => (
          <Bx key={i} a={[1.7, 0.13, 0.42]} p={[2.1, 0.08 + i * 0.14, -0.4 + (i % 2) * 0.1]} r={[0, 0.25 + i * 0.08, 0]} c={i % 2 ? '#b08a58' : '#c9a26b'} o={PAT.planks} line={0.025} />
        ))}
        {[[1.9, 0.2, 1.3], [2.45, 0.2, 1.25], [2.15, 0.6, 1.3]].map((p, i) => (
          <Bx key={i} a={[0.5, 0.4, 0.5]} p={p as V3} r={[0, i * 0.3, 0]} c="#b9b09a" o={PAT.cobble} line={0.03} />
        ))}
        {/* ladder against the wall */}
        <group position={[-1.5, 0, 0.4]} rotation={[0, 0, -0.22]}>
          <Bx a={[0.06, 2.4, 0.06]} p={[0, 1.2, -0.22]} c="#8a6b45" line={0.015} />
          <Bx a={[0.06, 2.4, 0.06]} p={[0, 1.2, 0.22]} c="#8a6b45" line={0.015} />
          {[0.4, 0.8, 1.2, 1.6, 2].map((y) => <Bx key={y} a={[0.05, 0.05, 0.44]} p={[0, y, 0]} c="#a88458" line={0} />)}
        </group>
        {/* wheelbarrow */}
        <group position={[0.4, 0, 2.4]} rotation={[0, 1, 0]}>
          <Bx a={[0.7, 0.26, 0.5]} p={[0, 0.4, 0]} c="#8e3a34" line={0.025} />
          <Cy a={[0.18, 0.18, 0.07, 9]} p={[0.5, 0.18, 0]} r={[Math.PI / 2, 0, 0]} c="#4a4a48" line={0.02} />
          <Bx a={[0.7, 0.05, 0.05]} p={[-0.6, 0.45, 0.2]} c="#8a6b45" line={0} />
          <Bx a={[0.7, 0.05, 0.05]} p={[-0.6, 0.45, -0.2]} c="#8a6b45" line={0} />
        </group>
      </At>

      {/* the square */}
      <Well />
      <BellPost />
      <Stall x={-2} z={2.6} rot={-0.5} a="#8e3a34" b="#f3e9cb" goods={['#d28a3a', '#b5484a', '#8aa04e', '#d9b24e', '#b5484a', '#8aa04e', '#d28a3a']} />
      <Stall x={-5.4} z={-0.2 + 2.9} rot={2.4} a="#4f6b66" b="#f3e9cb" goods={['#e4c99a', '#d9b24e', '#e4c99a', '#c29a62', '#d9b24e', '#e4c99a']} />
      <At x={-1.4} z={-0.6}><Barrel p={[0, 0, 0]} /><Barrel p={[0.5, 0, 0.25]} s={0.85} /><Crate p={[-0.5, 0, 0.4]} r={0.5} fill="#b5484a" /></At>
      <At x={-4.4} z={2.1} rot={0.9}>
        <Bx a={[1.2, 0.08, 0.36]} p={[0, 0.36, 0]} c="#a87a48" o={PAT.planks} line={0.025} />
        <Bx a={[0.08, 0.36, 0.3]} p={[-0.45, 0.18, 0]} c="#8a6b45" line={0} />
        <Bx a={[0.08, 0.36, 0.3]} p={[0.45, 0.18, 0]} c="#8a6b45" line={0} />
      </At>
      {[[-2.2, -1.2], [-5.2, 1.6], [0.6, 1.2], [3.6, -1], [-7.6, -2.4], [-6.6, 3.8], [9.4, 0.9]].map(([x, z], i) => <LampPost key={i} x={x} z={z} />)}

      {/* the market town across the river */}
      <At x={10.7} z={-2.2} rot={-0.6} s={0.85}><Cottage w={2.3} d={2} wall="#efe2bd" roof="#8e3a34" shutter="#4f6b66" /></At>
      <At x={11.6} z={2.3} rot={0.5} s={0.8}><Cottage w={2.2} d={2} h={1.8} wall="#e4d3a4" roof="#4f6b66" shutter="#7a2e2a" /></At>
      <At x={9.6} z={4.4} rot={0.2} s={0.7}><Cottage w={2.2} d={1.9} wall="#efe2bd" roof="#c29a45" chimney={false} /></At>
      <At x={12.2} z={-0.2}>
        <Blob s={1.3} />
        <Cy a={[0.8, 0.95, 3.6, 9]} p={[0, 1.8, 0]} c="#cfc8b2" o={PAT.brick} />
        <Cy a={[1, 1, 0.35, 9]} p={[0, 3.7, 0]} c="#b9b09a" o={PAT.cobble} />
        <Cn a={[0.95, 1.3, 9]} p={[0, 4.5, 0]} c="#7a2e2a" o={PAT.shingle} />
        <Window p={[0, 2.4, 0.86]} box={false} shutter="#7a2e2a" />
        <Bx a={[0.5, 0.9, 0.1]} p={[0, 0.45, 0.93]} c="#8a5a36" o={PAT.planksV} line={0.02} />
        <Flag p={[0, 5.1, 0]} c="#d9b24e" />
      </At>
      <At x={9} z={-0.8} rot={0.3}>
        <Bx a={[0.1, 1.5, 0.1]} p={[0, 0.75, 0]} c={BEAM} line={0.02} />
        <Bx a={[0.8, 0.22, 0.06]} p={[0.3, 1.3, 0]} c="#e4d3a4" o={PAT.planks} line={0.025} />
        <Bx a={[0.7, 0.2, 0.06]} p={[-0.25, 1, 0]} r={[0, 0.5, 0]} c="#e4d3a4" o={PAT.planks} line={0.025} />
      </At>
    </group>
  )
}
