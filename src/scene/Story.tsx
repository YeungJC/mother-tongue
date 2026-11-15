// The island tells its own story: a sign over each town (who's there, and the town's own words:
// its dialect, readable on the map), and every exchange played out in the world: an arc between
// the two traders (green: understood, red: misunderstood), the goods flying across, and a mark over
// the speaker.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CatmullRomCurve3, type Mesh, type MeshBasicMaterial, TubeGeometry, Vector3 } from 'three'
import { useGame, type FlightKind } from '../store'
import { BY_ID, posOf } from '../world'
import { TOWN_POS, groundY } from '../terrain'
import { GOODS, TOWNS, type Table, useTongue } from '../tongue'
import { dayRowAt, dictionaryAt } from '../derive'

const SIGN_WORDS: [string, number][] = [['food', 0], ['yes', 11]]

function TownSigns() {
  const lexDays = useTongue((s) => s.lexDays)
  const prevLex = useTongue((s) => s.prevLex)
  const days = useTongue((s) => s.days)
  const day = useTongue((s) => s.day)
  const row = dayRowAt(days, day)
  // The town's words as of last night (the player's day): the same dictionary as the Watch panel.
  const dialect = dictionaryAt(lexDays, prevLex, day).day?.dialect
  return (
    <group>
      {TOWNS.map((name, t) => {
        const [x, z] = TOWN_POS[t]
        const here = row ? row.agents.filter((a) => a.alive && a.loc === t && !a.travelling).length : null
        return (
          <Html key={name} position={[x, groundY(x, z) + 11, z]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
            <div className="town-sign">
              <b>{name}</b>{here !== null && <small>{here} here</small>}
              {dialect && SIGN_WORDS.some(([, k]) => dialect[t]?.[k]?.word) && <div className="dialect-words">{SIGN_WORDS.filter(([, k]) => dialect[t]?.[k]?.word).map(([m, k]) => <span key={m}><i>{dialect[t]![k]!.word}</i> = {m}</span>)}</div>}
            </div>
          </Html>
        )
      })}
    </group>
  )
}

interface Fx { id: number; from: Vector3; to: Vector3 | null; result: Table['result']; words: string; born: number }
let fxId = 1

/** One exchange, in the world: an arc between the traders and a mark over the speaker. */
function Exchange({ fx, onDone }: { fx: Fx; onDone: () => void }) {
  const mesh = useRef<Mesh>(null!)
  const ok = fx.result === 'understood'
  const geo = useMemo(() => {
    if (!fx.to) return null
    const mid = fx.from.clone().lerp(fx.to, 0.5)
    mid.y += 2 + fx.from.distanceTo(fx.to) * 0.35
    return new TubeGeometry(new CatmullRomCurve3([fx.from.clone().setY(fx.from.y + 1.4), mid, fx.to.clone().setY(fx.to.y + 1.4)]), 24, 0.2, 6)
  }, [fx])
  useFrame(() => {
    const age = (performance.now() - fx.born) / 1000
    if (mesh.current) (mesh.current.material as MeshBasicMaterial).opacity = Math.max(0, 0.9 - Math.max(0, age - 2.2) * 0.6)
    if (age > 4) onDone()
  })
  const mark = fx.result === 'understood' ? '✓ understood' : fx.result === 'no deal' ? 'no deal' : '✗ misunderstood'
  return (
    <group>
      {geo && <mesh ref={mesh} geometry={geo}><meshBasicMaterial color={ok ? '#3f8f3a' : '#c0442f'} transparent opacity={0.9} depthWrite={false} /></mesh>}
      <Html position={[fx.from.x, fx.from.y + 2.9, fx.from.z]} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`fx-mark ${fx.result === 'understood' ? 'ok' : fx.result === 'no deal' ? 'none' : 'mis'}`}>{mark}</div>
      </Html>
    </group>
  )
}

function Exchanges() {
  const t = useTongue((s) => s.current)
  const [fxs, setFxs] = useState<Fx[]>([])
  useEffect(() => {
    if (!t || !BY_ID[t.makerKey]) return
    const from = posOf(t.makerKey).clone()
    const taken = t.rounds.find((r) => r.taken)
    const takenBid = taken?.bids.find((b) => b.key === taken.taken)
    const to = taken?.taken && BY_ID[taken.taken] ? posOf(taken.taken).clone() : null
    setFxs((xs) => [...xs.slice(-5), { id: fxId++, from, to, result: t.result, words: t.said, born: performance.now() }])
    // the goods change hands
    if (to && takenBid) {
      const g = useGame.getState()
      const lift = (v: Vector3): [number, number, number] => [v.x, v.y + 1.2, v.z]
      g.liveFly(GOODS[t.give] as FlightKind, lift(from), lift(to), Math.min(3, t.giveQ), 600)
      g.liveFly(GOODS[takenBid.g] as FlightKind, lift(to), lift(from), Math.min(3, takenBid.q), 900)
    }
  }, [t])
  return <group>{fxs.map((fx) => <Exchange key={fx.id} fx={fx} onDone={() => setFxs((xs) => xs.filter((x) => x.id !== fx.id))} />)}</group>
}

export default function Story() {
  const mode = useGame((s) => s.mode)
  if (mode !== 'live') return null
  return (
    <group>
      <TownSigns />
      <Exchanges />
    </group>
  )
}
