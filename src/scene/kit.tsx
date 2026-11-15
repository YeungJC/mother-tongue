import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, ExtrudeGeometry, Group, Mesh, Shape } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hull, ink, InkOpts, shadowMat } from './ink'
import { groundY } from '../terrain'

export type V3 = [number, number, number]

interface MeshP {
  p?: V3
  r?: V3
  s?: number | V3
  c: string
  o?: InkOpts
  line?: number
  children?: React.ReactNode
}

/** Smooth-normal copy of a geometry so the outline hull has no gaps at hard edges. */
function smoothed(src: BufferGeometry) {
  const g = new BufferGeometry()
  g.setAttribute('position', src.getAttribute('position').clone())
  if (src.index) g.setIndex(src.index.clone())
  const m = mergeVertices(g, 1e-3)
  m.computeVertexNormals()
  return m
}

/** Ink outline for the parent mesh. */
export function Line({ t }: { t: number }) {
  const ref = useRef<Group>(null!)
  const [geo, setGeo] = useState<BufferGeometry | null>(null)
  useLayoutEffect(() => {
    const parent = ref.current.parent as Mesh
    if (t > 0 && parent?.geometry) setGeo(smoothed(parent.geometry))
  }, [t])
  return <group ref={ref}>{geo && <mesh geometry={geo} material={hull(t)} />}</group>
}

/** Box */
export function Bx({ a, p, r, s, c, o, line = 0.05, children }: MeshP & { a: V3 }) {
  return (
    <mesh position={p} rotation={r} scale={s} material={ink(c, o)}>
      <boxGeometry args={a} />
      <Line t={line} />
      {children}
    </mesh>
  )
}

/** Cylinder: [radiusTop, radiusBottom, height, segments] */
export function Cy({ a, p, r, s, c, o, line = 0.05, children }: MeshP & { a: [number, number, number, number?] }) {
  return (
    <mesh position={p} rotation={r} scale={s} material={ink(c, o)}>
      <cylinderGeometry args={[a[0], a[1], a[2], a[3] ?? 9]} />
      <Line t={line} />
      {children}
    </mesh>
  )
}

/** Cone: [radius, height, segments] */
export function Cn({ a, p, r, s, c, o, line = 0.05, children }: MeshP & { a: [number, number, number?] }) {
  return (
    <mesh position={p} rotation={r} scale={s} material={ink(c, o)}>
      <coneGeometry args={[a[0], a[1], a[2] ?? 8]} />
      <Line t={line} />
      {children}
    </mesh>
  )
}

/** Lumpy ball: [radius, detail] */
export function Ic({ a, p, r, s, c, o, line = 0.05, children }: MeshP & { a: [number, number?] }) {
  return (
    <mesh position={p} rotation={r} scale={s} material={ink(c, o)}>
      <icosahedronGeometry args={[a[0], a[1] ?? 1]} />
      <Line t={line} />
      {children}
    </mesh>
  )
}

/** Triangular prism (gable wall). Ridge runs along z. */
export function Gable({ w, h, d, p, c, o, line = 0.05 }: { w: number; h: number; d: number; p?: V3; c: string; o?: InkOpts; line?: number }) {
  const geo = useMemo(() => {
    const sh = new Shape()
    sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath()
    const g = new ExtrudeGeometry(sh, { depth: d, bevelEnabled: false })
    g.translate(0, 0, -d / 2)
    return g
  }, [w, h, d])
  return (
    <mesh position={p} geometry={geo} material={ink(c, o)}>
      <Line t={line} />
    </mesh>
  )
}

/** Hatched shadow blob on the ground. */
export function Blob({ p = [0, 0, 0], s = 1, sx = 1 }: { p?: V3; s?: number; sx?: number }) {
  return (
    <mesh position={[p[0] - 0.25 * s, p[1] + 0.05, p[2] - 0.15 * s]} rotation={[-Math.PI / 2, 0, 0.5]} scale={[s * sx, s, 1]} material={shadowMat} renderOrder={1}>
      <circleGeometry args={[1, 20]} />
    </mesh>
  )
}

/** Places children on the terrain at (x, z). */
export function At({ x, z, rot = 0, s = 1, dy = 0, children }: { x: number; z: number; rot?: number; s?: number; dy?: number; children?: React.ReactNode }) {
  return (
    <group position={[x, groundY(x, z) + dy, z]} rotation={[0, rot, 0]} scale={s}>
      {children}
    </group>
  )
}
