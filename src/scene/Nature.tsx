import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Group, InstancedMesh, Mesh, Object3D } from 'three'
import { ink, inkUniforms, PAT } from './ink'
import { At, Blob, Bx, Cn, Cy, Ic, V3 } from './kit'
import { groundY, hash2, pathDist, riverX, scatter } from '../terrain'

/* keep-out zones: [x, z, radius] */
const SITES: V3[] = [
  [-9.5, -5.2, 3.4], [-1, -5.6, 3.6], [-9.5, 2.6, 3.4], [2, 4.9, 3.4], [-3.4, 0.6, 3], [-10.7, 5.5, 1.9],
  [10.7, -2.2, 1.9], [11.6, 2.3, 1.9], [9.6, 4.4, 1.7], [12.2, -0.2, 1.6], [-2, 2.6, 1.6], [-5.4, 2.7, 1.6],
]
const inField = (x: number, z: number) => (x > -9.3 && x < -2.8 && z > 4.4 && z < 8.5) || (x > -12.9 && x < -9.6 && z > -0.6 && z < 1.6)
const open = (pad = 0) => (x: number, z: number) =>
  !inField(x, z) && pathDist(x, z) > 0.8 + pad && SITES.every(([sx, sz, r]) => Math.hypot(x - sx, z - sz) > r + pad)

/* ---------- trees ---------- */

const LEAF = ['#5e6b3a', '#6f7f45', '#84904f', '#7d8a4a', '#b08a3a', '#a8623a']

function Tree({ x, z, k, i }: { x: number; z: number; k: number; i: number }) {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    g.current.rotation.z = Math.sin(clock.elapsedTime * 1.1 + i) * 0.04
    g.current.rotation.x = Math.cos(clock.elapsedTime * 0.9 + i * 2) * 0.03
  })
  const s = 0.62 + k * 0.45
  const leaf = LEAF[Math.floor(hash2(i, 4) * (hash2(i, 9) > 0.8 ? 6 : 4))]
  const kind = i % 3
  return (
    <At x={x} z={z} s={s} rot={k * 6}>
      <Blob s={1.05} />
      <group ref={g}>
        {kind === 0 && (
          <>
            <Cy a={[0.14, 0.22, 1.3, 7]} p={[0, 0.65, 0]} c="#6b4a2b" o={PAT.planksV} line={0.03} />
            <Bx a={[0.07, 0.5, 0.07]} p={[0.2, 1, 0]} r={[0, 0, -0.8]} c="#6b4a2b" line={0} />
            <Ic a={[0.85, 1]} p={[0, 1.9, 0]} c={leaf} o={PAT.leaves} />
            <Ic a={[0.6, 1]} p={[0.65, 1.55, 0.15]} c={leaf} o={PAT.leaves} />
            <Ic a={[0.55, 1]} p={[-0.6, 1.6, -0.2]} c={leaf} o={PAT.leaves} />
            <Ic a={[0.5, 1]} p={[0.1, 2.55, -0.1]} c={leaf} o={PAT.leaves} />
          </>
        )}
        {kind === 1 && (
          <>
            <Cy a={[0.12, 0.18, 0.9, 6]} p={[0, 0.45, 0]} c="#6b4a2b" line={0.03} />
            <Cn a={[0.95, 1.3, 8]} p={[0, 1.3, 0]} c={leaf} o={PAT.leaves} />
            <Cn a={[0.75, 1.15, 8]} p={[0, 2.05, 0]} c={leaf} o={PAT.leaves} />
            <Cn a={[0.5, 1, 8]} p={[0, 2.8, 0]} c={leaf} o={PAT.leaves} />
          </>
        )}
        {kind === 2 && (
          <>
            <Cy a={[0.09, 0.13, 1.9, 6]} p={[0, 0.95, 0]} c="#e9e0c8" o={{ pat: 1, scale: 5, aspect: 0.5, amt: 0.7 }} line={0.03} />
            <Ic a={[0.6, 1]} p={[0, 2.2, 0]} s={[1, 1.35, 1]} c={leaf} o={PAT.leaves} />
            <Ic a={[0.4, 1]} p={[0.35, 1.7, 0.1]} c={leaf} o={PAT.leaves} />
          </>
        )}
      </group>
    </At>
  )
}

function Trees() {
  const pts = useMemo(
    () => scatter(58, 3, (x, z) => open(0.7)(x, z) && (x < -5.5 && z < -1.5 ? true : Math.hypot(x + 3, z) > 6.5 && hash2(x * 3, z * 3) < 0.5)),
    [],
  )
  return <group>{pts.map(([x, z, k], i) => <Tree key={i} x={x} z={z} k={k} i={i} />)}</group>
}

/* ---------- small scatter ---------- */

function Bushes() {
  const pts = useMemo(() => scatter(30, 11, open(0.2)), [])
  return (
    <group>
      {pts.map(([x, z, k], i) => (
        <At key={i} x={x} z={z} s={0.6 + k * 0.5} rot={k * 5}>
          <Ic a={[0.42, 1]} p={[0, 0.3, 0]} c={LEAF[i % 4]} o={PAT.leaves} />
          <Ic a={[0.3, 1]} p={[0.36, 0.22, 0.1]} c={LEAF[(i + 1) % 4]} o={PAT.leaves} />
          {i % 3 === 0 && [[0.1, 0.55, 0.25], [-0.2, 0.4, 0.3], [0.3, 0.35, 0.3]].map((p, j) => (
            <Ic key={j} a={[0.06, 0]} p={p as V3} c="#b5484a" line={0} />
          ))}
        </At>
      ))}
    </group>
  )
}

function Rocks() {
  const pts = useMemo(() => scatter(24, 23, open(0)), [])
  return (
    <group>
      {pts.map(([x, z, k], i) => (
        <At key={i} x={x} z={z} rot={k * 9}>
          <Ic a={[0.22 + k * 0.3, 0]} p={[0, 0.1, 0]} s={[1.2, 0.7, 1]} c={i % 2 ? '#b9b09a' : '#a9a08a'} />
          {i % 4 === 0 && <Ic a={[0.14, 0]} p={[0.35, 0.05, 0.1]} c="#b9b09a" line={0.025} />}
        </At>
      ))}
      {/* stones standing in the river */}
      {[[-6, 0.5], [-3.2, -0.6], [3, 0.4], [5.6, -0.5], [7.2, 0.2]].map(([z, dx], i) => (
        <Ic key={i} a={[0.3, 0]} p={[riverX(z) + dx, -0.3, z]} s={[1.3, 0.6, 1]} c="#a9a08a" />
      ))}
      {/* lily pads */}
      {[[-5, -0.4], [-4.5, 0.3], [2, -0.5], [4.6, 0.6], [6.4, -0.3]].map(([z, dx], i) => (
        <Cy key={i} a={[0.22, 0.22, 0.02, 9]} p={[riverX(z) + dx, -0.27, z]} c="#7d8a4a" line={0.02} />
      ))}
    </group>
  )
}

function Instances({ pts, color, tint, children, y = 0, scale = [1, 1, 1] }: { pts: [number, number, number][]; color: string; tint?: string[]; children: React.ReactNode; y?: number; scale?: V3 }) {
  const ref = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const o = new Object3D()
    const c = new Color()
    pts.forEach(([x, z, k], i) => {
      o.position.set(x, groundY(x, z) + y, z)
      o.rotation.set((k - 0.5) * 0.4, k * 20, (hash2(k, i) - 0.5) * 0.4)
      const s = 0.7 + k * 0.7
      o.scale.set(scale[0] * s, scale[1] * s, scale[2] * s)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
      if (tint) ref.current.setColorAt(i, c.set(tint[Math.floor(hash2(i, k * 7) * tint.length)]))
      else ref.current.setColorAt(i, c.setScalar(0.85 + k * 0.3))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [pts])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]} material={ink(color)} frustumCulled={false}>
      {children}
    </instancedMesh>
  )
}

function Meadow() {
  const grass = useMemo(() => scatter(900, 31, (x, z) => pathDist(x, z) > 0.55 && !inField(x, z)), [])
  const flowers = useMemo(() => scatter(260, 47, open(-0.4)), [])
  const reeds = useMemo(() => {
    const out: [number, number, number][] = []
    for (let z = -8.2; z < 8.2; z += 0.28) {
      const k = hash2(z, 5)
      if (k < 0.35 || Math.abs(z) < 1.3) continue
      const side = hash2(z, 9) > 0.5 ? 1 : -1
      out.push([riverX(z) + side * (1.25 + k * 0.45), z, k])
    }
    return out
  }, [])
  return (
    <group>
      <Instances pts={grass} color="#8fa05a" y={0.12}>
        <coneGeometry args={[0.06, 0.34, 3]} />
      </Instances>
      <Instances pts={flowers} color="#ffffff" tint={['#f3e9cb', '#b5484a', '#d9b24e', '#8e6aa0', '#f3e9cb', '#e0a0a0']} y={0.2} scale={[1, 0.6, 1]}>
        <icosahedronGeometry args={[0.075, 0]} />
      </Instances>
      <Instances pts={reeds} color="#7d8a4a" y={0.45}>
        <cylinderGeometry args={[0.015, 0.03, 1, 4]} />
      </Instances>
      <Instances pts={reeds} color="#6b4a2b" y={0.95}>
        <cylinderGeometry args={[0.045, 0.045, 0.22, 5]} />
      </Instances>
    </group>
  )
}

/* ---------- farm crops ---------- */

function Crops() {
  const wheat = useMemo(() => {
    const out: [number, number, number][] = []
    for (let r = 0; r < 3; r++) for (let c = 0; c < 22; c++) out.push([-8.4 + c * 0.23, 5.15 + r * 0.42, hash2(c, r)])
    return out
  }, [])
  const y = groundY(-6, 6.5)
  return (
    <group>
      <Bx a={[5.4, 0.16, 2.7]} p={[-5.95, y + 0.02, 6.15]} c="#a8825a" o={PAT.furrow} line={0.03} />
      <Instances pts={wheat} color="#d9b24e" y={0.42} scale={[1, 1.5, 1]}>
        <coneGeometry args={[0.08, 0.6, 4]} />
      </Instances>
      {Array.from({ length: 9 }, (_, i) => (
        <Ic key={i} a={[0.2, 1]} p={[-8.2 + i * 0.56, y + 0.24, 6.45]} s={[1, 0.8, 1]} c="#8aa04e" o={PAT.leaves} line={0.025} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i} position={[-8.1 + i * 0.75, y + 0.26, 6.95 + (i % 2) * 0.25]}>
          <Ic a={[0.23, 1]} s={[1, 0.75, 1]} c="#d28a3a" o={{ pat: 6, scale: 7, amt: 0.4 }} line={0.025} />
          <Cy a={[0.03, 0.03, 0.12, 4]} p={[0, 0.2, 0]} c="#5e6b3a" line={0} />
        </group>
      ))}
      {/* scarecrow */}
      <group position={[-4.1, y, 6.2]} rotation={[0, -0.5, 0]}>
        <Bx a={[0.08, 1.7, 0.08]} p={[0, 0.85, 0]} c="#8a6b45" line={0.02} />
        <Bx a={[1.2, 0.08, 0.08]} p={[0, 1.25, 0]} c="#8a6b45" line={0.02} />
        <Bx a={[0.55, 0.6, 0.2]} p={[0, 1.1, 0]} c="#8e3a34" o={PAT.planksV} line={0.03} />
        <Ic a={[0.2, 1]} p={[0, 1.62, 0]} c="#e4c99a" line={0.03} />
        <Cy a={[0.1, 0.36, 0.14, 9]} p={[0, 1.8, 0]} c="#d9b24e" o={PAT.thatch} line={0.03} />
      </group>
    </group>
  )
}

/* ---------- animals ---------- */

function useWander(home: [number, number], radius: number, speed: number, seed: number) {
  const g = useRef<Group>(null!)
  const st = useRef({ x: home[0], z: home[1], tx: home[0], tz: home[1], wait: seed % 3, yaw: seed, moving: false })
  useFrame((_, dt) => {
    const s = st.current
    const dx = s.tx - s.x, dz = s.tz - s.z
    const d = Math.hypot(dx, dz)
    s.moving = false
    if (s.wait > 0) s.wait -= dt
    else if (d < 0.05) {
      s.wait = 1 + Math.random() * 4
      const a = Math.random() * 6.28, r = Math.random() * radius
      s.tx = home[0] + Math.cos(a) * r; s.tz = home[1] + Math.sin(a) * r
    } else {
      s.moving = true
      s.x += (dx / d) * Math.min(d, speed * dt); s.z += (dz / d) * Math.min(d, speed * dt)
      s.yaw = Math.atan2(dx, dz)
    }
    g.current.position.set(s.x, groundY(s.x, s.z), s.z)
    let dy = s.yaw - g.current.rotation.y
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    g.current.rotation.y += dy * (1 - Math.exp(-6 * dt))
  })
  return { g, st }
}

function Chicken({ home, i }: { home: [number, number]; i: number }) {
  const { g, st } = useWander(home, 1.3, 0.9, i * 1.7)
  const head = useRef<Group>(null!)
  useFrame(({ clock }) => {
    head.current.rotation.x = st.current.moving ? Math.sin(clock.elapsedTime * 14) * 0.25 : Math.max(0, Math.sin(clock.elapsedTime * 3 + i * 2)) * 0.9
  })
  return (
    <group ref={g}>
      <Ic a={[0.17, 1]} p={[0, 0.22, 0]} s={[0.85, 0.9, 1.15]} c={i % 2 ? '#f3e9cb' : '#c9825a'} line={0.025} />
      <Cn a={[0.08, 0.2, 4]} p={[0, 0.3, -0.22]} r={[-1, 0, 0]} c={i % 2 ? '#e4d3a4' : '#8a5a36'} line={0.02} />
      <group ref={head} position={[0, 0.34, 0.12]}>
        <Ic a={[0.09, 0]} p={[0, 0.08, 0.04]} c={i % 2 ? '#f3e9cb' : '#c9825a'} line={0.02} />
        <Cn a={[0.03, 0.08, 4]} p={[0, 0.08, 0.15]} r={[Math.PI / 2, 0, 0]} c="#d9b24e" line={0} />
        <Bx a={[0.03, 0.07, 0.08]} p={[0, 0.18, 0.04]} c="#b5484a" line={0} />
      </group>
      <Bx a={[0.02, 0.12, 0.02]} p={[-0.05, 0.06, 0]} c="#d9b24e" line={0} />
      <Bx a={[0.02, 0.12, 0.02]} p={[0.05, 0.06, 0]} c="#d9b24e" line={0} />
    </group>
  )
}

function Sheep({ home, i }: { home: [number, number]; i: number }) {
  const { g, st } = useWander(home, 0.9, 0.35, i * 2.3)
  const head = useRef<Group>(null!)
  useFrame(({ clock }) => {
    head.current.rotation.x = st.current.moving ? 0 : 0.5 + Math.sin(clock.elapsedTime * 4 + i) * 0.12
  })
  return (
    <group ref={g}>
      <Blob s={0.5} />
      <Ic a={[0.36, 1]} p={[0, 0.5, 0]} s={[0.9, 0.85, 1.25]} c="#f3ead2" o={{ ...PAT.leaves, scale: 5 }} />
      <group ref={head} position={[0, 0.58, 0.42]}>
        <Bx a={[0.2, 0.22, 0.28]} p={[0, 0, 0.1]} c="#4a3d32" line={0.025} />
        <Bx a={[0.08, 0.05, 0.1]} p={[-0.14, 0.06, 0.02]} c="#4a3d32" line={0} />
        <Bx a={[0.08, 0.05, 0.1]} p={[0.14, 0.06, 0.02]} c="#4a3d32" line={0} />
      </group>
      {[[-0.15, 0.28], [0.15, 0.28], [-0.15, -0.28], [0.15, -0.28]].map(([x, z], k) => (
        <Bx key={k} a={[0.07, 0.3, 0.07]} p={[x, 0.15, z]} c="#4a3d32" line={0} />
      ))}
    </group>
  )
}

function Duck({ z0, i }: { z0: number; i: number }) {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.25 + i * 2
    const z = z0 + Math.sin(t) * 2.2
    g.current.position.set(riverX(z) + Math.sin(t * 2.3 + i) * 0.5, -0.26 + Math.sin(clock.elapsedTime * 2 + i) * 0.015, z)
    g.current.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI
  })
  return (
    <group ref={g}>
      <Ic a={[0.16, 1]} p={[0, 0.08, 0]} s={[0.85, 0.7, 1.3]} c="#f3e9cb" line={0.025} />
      <Ic a={[0.09, 0]} p={[0, 0.24, 0.14]} c={i % 2 ? '#4f6b66' : '#f3e9cb'} line={0.02} />
      <Cn a={[0.035, 0.1, 4]} p={[0, 0.22, 0.26]} r={[Math.PI / 2, 0, 0]} c="#d28a3a" line={0} />
    </group>
  )
}

function Birds() {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    g.current.children.forEach((b, i) => {
      const t = clock.elapsedTime * (0.22 + i * 0.02) + i * 1.9
      const r = 8 + i * 1.3
      b.position.set(Math.cos(t) * r - 1, 7.5 + Math.sin(t * 2 + i) * 0.8 + i * 0.3, Math.sin(t) * r * 0.7)
      b.rotation.y = -t
      const flap = Math.sin(clock.elapsedTime * 9 + i) * 0.7
      b.children[0].rotation.x = flap
      b.children[1].rotation.x = -flap
    })
  })
  return (
    <group ref={g}>
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i}>
          <group><Bx a={[0.12, 0.02, 0.34]} p={[0, 0, 0.17]} c="#3a322a" line={0} /></group>
          <group><Bx a={[0.12, 0.02, 0.34]} p={[0, 0, -0.17]} c="#3a322a" line={0} /></group>
          <Bx a={[0.26, 0.05, 0.06]} c="#3a322a" line={0} />
        </group>
      ))}
    </group>
  )
}

function Butterflies() {
  const g = useRef<Group>(null!)
  const homes = useMemo(() => scatter(10, 71, open(-0.5)), [])
  useFrame(({ clock }) => {
    g.current.children.forEach((b, i) => {
      const t = clock.elapsedTime * 0.7 + i * 3
      const [hx, hz] = homes[i]
      const x = hx + Math.sin(t) * 1.1 + Math.sin(t * 2.7) * 0.3, z = hz + Math.cos(t * 0.8) * 1.1
      b.position.set(x, groundY(x, z) + 0.7 + Math.sin(t * 3.1) * 0.25, z)
      b.rotation.y = t
      const flap = Math.sin(clock.elapsedTime * 16 + i) * 1
      b.children[0].rotation.z = flap
      b.children[1].rotation.z = -flap
    })
  })
  return (
    <group ref={g}>
      {homes.map((_, i) => (
        <group key={i}>
          {[1, -1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.07, 0, 0]}>
                <boxGeometry args={[0.14, 0.01, 0.12]} />
                <meshBasicMaterial color={['#f3e9cb', '#d9b24e', '#b5484a', '#8e6aa0'][i % 4]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

function Fireflies() {
  const g = useRef<Group>(null!)
  const homes = useMemo(() => scatter(36, 91), [])
  useFrame(({ clock }) => {
    const dusk = inkUniforms.uDusk.value
    g.current.visible = dusk > 0.35
    g.current.children.forEach((f, i) => {
      const t = clock.elapsedTime * 0.5 + i
      const [hx, hz] = homes[i]
      f.position.set(hx + Math.sin(t * 1.3) * 0.6, groundY(hx, hz) + 0.8 + Math.sin(t * 2.1) * 0.4, hz + Math.cos(t) * 0.6)
      ;((f as Mesh).material as any).opacity = (dusk - 0.35) * 1.5 * (0.5 + 0.5 * Math.sin(t * 4))
    })
  })
  return (
    <group ref={g}>
      {homes.map((_, i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[0.05, 0]} />
          <meshBasicMaterial color="#fff0a8" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function FallingLeaves() {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    g.current.children.forEach((l, i) => {
      const t = (clock.elapsedTime * 0.12 + i / 18) % 1
      const x = -12 + hash2(i, 1) * 9, z = -8 + hash2(i, 2) * 7
      l.position.set(x + Math.sin(t * 9 + i) * 0.5, 3.4 - t * 3.2 + groundY(x, z), z + Math.cos(t * 7 + i) * 0.4)
      l.rotation.set(t * 12, t * 7 + i, t * 5)
    })
  })
  return (
    <group ref={g}>
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} material={ink(['#b08a3a', '#a8623a', '#84904f'][i % 3])}>
          <boxGeometry args={[0.12, 0.01, 0.08]} />
        </mesh>
      ))}
    </group>
  )
}

function Clouds() {
  const g = useRef<Group>(null!)
  useFrame(({ clock }) => {
    g.current.children.forEach((c, i) => {
      c.position.x = ((clock.elapsedTime * 0.3 + i * 9.5) % 56) - 28
    })
  })
  return (
    <group ref={g}>
      {[[-14.5, -4, 1.5], [14, -6.5, 1.2], [-13, -9, 1.1], [15.5, -2.5, 1], [13, -10, 1.4], [-16, -1.5, 0.9]].map(([z, y, s], i) => (
        <group key={i} position={[0, y, z]} scale={s}>
          {[[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.75], [-1.1, -0.2, -0.1, 0.7], [0.4, 0.35, -0.2, 0.6], [-0.5, 0.3, 0.2, 0.55]].map(([x, yy, zz, r], j) => (
            <Ic key={j} a={[1, 1]} p={[x, yy, zz]} s={[r * 1.3, r * 0.62, r]} c="#fbf4dc" o={{ ...PAT.leaves, scale: 1.6, amt: 0.25 }} line={0.05} />
          ))}
        </group>
      ))}
    </group>
  )
}

export default function Nature() {
  return (
    <group>
      <Trees />
      <Bushes />
      <Rocks />
      <Meadow />
      <Crops />
      {[0, 1, 2, 3].map((i) => <Chicken key={i} home={[-7.4, 3.6]} i={i} />)}
      {[0, 1, 2].map((i) => <Sheep key={i} home={[-11.2, 0.5]} i={i} />)}
      <Duck z0={-4.5} i={0} />
      <Duck z0={4.2} i={1} />
      <Duck z0={4.9} i={2} />
      <Birds />
      <Butterflies />
      <Fireflies />
      <FallingLeaves />
      <Clouds />
    </group>
  )
}
