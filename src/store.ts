import { create } from 'zustand'
export interface ChainStats {
  txTotal: number; txLastMin: number; txLastHour: number; confirmMedianMs: number | null
  avgFeeSol: number; feesSol: number; x402Total: number; x402LastHour: number; usdcApprox?: number
}
export interface Commentary { day: number; text: string; hash: string; at: number; recap?: number }
import { BRIDGE_POS, BY_ID, PLANKS, VILLAGERS, VillagerDef, VillagerId, posOf } from './world'

export type FlightKind = 'coin' | 'wood' | 'food' | 'tools' | 'ore' | 'planks'
export interface Flight {
  id: number
  kind: FlightKind
  from: [number, number, number]
  to: [number, number, number]
  t0: number
  dur: number
  arc: number
}
export interface FeedItem { id: number; t: string; tag: string; text: string; who?: VillagerId }
export interface Purse { coins: number; wood: number; food: number; tools: number; doing: string; last: string }
export interface Tx { id: number; label: string; sol: number; status: 'sending' | 'confirmed' }

interface Game {
  /** mock = the original scripted demo; live = driven by the on-chain world via the indexer. */
  mode: 'mock' | 'live'
  villagers: VillagerDef[]
  connected: boolean
  /** Latest Village Radio bulletin, and who is speaking right now (audio). */
  radio: { day: number; text: string; hash: string } | null
  speaking: string | null
  /** What the camera frames: the whole island, or one town (0 Wrenford, 1 Oakhollow, 2 Ironcrag). */
  focus: 'island' | number
  setFocus: (f: 'island' | number) => void
  /** Island view, leaning toward one town (the replay follows each exchange there), or null. */
  lean: number | null
  /** Daily research metrics from the indexer. */
  metrics: unknown[]
  /** Recent conversations and town meetings. */
  talk: unknown[]
  phase: 'lobby' | 'playing' | 'won' | 'lost'
  timeLeft: number
  planks: number
  prices: { wood: number; food: number; tools: number }
  trend: { wood: number; food: number; tools: number }
  purses: Record<VillagerId, Purse>
  selected: VillagerId | null
  bubbles: Partial<Record<VillagerId, string>>
  subtitle: { who: string; text: string } | null
  flights: Flight[]
  feed: FeedItem[]
  prestige: { you: number; ada: number; bram: number }
  spent: number
  whispers: number
  muted: boolean
  /** Island Radio: everything plays (negotiations, commentator, ambience). */
  listening: boolean
  stats: ChainStats | null
  commentary: Commentary[]
  timeline: { match: number; day: number; scores: number[] }[]
  standings: unknown
  results: unknown[]
  reasoning: unknown[]
  toggleListen: () => void
  tx: Tx | null
  step: number
  start: () => void
  reset: () => void
  select: (id: VillagerId | null) => void
  toggleMute: () => void
  tick: () => void
  second: () => void
  removeFlight: (id: number) => void
  subsidise: () => void
  reward: () => void
  donate: () => void
  whisper: () => void
  // live-mode hooks, driven by src/tongue.ts
  setLive: (patch: Partial<Pick<Game, 'villagers' | 'connected' | 'planks' | 'mode' | 'radio' | 'speaking' | 'metrics' | 'talk' | 'stats' | 'commentary' | 'timeline' | 'standings' | 'results' | 'reasoning'>>) => void
  liveSay: (who: VillagerId, text: string) => void
  liveFly: (kind: FlightKind, from: [number, number, number], to: [number, number, number], n?: number, delay?: number) => void
  liveLog: (tag: string, text: string, who?: VillagerId, t?: string) => void
}

let uid = 1
const at = (id: VillagerId, y = 1.2): [number, number, number] => {
  const p = posOf(id)
  return [p.x, y, p.z]
}
const fmt = (elapsed: number) => `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

const initial = () => ({
  mode: 'mock' as 'mock' | 'live',
  villagers: VILLAGERS as VillagerDef[],
  connected: false,
  radio: null as { day: number; text: string; hash: string } | null,
  speaking: null as string | null,
  focus: 0 as 'island' | number,
  lean: null as number | null,
  metrics: [] as unknown[],
  talk: [] as unknown[],
  phase: 'lobby' as const,
  timeLeft: 300,
  planks: 4,
  prices: { wood: 12, food: 5, tools: 18 },
  trend: { wood: 3, food: -1, tools: 0 },
  purses: {
    farmer: { coins: 38, wood: 0, food: 14, tools: 1, doing: 'Hoeing the east rows', last: 'Sold 3 food to Garrick' },
    lumberjack: { coins: 61, wood: 9, food: 2, tools: 1, doing: 'Felling timber', last: 'Sold 3 wood to Osric' },
    blacksmith: { coins: 24, wood: 1, food: 3, tools: 0, doing: 'Tending a cold forge', last: 'Refused wood at 12 crowns' },
    builder: { coins: 7, wood: 3, food: 1, tools: 0, doing: 'Laying planks on the west span', last: 'Bought 3 wood from Garrick' },
  } as Record<VillagerId, Purse>,
  selected: null as VillagerId | null,
  bubbles: {} as Partial<Record<VillagerId, string>>,
  subtitle: null as { who: string; text: string } | null,
  flights: [] as Flight[],
  feed: [] as FeedItem[],
  prestige: { you: 0, ada: 40, bram: 25 },
  spent: 0,
  whispers: 2,
  muted: false,
  listening: false,
  stats: null as ChainStats | null,
  commentary: [] as Commentary[],
  timeline: [] as { match: number; day: number; scores: number[] }[],
  standings: null as unknown,
  results: [] as unknown[],
  reasoning: [] as unknown[],
  tx: null as Tx | null,
  step: 0,
})

export const useGame = create<Game>()((set, get) => {
  const log = (tag: string, text: string, who?: VillagerId, t?: string) =>
    set((s) => ({ feed: [{ id: uid++, t: t ?? fmt(300 - s.timeLeft), tag, text, who }, ...s.feed].slice(0, 40) }))

  const say = (who: VillagerId, text: string) => {
    set((s) => ({ bubbles: { ...s.bubbles, [who]: text }, subtitle: { who: BY_ID[who]?.short ?? '', text } }))
    setTimeout(() => {
      set((s) => {
        if (s.bubbles[who] !== text) return {}
        const b = { ...s.bubbles }
        delete b[who]
        return { bubbles: b, subtitle: s.subtitle?.text === text ? null : s.subtitle }
      })
    }, 4200)
  }

  const fly = (kind: FlightKind, from: [number, number, number], to: [number, number, number], n = 1, delay = 0) => {
    const now = performance.now()
    const add: Flight[] = Array.from({ length: n }, (_, i) => ({
      id: uid++, kind, from, to, t0: now + delay + i * 110, dur: 900, arc: 2.2 + Math.random(),
    }))
    set((s) => ({ flights: [...s.flights, ...add] }))
  }

  const rain = (to: [number, number, number], n = 10) => {
    const now = performance.now()
    const add: Flight[] = Array.from({ length: n }, (_, i) => ({
      id: uid++, kind: 'coin' as FlightKind,
      from: [to[0] + (Math.random() - 0.5) * 3, 9 + Math.random() * 2, to[2] + (Math.random() - 0.5) * 3] as [number, number, number],
      to: [to[0] + (Math.random() - 0.5) * 1.4, to[1], to[2] + (Math.random() - 0.5) * 1.4] as [number, number, number],
      t0: now + i * 90, dur: 800, arc: 0,
    }))
    set((s) => ({ flights: [...s.flights, ...add] }))
  }

  const purse = (id: VillagerId, patch: Partial<Purse>) =>
    set((s) => ({ purses: { ...s.purses, [id]: { ...s.purses[id], ...patch } } }))

  const price = (k: 'wood' | 'food' | 'tools', d: number) =>
    set((s) => ({
      prices: { ...s.prices, [k]: Math.max(3, s.prices[k] + d) },
      trend: { ...s.trend, [k]: d },
    }))

  const plank = (n = 1) =>
    set((s) => {
      const planks = Math.min(PLANKS, s.planks + n)
      return { planks, phase: planks >= PLANKS && s.phase === 'playing' ? 'won' : s.phase }
    })

  const trade = (seller: VillagerId, buyer: VillagerId, kind: 'wood' | 'food' | 'tools', qty: number) => {
    const s = get()
    const cost = s.prices[kind] * qty
    fly('coin', at(buyer), at(seller), 3)
    fly(kind, at(seller), at(buyer), qty, 350)
    purse(seller, { coins: s.purses[seller].coins + cost, [kind]: Math.max(0, s.purses[seller][kind] - qty), last: `Sold ${qty} ${kind} to ${BY_ID[buyer].short}` } as Partial<Purse>)
    purse(buyer, { coins: Math.max(0, s.purses[buyer].coins - cost), [kind]: s.purses[buyer][kind] + qty, last: `Bought ${qty} ${kind} from ${BY_ID[seller].short}` } as Partial<Purse>)
    log('Trade', `${BY_ID[seller].short} sold ${qty} ${kind} to ${BY_ID[buyer].short} at ${s.prices[kind]} crowns.`, seller)
  }

  /** A mock Devnet payment: shows the sending → confirmed states, then applies its effect. */
  const pay = (label: string, sol: number, effect: () => void) => {
    if (get().tx?.status === 'sending' || get().phase !== 'playing') return
    const id = uid++
    set({ tx: { id, label, sol, status: 'sending' } })
    setTimeout(() => {
      set((s) => ({ tx: { id, label, sol, status: 'confirmed' }, spent: +(s.spent + sol).toFixed(2) }))
      effect()
      setTimeout(() => set((s) => (s.tx?.id === id ? { tx: null } : {})), 3500)
    }, 1300)
  }

  const script: (() => void)[] = [
    () => {
      if (get().prices.wood > 10) {
        say('blacksmith', `${get().prices.wood} crowns for wood? That's robbery!`)
        setTimeout(() => say('lumberjack', "Then forge without it. I've mouths to feed."), 2300)
        log('Refusal', `Hilde refused Garrick's price of ${get().prices.wood} crowns for wood.`, 'blacksmith')
        price('wood', 1)
      } else {
        trade('lumberjack', 'blacksmith', 'wood', 2)
        say('blacksmith', 'Fair enough. The forge is lit.')
        purse('blacksmith', { doing: 'Hammering out a new tool', tools: get().purses.blacksmith.tools + 1 })
        price('tools', -2)
      }
    },
    () => {
      trade('farmer', 'lumberjack', 'food', 3)
      price('food', -1)
    },
    () => {
      trade('lumberjack', 'builder', 'wood', 2)
      setTimeout(() => plank(1), 1400)
      purse('builder', { doing: 'Laying planks on the west span' })
    },
    () => {
      rain(BY_ID.farmer.building, 8)
      set((s) => ({ prestige: { ...s.prestige, ada: s.prestige.ada + 25 } }))
      log('Patron', 'Ada subsidised the Farmstead. 0.03 SOL confirmed.', 'farmer')
      say('farmer', 'Well now. That buys a good deal of seed.')
      price('food', -1)
    },
    () => {
      if (get().purses.blacksmith.tools > 0) {
        trade('blacksmith', 'builder', 'tools', 1)
        setTimeout(() => plank(1), 1400)
      } else {
        say('builder', 'No tools, no bridge. Simple as that.')
        log('Shortage', 'No tools on the market. The forge is cold.', 'blacksmith')
        price('tools', 2)
      }
    },
    () => {
      say('farmer', "I'll sell when the cellar's full, not before.")
      log('Decision', 'Marta is holding back food until prices recover.', 'farmer')
      price('food', 2)
    },
    () => {
      rain(BY_ID.blacksmith.building, 6)
      set((s) => ({ prestige: { ...s.prestige, bram: s.prestige.bram + 20 } }))
      log('Patron', 'Bram posted a reward for tools. 0.03 SOL confirmed.', 'blacksmith')
      purse('blacksmith', { tools: get().purses.blacksmith.tools + 1, doing: 'Chasing the tool bounty' })
    },
  ]

  return {
    ...initial(),
    setLive: (patch) => set(patch),
    setFocus: (focus) => set({ focus, selected: null }),
    liveSay: say,
    liveFly: fly,
    liveLog: log,
    start: () => {
      set({ phase: 'playing' })
      if (get().mode === 'mock') log('Bell', 'The round begins. Finish the bridge before the evening bell.')
    },
    reset: () => set({ ...initial(), phase: 'playing' }),
    // Anyone can be selected (their card opens), even if they aren't standing on the island now.
    select: (id) => set({ selected: id }),
    toggleMute: () => set((s) => ({ muted: !s.muted })),
    toggleListen: () => set((s) => ({ listening: !s.listening, muted: false })),
    removeFlight: (id) => set((s) => ({ flights: s.flights.filter((f) => f.id !== id) })),
    second: () =>
      set((s) => {
        if (s.phase !== 'playing') return {}
        const timeLeft = s.timeLeft - 1
        return { timeLeft, phase: timeLeft <= 0 ? 'lost' : s.phase }
      }),
    tick: () => {
      const s = get()
      if (s.phase !== 'playing') return
      script[s.step % script.length]()
      set({ step: s.step + 1 })
    },
    subsidise: () => {
      const id = get().selected ?? 'lumberjack'
      const v = BY_ID[id]
      pay(`Subsidy to ${v.short}`, 0.05, () => {
        rain(v.building, 12)
        set((s) => ({ prestige: { ...s.prestige, you: s.prestige.you + 30 } }))
        log('Patron', `You subsidised ${v.short} the ${v.role}. 0.05 SOL confirmed.`, id)
        if (id === 'lumberjack') { price('wood', -4); say(id, 'With coin like that, I can spare the timber.'); purse(id, { wood: get().purses[id].wood + 4, doing: 'Felling timber, buoyed by a subsidy' }) }
        if (id === 'farmer') { price('food', -2); say(id, 'The granary doors are open.'); purse(id, { food: get().purses[id].food + 4 }) }
        if (id === 'blacksmith') { price('tools', -5); say(id, 'The forge burns hot tonight!'); purse(id, { tools: get().purses[id].tools + 2, doing: 'Forging by subsidy' }) }
        if (id === 'builder') { say(id, 'Bless you. That is two more spans.'); purse(id, { coins: get().purses[id].coins + 30 }); setTimeout(() => plank(1), 1200) }
      })
    },
    reward: () =>
      pay('Reward for tools', 0.03, () => {
        rain(BY_ID.blacksmith.building, 8)
        set((s) => ({ prestige: { ...s.prestige, you: s.prestige.you + 20 } }))
        log('Patron', 'You posted a public reward for tools. 0.03 SOL confirmed.', 'blacksmith')
        say('blacksmith', 'A bounty? Stand back from the anvil.')
        purse('blacksmith', { tools: get().purses.blacksmith.tools + 2, doing: 'Chasing the tool bounty' })
        price('tools', -3)
      }),
    donate: () =>
      pay('Donation to the bridge', 0.1, () => {
        rain(BRIDGE_POS, 16)
        set((s) => ({ prestige: { ...s.prestige, you: s.prestige.you + 45 } }))
        log('Patron', 'You donated to the bridge. 0.10 SOL confirmed.', 'builder')
        say('builder', 'Planks! Fetch me planks!')
        setTimeout(() => plank(1), 900)
        setTimeout(() => plank(1), 1500)
      }),
    whisper: () => {
      const s = get()
      if (s.whispers <= 0 || s.phase !== 'playing') return
      set({ whispers: s.whispers - 1, prestige: { ...s.prestige, you: s.prestige.you + 5 } })
      price('wood', -2)
      say('lumberjack', 'Fine. Ten crowns, and not a penny less.')
      log('Whisper', 'You whispered in the market. Garrick eased his price.', 'lumberjack')
    },
  }
})
