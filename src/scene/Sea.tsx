// The world around the island: an ink-and-watercolour sea (turquoise shallows hugging the real
// coastline, foam ripples along the shore, drifting wave strokes, fading into the paper at the
// horizon), a sky, distant islands, clouds, sailboats and gulls.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, ClampToEdgeWrapping, DataTexture, FloatType, Group, LinearFilter, RedFormat, RepeatWrapping, ShaderMaterial } from 'three'
import { inkUniforms } from './ink'
import { Bx, Cn, Cy, Ic } from './kit'
import { mask } from '../terrain'

export const SEA_Y = -1.6

/** The coastline: how far from the centre the land ends, for 512 directions. */
function coastTexture() {
  const N = 512
  const data = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2 - Math.PI
    let r = 0
    for (let k = 0; k < 400; k++) { const rr = k * 0.2; if (mask(Math.cos(t) * rr, Math.sin(t) * rr) < 0) { r = rr; break } }
    data[i] = r || 40
  }
  const tex = new DataTexture(data, N, 1, RedFormat, FloatType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.magFilter = tex.minFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

const seaVert = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`

const seaFrag = /* glsl */ `
uniform float uTime; uniform float uDusk; uniform vec3 uBg; uniform vec3 uInk; uniform sampler2D uCoast;
varying vec3 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = vW.xz;
  float r = length(p);
  float R = texture2D(uCoast, vec2(atan(p.y, p.x) / 6.2831853 + 0.5, 0.5)).r;
  float d = r - R;                      // distance out from the shore (roughly)
  if (d < -0.6) discard;                 // never inside the island
  float wash = noise(p * 0.05) * 0.6 + noise(p * 0.21 + 4.0) * 0.4;
  vec3 shallow = vec3(0.67, 0.82, 0.77), mid = vec3(0.52, 0.72, 0.71), deep = vec3(0.42, 0.61, 0.66);
  vec3 col = mix(shallow, mid, smoothstep(0.0, 10.0, d));
  col = mix(col, deep, smoothstep(12.0, 60.0, d));
  col *= 0.9 + 0.18 * wash;
  // foam: a bright rim on the shore and ripples running parallel to it
  float wob = noise(p * 0.35 + uTime * 0.05) * 1.6;
  float rim = smoothstep(0.9, 0.0, d + wob * 0.25);
  float ripples = smoothstep(0.86, 0.97, sin(d * 1.9 - uTime * 1.1 + wob)) * smoothstep(9.0, 1.0, d);
  col = mix(col, vec3(0.97, 0.95, 0.88), max(rim, ripples * 0.75));
  // open water: short drifting wave strokes in pale ink
  vec2 q = p * vec2(0.16, 0.42) + vec2(uTime * 0.05, 0.0);
  float w = sin(q.y * 6.283 + sin(q.x * 2.0 + uTime * 0.6) * 1.1 - uTime * 0.9);
  float strokes = smoothstep(0.93, 0.99, w) * step(0.55, noise(vec2(q.x * 1.3, q.y * 0.35)));
  col = mix(col, vec3(0.96, 0.95, 0.89), strokes * 0.65 * smoothstep(3.0, 10.0, d));
  // pencil hatching in the deep water
  vec2 s = gl_FragCoord.xy;
  float h = smoothstep(0.7, 0.95, sin((s.x + s.y) * 0.75 + noise(s * 0.03) * 5.0) * 0.5 + 0.5);
  col = mix(col, uInk, h * 0.12 * smoothstep(20.0, 70.0, d));
  col = mix(col, col * vec3(1.1, 0.82, 0.7), uDusk * 0.7);
  // into the paper at the horizon
  col = mix(col, uBg, smoothstep(150.0, 380.0, r));
  gl_FragColor = vec4(col, 1.0);
}`

const skyFrag = /* glsl */ `
uniform vec3 uBg; uniform float uDusk; varying vec3 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec3 dir = normalize(vW - cameraPosition);
  float e = dir.y;
  vec3 zenith = mix(vec3(0.74, 0.82, 0.83), vec3(0.86, 0.66, 0.55), uDusk);
  vec3 col = mix(uBg, zenith, smoothstep(0.0, 0.55, e));
  // soft painted streaks of cloud near the horizon
  float a = atan(dir.z, dir.x);
  float streak = noise(vec2(a * 6.0, e * 18.0)) * smoothstep(0.32, 0.04, abs(e - 0.12));
  col = mix(col, vec3(0.98, 0.96, 0.9), smoothstep(0.55, 0.85, streak) * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`

function Ocean() {
  const mat = useMemo(() => new ShaderMaterial({
    vertexShader: seaVert, fragmentShader: seaFrag,
    uniforms: { uTime: inkUniforms.uTime, uDusk: inkUniforms.uDusk, uBg: inkUniforms.uBg, uInk: inkUniforms.uInk, uCoast: { value: coastTexture() } },
  }), [])
  return (
    <mesh position={[0, SEA_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <circleGeometry args={[420, 96]} />
    </mesh>
  )
}

function Sky() {
  const mat = useMemo(() => new ShaderMaterial({
    vertexShader: seaVert, fragmentShader: skyFrag, side: BackSide, depthWrite: false,
    uniforms: { uBg: inkUniforms.uBg, uDusk: inkUniforms.uDusk },
  }), [])
  return <mesh material={mat} renderOrder={-1}><sphereGeometry args={[640, 32, 16]} /></mesh>
}

/** Faint islands on the horizon, already half lost in the paper. */
function Distant() {
  const isles = useMemo(() => [
    { a: 0.4, r: 190, s: 1.3, c: '#b7c2a4' }, { a: 1.5, r: 240, s: 1.8, c: '#bfc7ae' }, { a: 2.4, r: 175, s: 0.9, c: '#b3bfa6' },
    { a: 3.4, r: 260, s: 2.2, c: '#c4c9b2' }, { a: 4.3, r: 200, s: 1.1, c: '#b9c3a8' }, { a: 5.4, r: 225, s: 1.6, c: '#c0c6ae' },
  ], [])
  return (
    <group>
      {isles.map((i, k) => (
        <group key={k} position={[Math.cos(i.a) * i.r, SEA_Y, Math.sin(i.a) * i.r]} scale={i.s}>
          <Cn a={[9, 7, 7]} p={[0, 3.2, 0]} c={i.c} line={0.12} />
          <Cn a={[6, 5, 6]} p={[7, 2.2, 3]} c={i.c} line={0.1} />
          <Cn a={[5, 3.5, 6]} p={[-6, 1.5, -2]} c={i.c} line={0.1} />
        </group>
      ))}
    </group>
  )
}

/** Puffy ink clouds drifting round the island, outside its middle so they don't hide the towns. */
function Clouds() {
  const g = useRef<Group>(null!)
  const clouds = useMemo(() => Array.from({ length: 11 }, (_, k) => {
    const a = (k / 11) * Math.PI * 2 + (k % 3) * 0.3
    const r = 62 + (k * 37) % 90
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 20 + (k * 7) % 14, s: 1.4 + (k % 4) * 0.5, puffs: 4 + (k % 3) }
  }), [])
  useFrame((_, dt) => { g.current.rotation.y += dt * 0.006 })
  return (
    <group ref={g}>
      {clouds.map((c, k) => (
        <group key={k} position={[c.x, c.y, c.z]} scale={[c.s * 1.6, c.s * 0.75, c.s]}>
          {Array.from({ length: c.puffs }, (_, j) => <Ic key={j} a={[2.2 - (j % 2) * 0.6, 1]} p={[(j - c.puffs / 2) * 2.1, (j % 2) * 0.8, (j % 3) - 1]} c="#fbf6e8" o={{ hatch: 0 }} line={0.05} />)}
        </group>
      ))}
    </group>
  )
}

/** Little sailboats circling the island, bobbing on the swell. */
function Boats() {
  const boats = useMemo(() => [
    { r: 54, speed: 0.012, phase: 0.6, sail: '#f4ecd4' }, { r: 63, speed: -0.009, phase: 2.6, sail: '#e7c7a0' }, { r: 78, speed: 0.007, phase: 4.4, sail: '#f4ecd4' },
  ], [])
  const refs = useRef<Group[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    boats.forEach((b, k) => {
      const g = refs.current[k]
      if (!g) return
      const a = b.phase + t * b.speed
      g.position.set(Math.cos(a) * b.r, SEA_Y + 0.15 + Math.sin(t * 1.3 + k) * 0.12, Math.sin(a) * b.r)
      g.rotation.set(Math.sin(t * 1.1 + k) * 0.06, -a + (b.speed > 0 ? 0 : Math.PI), Math.cos(t * 0.9 + k) * 0.05)
    })
  })
  return (
    <group>
      {boats.map((b, k) => (
        <group key={k} ref={(el) => { if (el) refs.current[k] = el }} scale={1.6}>
          <Bx a={[0.7, 0.35, 2.1]} p={[0, 0.1, 0]} c="#7a5a3a" line={0.04} />
          <Bx a={[0.5, 0.06, 1.6]} p={[0, 0.3, 0]} c="#a07a4e" line={0.02} />
          <Cy a={[0.04, 0.04, 2.2, 5]} p={[0, 1.4, 0.1]} c="#5c4a36" line={0.02} />
          <Cn a={[0.75, 1.9, 3]} p={[0, 1.45, 0.45]} s={[0.25, 1, 1]} c={b.sail} line={0.03} />
        </group>
      ))}
    </group>
  )
}

/** Gulls wheeling over the island. */
function Gulls() {
  const gulls = useMemo(() => Array.from({ length: 7 }, (_, k) => ({ r: 12 + k * 4.5, y: 13 + (k % 3) * 3, speed: 0.18 + (k % 4) * 0.05, phase: k * 0.9 })), [])
  const refs = useRef<Group[]>([])
  const wings = useRef<[Group, Group][]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    gulls.forEach((b, k) => {
      const g = refs.current[k]
      if (!g) return
      const a = b.phase + t * b.speed
      g.position.set(Math.cos(a) * b.r - 2, b.y + Math.sin(t * 0.7 + k) * 0.8, Math.sin(a) * b.r)
      g.rotation.y = -a
      const f = Math.sin(t * 5 + k * 1.7) * 0.45
      const w = wings.current[k]
      if (w) { w[0].rotation.z = 0.25 + f; w[1].rotation.z = -0.25 - f }
    })
  })
  return (
    <group>
      {gulls.map((_, k) => (
        <group key={k} ref={(el) => { if (el) refs.current[k] = el }}>
          <group ref={(el) => { if (el) (wings.current[k] ??= [el, el])[0] = el }}><Bx a={[0.7, 0.04, 0.22]} p={[0.35, 0, 0]} c="#f2ede0" line={0.03} /></group>
          <group ref={(el) => { if (el) (wings.current[k] ??= [el, el])[1] = el }}><Bx a={[0.7, 0.04, 0.22]} p={[-0.35, 0, 0]} c="#f2ede0" line={0.03} /></group>
          <Bx a={[0.12, 0.1, 0.4]} c="#f2ede0" line={0.03} />
        </group>
      ))}
    </group>
  )
}

export default function Sea() {
  return (
    <group>
      <Sky />
      <Ocean />
      <Distant />
      <Clouds />
      <Boats />
      <Gulls />
    </group>
  )
}
