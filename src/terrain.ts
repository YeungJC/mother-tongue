/** Shared, deterministic description of the island so everything can sit on the ground.
 *  The original hamlet (Wrenford) keeps its exact terrain; the wider region is blended in
 *  beyond it: Oakhollow's forest across the river to the east, Ironcrag's hills to the
 *  north-west, roads between them. */

export const hash2 = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function noise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z)
  const xf = x - xi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf)
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const gauss = (dx: number, dz: number, r: number) => Math.exp(-(dx * dx + dz * dz) / (r * r))

/** Town centres on the region map. */
export const TOWN_POS: Record<number, [number, number]> = { 0: [-2.5, 2.5], 1: [25, -7], 2: [-25, -15], 3: [19, 21.5] }
export const TOWN_NAMES = ['Wrenford', 'Oakhollow', 'Ironcrag', 'Saltmere']
/** Island extents (for grids and scatter). */
export const REGION = { x0: -52, x1: 50, z0: -38, z1: 34 }

/** 0 inside the original hamlet, 1 out in the wider region. */
export const wild = (x: number, z: number) => smooth(10, 16, Math.hypot(x + 1, z * 1.2))

export const riverX = (z: number) => 6.5 + Math.sin(z * 0.35) * 0.9 + smooth(9, 20, Math.abs(z)) * 3.2 * Math.sin(z * 0.11 + 0.6)

/** > 0 on the island, < 0 past the cliff edge. */
export const mask = (x: number, z: number) => {
  const small = 1 - Math.hypot(x / 14.2, z / 9.8) + (noise(x * 0.3 + 7, z * 0.3 + 3) - 0.5) * 0.16
  const big = 1 - Math.hypot((x + 1) / 47, (z + 2) / 33) + (noise(x * 0.07 + 2, z * 0.07 + 9) - 0.5) * 0.22 + (noise(x * 0.25, z * 0.25) - 0.5) * 0.05
  return Math.max(small, big)
}

/** How deep in the river trench a point is, 0..1. */
export const riverT = (x: number, z: number) => smooth(1.9, 0.9, Math.abs(x - riverX(z)))

export function groundY(x: number, z: number) {
  let h = (noise(x * 0.22 + 11, z * 0.22 + 5) - 0.5) * 0.3
  h += 1.5 * gauss(x + 11.5, z + 8, 3.2) + 1.0 * gauss(x - 11.8, z + 5.5, 2.6) + 0.7 * gauss(x + 12, z - 7.5, 2.5)
  // the wider region, faded in beyond the hamlet
  const w = wild(x, z)
  if (w > 0) {
    let r = (noise(x * 0.06 + 3, z * 0.06 + 1) - 0.5) * 2.2
    // Ironcrag: crags and a ridge, with a flat shelf for the town
    const [ix, iz] = TOWN_POS[2]
    const crag = 7 * gauss(x - ix + 6, z - iz + 6, 8) + 4.5 * gauss(x - ix - 7, z - iz + 9, 6) + 3.5 * gauss(x - ix + 10, z - iz - 4, 5.5)
    const rough = (noise(x * 0.35, z * 0.35) - 0.5) * 1.6 * smooth(1.5, 4, crag)
    const shelf = gauss(x - ix, z - iz, 6.5)
    r += (crag + rough) * (1 - shelf) + 2.6 * shelf
    // Saltmere: a low, flat sandy shelf above the sea
    const [sx, sz] = TOWN_POS[3]
    r = r * (1 - 0.8 * gauss(x - sx, z - sz, 9)) - 0.4 * gauss(x - sx, z - sz, 9)
    // Oakhollow: soft wooded hills
    const [ox, oz] = TOWN_POS[1]
    r += 1.8 * gauss(x - ox - 6, z - oz + 8, 7) + 1.2 * gauss(x - ox + 3, z - oz - 9, 6) - 0.6 * gauss(x - ox, z - oz, 5)
    h = h * (1 - w) + r * w
  }
  // keep roads walkable
  const rd = roadDist(x, z)
  if (rd < 2.5 && w > 0) h = h * (0.55 + 0.45 * smooth(0.6, 2.5, rd))
  const t = riverT(x, z)
  h = h * (1 - t) + -0.75 * t
  h -= smooth(0.05, 0, mask(x, z)) * 0.4
  return h
}

/** Footpaths inside the hamlet (unchanged). */
export const PATHS: [number, number][][] = [
  [[-3.4, 0.6], [-6, -1.5], [-8, -3.4]],
  [[-3.4, 0.6], [-1.5, -1.5], [-0.6, -3.6]],
  [[-3.4, 0.6], [-5.5, 2.6], [-7.8, 4.2]],
  [[-3.4, 0.6], [1, 0.4], [4.9, 0]],
  [[2.4, 3.6], [3.6, 0.6]],
  [[8.1, 0], [10.4, 0.2], [10.8, -0.9]],
  [[10.4, 0.2], [11, 1.4]],
]

/** Roads across the region. Travellers walk these. */
export const ROADS: Record<string, [number, number][]> = {
  // Wrenford → over the Great Bridge → Oakhollow
  '0-1': [[-3.4, 0.6], [1, 0.4], [4.9, 0], [8.1, 0], [10.4, 0.2], [14, -1.8], [18.5, -4.6], [22.5, -6.4], [25, -7]],
  // Wrenford → north-west up into the hills → Ironcrag
  '0-2': [[-3.4, 0.6], [-6, -1.5], [-8, -3.4], [-11.5, -6.2], [-15.5, -9], [-19.5, -11.8], [-23, -14], [-25, -15]],
  // Oakhollow → north, fording the river → Ironcrag
  '1-2': [[25, -7], [23, -12], [17, -18.5], [9, -22], [riverX(-22.5), -22.5], [3, -23], [-6, -22.5], [-14, -20.5], [-20.5, -17.5], [-25, -15]],
  // Wrenford → south-east, fording the river → Saltmere on the coast
  '0-3': [[-3.4, 0.6], [-1.5, 4], [2.4, 7], [riverX(9.5), 9.5], [11, 12], [15, 16.5], [19, 21.5]],
  // Oakhollow → south along the east bank → Saltmere
  '1-3': [[25, -7], [26.5, 0], [25, 8], [22, 15], [19, 21.5]],
  // Wrenford's new lane, where agents build
  lane: [[-3.4, 6], [-3, 10], [-3, 14.5], [-15.5, 14.5], [-15.5, 4]],
}
// Ironcrag–Saltmere has no road of its own: it runs through Wrenford.
ROADS['2-3'] = [...[...ROADS['0-2']].reverse(), ...ROADS['0-3'].slice(1)]

function segDist(x: number, z: number, line: [number, number][]) {
  let best = 99
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1]
    const dx = bx - ax, dz = bz - az
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best
}

export function roadDist(x: number, z: number) {
  let best = 99
  for (const k in ROADS) best = Math.min(best, segDist(x, z, ROADS[k]))
  return best
}

export function pathDist(x: number, z: number) {
  let best = 99
  for (const line of PATHS) best = Math.min(best, segDist(x, z, line))
  return Math.min(best, roadDist(x, z))
}

/** Seeded scatter helper: n points on dry land that pass `ok`. Defaults to the hamlet's bounds. */
export function scatter(
  n: number,
  seed: number,
  ok: (x: number, z: number) => boolean = () => true,
  b: { x0: number; x1: number; z0: number; z1: number } = { x0: -14.5, x1: 14.5, z0: -10, z1: 10 },
) {
  const out: [number, number, number][] = []
  let i = 0
  while (out.length < n && i < n * 40) {
    i++
    const x = b.x0 + hash2(i * 1.37 + seed, seed * 2.1) * (b.x1 - b.x0)
    const z = b.z0 + hash2(seed * 3.3, i * 2.11 + seed) * (b.z1 - b.z0)
    if (mask(x, z) < 0.06 || riverT(x, z) > 0.02 || !ok(x, z)) continue
    out.push([x, z, hash2(i, seed)])
  }
  return out
}

/** Point a fraction `t` (0..1) of the way along a polyline. */
export function along(line: [number, number][], t: number): [number, number] {
  const lens = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]))
  let d = Math.max(0, Math.min(1, t)) * lens.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]) {
      const f = lens[i] ? d / lens[i] : 0
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * f, line[i][1] + (line[i + 1][1] - line[i][1]) * f]
    }
    d -= lens[i]
  }
  return line[line.length - 1]
}
