// The towns: each town's decor, and the building spots the wild scatter keeps clear of.
import { TOWN_POS, roadDist } from '../terrain'
import TownDecor from './TownDecor'

/** Direction from Saltmere towards the island's middle (its sea faces the other way). */
export const SALT_OUT = Math.atan2(TOWN_POS[3][0] + 1, TOWN_POS[3][1] + 2) // yaw facing out to sea
const SALT_INLAND = Math.atan2(-(TOWN_POS[3][1] + 2), -(TOWN_POS[3][0] + 1)) // angle in the x-z plane

/** Fixed spot (x, z, facing) for every plot index, per settlement. */
export const PLOT_SPOTS: Record<number, [number, number, number][]> = {
  // Wrenford: new lanes south and west of the old hamlet
  0: [
    [-0.6, 11, -1.57], [-6.5, 12.2, 0], [-10, 12.2, 0], [-13.5, 12.2, 0], [-0.6, 14.5, -1.57], [-0.6, 18, -1.57],
    [-6.5, 16.6, Math.PI], [-10, 16.6, Math.PI], [-13.5, 16.6, Math.PI], [-3.5, 21, Math.PI], [-7, 21, Math.PI],
    [-10.5, 21, Math.PI], [-14, 21, Math.PI], [-18.4, 8, 1.57], [-18.4, 11.5, 1.57], [-18.4, 15, 1.57],
  ],
  1: ring(1, 14, 6.6),
  2: ring(2, 14, 5.8),
  // Saltmere: an arc facing inland, the sea at its back
  3: ring(3, 14, 6.4, SALT_INLAND - 1.7, SALT_INLAND + 1.7),
}

function ring(town: number, n: number, r: number, a0 = 0, a1 = Math.PI * 2): [number, number, number][] {
  const [cx, cz] = TOWN_POS[town]
  const full = a1 - a0 >= Math.PI * 2 - 1e-6
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * (full ? i + 0.5 : i)) / (full ? n : n - 1)
    let rr = r
    // step back from any road running through the town
    while (roadDist(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr) < 2.2 && rr < r + 4) rr += 0.6
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr
    return [x, z, Math.atan2(cx - x, cz - z)] // face the town centre
  })
}

export default function Settlements() {
  return (
    <group>
      <TownDecor />
    </group>
  )
}
