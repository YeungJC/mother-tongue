import { Vector3 } from 'three'

/** Mock villagers use their role as id; live villagers use their on-chain agent address. */
export type VillagerId = string
/** Which outfit and tool a villager wears. */
export type Look = 'farmer' | 'lumberjack' | 'blacksmith' | 'builder' | 'miner' | 'merchant'

export interface VillagerDef {
  id: VillagerId
  name: string
  short: string
  role: string
  trait: string
  tunic: string
  hat: string
  route: [number, number, number][]
  building: [number, number, number]
  look: Look
  /** Travellers walk their route once (and at their own pace) instead of looping. */
  oneWay?: boolean
  /** Arena entrant (or house benchmark): flagged in the scene. */
  entrant?: 'entrant' | 'house'
  speed?: number
  /** Live: days in a row without food (shown as a red "!"). */
  hungry?: number
  /** Live: draw a family-coloured disc under the figure. */
  disc?: boolean
}

export const VILLAGERS: VillagerDef[] = [
  {
    id: 'farmer', look: 'farmer', name: 'Marta Oatfield', short: 'Marta', role: 'Farmer',
    trait: 'Cautious. Sells only when her larder is full.',
    tunic: '#7d8a4a', hat: '#d9b24e',
    route: [[-7.5, 0, 5.2], [-4.2, 0, 1.2], [-6, 0, 6.6]],
    building: [-9.5, 0, 3],
  },
  {
    id: 'lumberjack', look: 'lumberjack', name: 'Garrick Thorne', short: 'Garrick', role: 'Lumberjack',
    trait: 'Greedy. Holds out for the highest price he can get.',
    tunic: '#8e3a34', hat: '#5e6b3a',
    route: [[-8, 0, -3], [-3, 0, -0.4], [-10.5, 0, -2.2]],
    building: [-9.5, 0, -5.2],
  },
  {
    id: 'blacksmith', look: 'blacksmith', name: 'Hilde Emberfall', short: 'Hilde', role: 'Blacksmith',
    trait: 'Shrewd. Watches every price and waits for a bargain.',
    tunic: '#7a5a3a', hat: '#8e3a34',
    route: [[-0.4, 0, -3.3], [-2.6, 0, 0.2], [0.8, 0, -3.6]],
    building: [-1, 0, -5.6],
  },
  {
    id: 'builder', look: 'builder', name: 'Osric Plumb', short: 'Osric', role: 'Builder',
    trait: 'Earnest, and nearly broke. Lives for the bridge.',
    tunic: '#c29a45', hat: '#4f6b66',
    route: [[3.9, 0, 0.9], [2.6, 0, 3.2], [4.2, 0, -0.8], [-2.4, 0, 1.2]],
    building: [2, 0, 4.8],
  },
]

/** Lookup of the villagers currently on screen (replaced wholesale in live mode). */
export const BY_ID: Record<VillagerId, VillagerDef> = Object.fromEntries(VILLAGERS.map((v) => [v.id, v]))

/** Live world positions, written by each villager every frame. */
export const villagerPos: Record<VillagerId, Vector3> = {
  farmer: new Vector3(-7.5, 0, 5.2),
  lumberjack: new Vector3(-8, 0, -3),
  blacksmith: new Vector3(-0.4, 0, -3.3),
  builder: new Vector3(3.9, 0, 0.9),
}

export const BRIDGE_POS: [number, number, number] = [6.5, 0.3, 0]
export const PLANKS = 12

/** Position of a villager, created on first use (live villagers come and go). */
export const posOf = (id: VillagerId) => (villagerPos[id] ??= new Vector3())

/** Where each kind of activity happens in the hamlet, used to route live villagers. */
export const SPOTS = {
  market: [[-3.4, 0, 0.6], [-1.6, 0, 1.9], [-4.6, 0, -0.5]] as [number, number, number][],
  oakhollow: [[24, 0, -6], [26.5, 0, -8.5], [22.8, 0, -8.8], [26, 0, -5]] as [number, number, number][],
  ironcrag: [[-24, 0, -14], [-26.5, 0, -16.5], [-22.8, 0, -16.2], [-25.8, 0, -12.6]] as [number, number, number][],
  saltmere: [[18, 0, 20], [20.5, 0, 21.2], [17.2, 0, 22.4], [19.8, 0, 19]] as [number, number, number][],
  roadEast: [[4.9, 0, 0], [8.1, 0, 0]] as [number, number, number][],
  roadNorth: [[-5.2, 0, -2.4], [-8.2, 0, -5.0]] as [number, number, number][],
}
