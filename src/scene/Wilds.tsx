// The wider region beyond the hamlet: Oakhollow's forest, countryside trees and
// Ironcrag's rocks. Everything is instanced (a handful of draw calls for ~700 things).
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { ink, PAT } from './ink'
import { REGION, TOWN_POS, groundY, hash2, roadDist, scatter, wild } from '../terrain'
import { PLOT_SPOTS } from './Settlements'

const near = (x: number, z: number, t: number, r: number) => Math.hypot(x - TOWN_POS[t][0], z - TOWN_POS[t][1]) < r
const clearOfPlots = (x: number, z: number, pad: number) =>
  Object.values(PLOT_SPOTS).every((spots) => spots.every(([px, pz]) => Math.hypot(x - px, z - pz) > pad))
/** Open country: beyond the hamlet, off the roads, clear of every plot. */
const open = (pad: number) => (x: number, z: number) => wild(x, z) > 0.95 && roadDist(x, z) > 1.6 + pad && clearOfPlots(x, z, 2.4 + pad) && !near(x, z, 3, 13) && !near(x, z, 1, 4.5) && !near(x, z, 2, 4)

type Pt = [number, number, number]

/** Instanced mesh standing upright on the terrain; per-instance scale and tint. */
function Upright({ pts, color, tints, y = 0, scale = 1, children }: { pts: Pt[]; color: string; tints: string[]; y?: number; scale?: number; children: React.ReactNode }) {
  const ref = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const o = new Object3D()
    const c = new Color()
    pts.forEach(([x, z, k], i) => {
      const s = scale * (0.75 + k * 0.6)
      o.position.set(x, groundY(x, z) + y * s, z)
      o.rotation.set(0, k * 40, 0)
      o.scale.setScalar(s)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
      ref.current.setColorAt(i, c.set(tints[Math.floor(hash2(i, k * 13) * tints.length)]))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [pts])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]} material={ink(color, PAT.leaves)} frustumCulled={false}>
      {children}
    </instancedMesh>
  )
}

const PINE = ['#5e6b3a', '#56633a', '#6f7f45', '#4f5b30']
const BROAD = ['#6f7f45', '#84904f', '#7d8a4a', '#b08a3a', '#a8623a']
const TRUNK = ['#6b4a2b', '#5c4026']
const STONE = ['#b9b09a', '#a9a08a', '#9a917c', '#c4bba4']

export default function Wilds() {
  const b = REGION
  const forest = useMemo(() => scatter(360, 101, (x, z) => open(0)(x, z) && near(x, z, 1, 19) && !near(x, z, 1, 8), b), [])
  const country = useMemo(() => scatter(260, 211, (x, z) => open(0.4)(x, z) && !near(x, z, 1, 19) && !near(x, z, 2, 15) && !near(x, z, 3, 16) && hash2(x * 0.3, z * 0.3) < 0.55, b), [])
  const hillPines = useMemo(() => scatter(70, 307, (x, z) => open(0.2)(x, z) && near(x, z, 2, 17) && !near(x, z, 2, 6.5), b), [])
  const boulders = useMemo(() => scatter(110, 409, (x, z) => open(0)(x, z) && near(x, z, 2, 19) && !near(x, z, 2, 6), b), [])
  const stones = useMemo(() => scatter(90, 503, (x, z) => open(0)(x, z), b), [])

  const pines = useMemo(() => [...forest.filter((_, i) => i % 3 !== 0), ...hillPines], [forest, hillPines])
  const broad = useMemo(() => [...forest.filter((_, i) => i % 3 === 0), ...country], [forest, country])

  return (
    <group>
      {/* pines: trunk + two cones */}
      <Upright pts={pines} color="#ffffff" tints={TRUNK} y={0.5}>
        <cylinderGeometry args={[0.13, 0.19, 1, 6]} />
      </Upright>
      <Upright pts={pines} color="#ffffff" tints={PINE} y={1.6}>
        <coneGeometry args={[1.05, 1.9, 8]} />
      </Upright>
      <Upright pts={pines} color="#ffffff" tints={PINE} y={2.6}>
        <coneGeometry args={[0.72, 1.45, 8]} />
      </Upright>
      {/* broadleaf trees: trunk + round crown */}
      <Upright pts={broad} color="#ffffff" tints={TRUNK} y={0.65}>
        <cylinderGeometry args={[0.13, 0.2, 1.3, 6]} />
      </Upright>
      <Upright pts={broad} color="#ffffff" tints={BROAD} y={1.95}>
        <icosahedronGeometry args={[0.95, 1]} />
      </Upright>
      {/* Ironcrag boulders and loose stones everywhere */}
      <Upright pts={boulders} color="#ffffff" tints={STONE} y={0.25} scale={1.6}>
        <icosahedronGeometry args={[0.55, 0]} />
      </Upright>
      <Upright pts={stones} color="#ffffff" tints={STONE} y={0.1} scale={0.7}>
        <icosahedronGeometry args={[0.4, 0]} />
      </Upright>
    </group>
  )
}
