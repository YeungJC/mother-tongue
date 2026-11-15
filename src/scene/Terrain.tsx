import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import { ink, PAT } from './ink'
import { Blob, Cn, Line } from './kit'
import { REGION, TOWN_POS, groundY, mask, noise, pathDist, riverT, riverX, roadDist, wild } from '../terrain'

function useIsland() {
  return useMemo(() => {
    const X0 = REGION.x0, X1 = REGION.x1, Z0 = REGION.z0, Z1 = REGION.z1, step = 0.25
    const nx = Math.round((X1 - X0) / step) + 1, nz = Math.round((Z1 - Z0) / step) + 1
    const pos = new Float32Array(nx * nz * 3)
    const col = new Float32Array(nx * nz * 3)
    const ms = new Float32Array(nx * nz)
    const grassA = new Color('#b9c07c'), grassB = new Color('#96a862'), grassC = new Color('#c9c582')
    const path = new Color('#dcc999'), sand = new Color('#d9c79a'), bed = new Color('#a9a07c'), square = new Color('#d2c4a2')
    const rocks = [new Color('#b39a6e'), new Color('#96784e'), new Color('#7a5f3e'), new Color('#a58a60')]
    const forest = new Color('#7e9152'), crag = new Color('#a39a86'), scree = new Color('#bdb29a'), road = new Color('#cfb98a')
    const c = new Color()
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix
        let x = X0 + ix * step, z = Z0 + iz * step
        const m = mask(x, z)
        ms[i] = m
        let y = groundY(x, z)
        if (m >= 0) {
          const n = noise(x * 0.5 + 3, z * 0.5 + 8)
          c.copy(grassA).lerp(grassB, n).lerp(grassC, noise(x * 1.7, z * 1.7) * 0.35)
          // the wider region: forest floor near Oakhollow, bare rock on Ironcrag's heights
          const w = wild(x, z)
          if (w > 0) {
            const [ox, oz] = TOWN_POS[1]
            c.lerp(forest, w * Math.max(0, 1 - Math.hypot(x - ox, z - oz) / 17) * 0.75)
            // Saltmere: sand and shingle by the sea
            const [sx, sz] = TOWN_POS[3]
            const shore = Math.max(0, 1 - Math.hypot(x - sx, z - sz) / 12) * 0.85 + Math.max(0, 0.25 - m) * 2 * Math.max(0, 1 - Math.hypot(x - sx, z - sz) / 22)
            if (shore > 0) c.lerp(sand, Math.min(0.9, shore))
            const high = Math.min(1, Math.max(0, (y - 2.6) / 3))
            if (high > 0) c.lerp(noise(x * 0.8, z * 0.8) > 0.5 ? crag : scree, high * 0.85)
          }
          const pd = pathDist(x, z) + (noise(x * 3, z * 3) - 0.5) * 0.25
          const onRoad = roadDist(x, z) < 1 && w > 0.2
          if (pd < 0.42) c.lerp(onRoad ? road : path, 0.9)
          else if (pd < 0.6) c.lerp(onRoad ? road : path, 0.35)
          if (Math.hypot(x + 3.4, z - 0.6) < 2.1 + noise(x * 2, z * 2) * 0.4) c.lerp(square, 0.9)
          const rt = riverT(x, z)
          if (rt > 0.05) c.lerp(sand, Math.min(1, rt * 2.2))
          if (rt > 0.75) c.lerp(bed, 0.8)
          if (m < 0.02) c.multiplyScalar(0.86)
        } else {
          const t = Math.min(1.6, -m / 0.07)
          y -= t * 3.4 + noise(x * 1.3, z * 1.3) * 0.5
          const pull = 1 - Math.max(0, t - 0.25) * 0.085
          x *= pull; z *= pull
          c.copy(rocks[Math.abs(Math.floor(y * 1.1 + noise(x * 0.4, z * 0.4) * 2)) % rocks.length])
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
      }
    }
    const idx: number[] = []
    const lim = -0.108
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iz * nx + ix, b = a + 1, d = a + nx, e = d + 1
        if (ms[a] > lim && ms[b] > lim && ms[d] > lim && ms[e] > lim) idx.push(a, d, b, b, d, e)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('color', new BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])
}

const RIVER_ENDS: [number, number] = [-9.3, 9.3]

function useRiver() {
  return useMemo(() => {
    const pts: number[] = []
    const idx: number[] = []
    const n = 220
    const zs: number[] = []
    for (let i = 0; i <= n; i++) {
      const z = REGION.z0 + ((REGION.z1 - REGION.z0) * i) / n
      if (mask(riverX(z), z) > 0.015) zs.push(z)
    }
    RIVER_ENDS[0] = zs[0]
    RIVER_ENDS[1] = zs[zs.length - 1]
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i]
      const cx = riverX(z)
      pts.push(cx - 1.75, -0.3, z, cx + 1.75, -0.3, z)
      if (i < zs.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])
}

export default function Terrain() {
  const island = useIsland()
  const river = useRiver()
  return (
    <group>
      <mesh geometry={island} material={ink('#ffffff', { ...PAT.grass, vc: true })}>
        <Line t={0.08} />
      </mesh>

      {/* river and the two falls off the island's edge */}
      <mesh geometry={river} material={ink('#9dbcb2', PAT.water)} />
      {[[RIVER_ENDS[1] - 1, 0], [RIVER_ENDS[0] + 1, Math.PI]].map(([z, rot], i) => (
        <group key={i} position={[riverX(z), 0, z]} rotation={[0, rot, 0]}>
          <mesh position={[0, -7.3, 0.25]} material={ink('#a9c6bc', PAT.fall)}>
            <planeGeometry args={[2.5, 14]} />
          </mesh>
          <mesh position={[0, -0.5, 0.1]} rotation={[-0.9, 0, 0]} material={ink('#a9c6bc', PAT.fall)}>
            <planeGeometry args={[2.7, 1]} />
          </mesh>
        </group>
      ))}

      {/* hanging rock beneath (scaled up for the wider island) */}
      <group scale={[3.1, 2.2, 3.1]} position={[0, 0, -2]}>
      <Cn a={[10.5, 9, 9]} p={[-3, -7.4, 0]} r={[Math.PI, 0.3, 0]} s={[1.25, 1, 0.82]} c="#8a6b45" o={{ ...PAT.grass, amt: 0.6 }} line={0.08} />
      <Cn a={[5, 6.5, 7]} p={[8.5, -6.2, -1]} r={[Math.PI, 1, 0]} c="#96784e" o={{ ...PAT.grass, amt: 0.6 }} line={0.08} />
      <Cn a={[3.2, 5, 6]} p={[-11, -6, 3.5]} r={[Math.PI, 2, 0]} c="#7a5f3e" o={{ ...PAT.grass, amt: 0.6 }} line={0.08} />
      <Cn a={[2.4, 4.5, 6]} p={[1, -6.5, -6]} r={[Math.PI, 0.5, 0]} c="#96784e" o={{ ...PAT.grass, amt: 0.6 }} line={0.08} />
      <Cn a={[1.2, 2.4, 5]} p={[14.5, -9, 4]} r={[Math.PI, 0, 0.2]} c="#8a6b45" line={0.06} />
      <Cn a={[0.8, 1.8, 5]} p={[-16.5, -8, -3]} r={[Math.PI, 0, -0.2]} c="#96784e" line={0.06} />

      </group>

      {/* the map the island floats above */}
      {/* (the paper sea far below is gone: the island now sits in a real sea, Sea.tsx) */}
      <Blob p={[2, -34, 0]} s={34} sx={1.5} />
    </group>
  )
}
