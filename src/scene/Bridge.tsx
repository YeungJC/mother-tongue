import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh } from 'three'
import { ink, INK, PAT } from './ink'
import { At, Bx, Cy, Line } from './kit'
import { useGame } from '../store'
import { PLANKS } from '../world'

const X0 = 4.95, STEP = 0.282, Y = 0.14

function Plank({ i, built }: { i: number; built: boolean }) {
  const m = useRef<Mesh>(null!)
  const k = useRef(built ? 1 : 0)
  useFrame((_, dt) => {
    k.current += ((built ? 1 : 0) - k.current) * (1 - Math.exp(-6 * dt))
    m.current.position.y = Y + (1 - k.current) * 3
    m.current.rotation.z = (1 - k.current) * 1.2
    m.current.visible = k.current > 0.01
  })
  return (
    <mesh ref={m} position={[X0 + i * STEP, Y, 0]} material={ink(i % 2 ? '#b08a58' : '#c9a26b', PAT.planksV)}>
      <boxGeometry args={[0.26, 0.1, 1.8]} />
      <Line t={0.04} />
    </mesh>
  )
}

function Crane() {
  const load = useRef<Group>(null!)
  useFrame(({ clock }) => {
    load.current.rotation.z = Math.sin(clock.elapsedTime * 1.3) * 0.12
    load.current.rotation.x = Math.cos(clock.elapsedTime * 1.1) * 0.08
  })
  return (
    <At x={4.2} z={-1.9} rot={-0.5}>
      <Bx a={[0.9, 0.16, 0.9]} p={[0, 0.08, 0]} c="#8a6b45" o={PAT.planks} line={0.03} />
      <Bx a={[0.16, 3, 0.16]} p={[0, 1.5, 0]} c="#6b4a2b" line={0.03} />
      <Bx a={[0.1, 1.5, 0.1]} p={[-0.45, 0.7, 0]} r={[0, 0, -0.6]} c="#6b4a2b" line={0.02} />
      <Bx a={[2.6, 0.13, 0.13]} p={[0.8, 2.95, 0]} r={[0, 0, 0.12]} c="#6b4a2b" line={0.03} />
      <Bx a={[0.08, 1.2, 0.08]} p={[0.55, 2.4, 0]} r={[0, 0, 1]} c="#6b4a2b" line={0} />
      <Cy a={[0.16, 0.16, 0.3, 8]} p={[-0.1, 0.9, 0.2]} r={[Math.PI / 2, 0, 0]} c="#a87a48" line={0.02} />
      <group ref={load} position={[2, 3.1, 0]}>
        <Bx a={[0.025, 1.5, 0.025]} p={[0, -0.75, 0]} c="#3a322a" line={0} />
        <Bx a={[0.3, 0.1, 1.5]} p={[0, -1.55, 0]} c="#c9a26b" o={PAT.planksV} line={0.025} />
        <Bx a={[0.3, 0.1, 1.5]} p={[0, -1.67, 0]} c="#b08a58" o={PAT.planksV} line={0.025} />
      </group>
    </At>
  )
}

export default function Bridge() {
  const planks = useGame((s) => s.planks)
  const posts = [0, 3, 6, 9, 11]
  return (
    <group>
      {/* stone abutments, stringers and piles are there from the start */}
      <Bx a={[0.9, 1.1, 2.4]} p={[4.55, -0.3, 0]} c="#b9b09a" o={PAT.cobble} />
      <Bx a={[0.9, 1.1, 2.4]} p={[8.45, -0.3, 0]} c="#b9b09a" o={PAT.cobble} />
      {[-0.65, 0.65].map((z) => (
        <Bx key={z} a={[3.5, 0.14, 0.14]} p={[6.5, Y - 0.12, z]} c="#6b4a2b" line={0.02} />
      ))}
      {[5.75, 7.25].map((x) => (
        <group key={x}>
          <Bx a={[0.16, 1.3, 0.16]} p={[x, -0.6, -0.75]} c="#6b4a2b" line={0.025} />
          <Bx a={[0.16, 1.3, 0.16]} p={[x, -0.6, 0.75]} c="#6b4a2b" line={0.025} />
          <Bx a={[0.08, 0.08, 1.9]} p={[x, -0.45, 0]} r={[0.5, 0, 0]} c="#6b4a2b" line={0} />
          <Bx a={[0.08, 0.08, 1.9]} p={[x, -0.45, 0]} r={[-0.5, 0, 0]} c="#6b4a2b" line={0} />
        </group>
      ))}
      {Array.from({ length: PLANKS }, (_, i) => (
        <group key={i}>
          <Plank i={i} built={i < planks} />
          {i >= planks && (
            <mesh position={[X0 + i * STEP, Y, 0]}>
              <boxGeometry args={[0.22, 0.08, 1.76]} />
              <meshBasicMaterial color={INK} wireframe transparent opacity={0.3} />
            </mesh>
          )}
        </group>
      ))}
      {/* railings rise as the deck reaches them */}
      {posts.map((pi, k) =>
        pi < planks ? (
          <group key={pi}>
            {[-0.85, 0.85].map((z) => (
              <group key={z}>
                <Bx a={[0.1, 0.8, 0.1]} p={[X0 + pi * STEP, Y + 0.4, z]} c="#6b4a2b" line={0.025} />
                {k > 0 && (
                  <Bx
                    a={[(pi - posts[k - 1]) * STEP, 0.07, 0.07]}
                    p={[X0 + ((pi + posts[k - 1]) / 2) * STEP, Y + 0.7, z]}
                    c="#8a6b45"
                    line={0.02}
                  />
                )}
              </group>
            ))}
          </group>
        ) : null,
      )}
      <Crane />
    </group>
  )
}
