import { BackSide, Color, DoubleSide, ShaderMaterial, Vector3 } from 'three'

/**
 * Ink-and-watercolour material. Flat washes with paper bleed, pencil hatching
 * in the shade, drawn surface detail (shingles, planks, cobbles, grass ticks,
 * foliage scallops, water lines) and a "boil": the line work re-seeds a few
 * times a second so the scene shimmers like hand-drawn animation frames.
 */
export const inkUniforms = {
  uSeed: { value: 0 },
  uTime: { value: 0 },
  uDusk: { value: 0 },
  uLight: { value: new Vector3(0.55, 0.75, 0.35).normalize() },
  uInk: { value: new Color('#2b2118') },
  uBg: { value: new Color('#e9dcb8') },
}

const vert = /* glsl */ `
uniform float uSeed;
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
varying vec3 vNo;
varying vec3 vC;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  // Surfaces hold still: jittering every vertex opened seams and made faces fight for depth.
  // The hand-drawn wobble lives in the outlines (hull) only.
  vW = w.xyz;
  vO = position;
  vNo = normal;
  vN = normalize(mat3(m) * normal);
  vC = vec3(1.0);
  #ifdef USE_COLOR
  vC = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vC *= instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uHatch;
uniform vec3 uInk;
uniform vec3 uBg;
uniform vec3 uLight;
uniform vec3 uPatCol;
uniform float uSeed;
uniform float uTime;
uniform float uDusk;
uniform float uOpacity;
uniform float uPat;
uniform float uScale;
uniform float uAspect;
uniform float uAmt;
uniform float uSwap;
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
varying vec3 vNo;
varying vec3 vC;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float ln(float v, float w){ return smoothstep(w, w * 0.35, abs(v)); }

float pattern(vec2 p){
  if (uPat < 0.5) return 0.0;
  p *= uScale;
  vec2 q = p + (vec2(noise(p * 2.0), noise(p * 2.0 + 7.0)) - 0.5) * 0.07;
  if (uPat < 1.5) { // courses: planks, shingles, bricks
    float row = floor(q.y);
    float x = q.x / uAspect + mod(row, 2.0) * 0.5 + hash(vec2(row, 3.0)) * 0.3;
    float keep = step(0.22, hash(vec2(floor(x), row)));
    float h = smoothstep(0.1, 0.03, fract(q.y)) * step(0.12, hash(vec2(floor(x * 0.5), row + 9.0)));
    float v = smoothstep(0.1, 0.03, fract(x) * uAspect) * keep;
    return max(h, v);
  }
  if (uPat < 2.5) { // cobbles
    vec2 i = floor(q), f = fract(q);
    float d1 = 8.0, d2 = 8.0;
    for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) {
      vec2 g = vec2(float(a), float(b));
      vec2 o = vec2(hash(i + g), hash(i + g + 17.0));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return smoothstep(0.1, 0.02, d2 - d1);
  }
  if (uPat < 3.5) { // grass ticks on top, strata on cliffs
    if (vNo.y < 0.7) return ln(fract(vO.y * 1.5 + noise(q * 0.5) * 0.9) - 0.5, 0.07) * 0.9;
    vec2 i = floor(q), f = fract(q) - 0.5;
    float r = hash(i);
    if (r < 0.5) return 0.0;
    float a = (r - 0.75) * 1.8;
    float t1 = ln(f.x - f.y * a, 0.07) * step(abs(f.y), 0.3);
    float t2 = ln(f.x - 0.2 + f.y * 0.55, 0.06) * step(abs(f.y), 0.2) * step(0.72, r);
    return max(t1, t2);
  }
  if (uPat < 4.5) { // thatch
    float c = floor(q.x * 3.0);
    float off = hash(vec2(c, 1.0));
    float r = hash(vec2(c, floor(q.y + off)));
    return ln(fract(q.x * 3.0) - 0.5, 0.14) * step(0.3, r) * step(fract(q.y + off), 0.78);
  }
  if (uPat < 5.5) { // water
    float w = sin(q.y * 6.283 + sin(q.x * 3.0 + uTime * 1.3) * 1.2 - uTime * 2.4);
    return smoothstep(0.9, 0.99, w) * step(0.3, noise(vec2(q.x * 1.5, q.y * 0.4 - uTime * 0.35)));
  }
  if (uPat < 6.5) { // furrows
    return ln(fract(q.x) - 0.5, 0.09);
  }
  if (uPat < 7.5) { // foliage scallops
    vec2 i = floor(q), f = fract(q) - 0.5;
    float r = hash(i);
    f.x += (r - 0.5) * 0.4;
    float d = abs(length(f - vec2(0.0, -0.15)) - 0.32);
    return smoothstep(0.08, 0.02, d) * step(-0.1, f.y) * step(0.25, r);
  }
  // map sea: rows of little waves
  float row = floor(q.y);
  float x = q.x + mod(row, 2.0) * 0.5;
  vec2 f = vec2(fract(x) - 0.5, fract(q.y));
  float d = abs(length(f) - 0.4);
  return smoothstep(0.06, 0.015, d) * step(0.08, f.y) * step(0.45, hash(vec2(floor(x), row)));
}

void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float d = dot(n, uLight);
  float wash = noise(vW.xz * 0.55 + vW.y * 0.4) * 0.6 + noise(vW.xz * 2.3 + 9.0) * 0.4;
  vec3 col = uColor * vC * (0.86 + 0.26 * wash);
  col = mix(col, col * vec3(0.78, 0.76, 0.86), smoothstep(0.35, -0.2, d));
  col = mix(col, col * vec3(1.08, 0.8, 0.66), uDusk * 0.75);

  vec3 an = abs(vNo);
  vec2 p = an.y > 0.85 ? vO.xz : (an.x > an.z ? vO.zy : vO.xy);
  if (uSwap > 0.5) p = p.yx;
  col = mix(col, uPatCol, pattern(p) * uAmt);

  vec2 s = gl_FragCoord.xy;
  float wob = noise(s * 0.035) * 5.0;
  float h1 = smoothstep(0.62, 0.9, sin((s.x + s.y) * 0.75 + wob) * 0.5 + 0.5);
  float h2 = smoothstep(0.62, 0.9, sin((s.x - s.y) * 0.75 + wob * 1.3) * 0.5 + 0.5);
  float inkAmt = max(h1 * smoothstep(0.42, 0.22, d), h2 * smoothstep(0.02, -0.25, d)) * 0.5 * uHatch;
  col = mix(col, uInk, inkAmt);

  // ink pooling along silhouettes
  float rim = 1.0 - abs(dot(n, normalize(cameraPosition - vW)));
  col = mix(col, uInk, smoothstep(0.72, 1.0, rim) * 0.3);

  col *= 0.97 + 0.04 * hash(floor(s * 0.5));
  if (uPat > 7.5) col = mix(col, uBg, smoothstep(56.0, 95.0, length(vW.xz)));
  gl_FragColor = vec4(col, uOpacity);
}`

export interface InkOpts {
  /** Pencil hatching in the shade (0 = none, for soft things like clouds). */
  hatch?: number
  pat?: number
  scale?: number
  aspect?: number
  amt?: number
  patCol?: string
  swap?: boolean
  opacity?: number
  double?: boolean
  vc?: boolean
}

export const PAT: Record<string, InkOpts> = {
  planks: { pat: 1, scale: 4.5, aspect: 5 },
  planksV: { pat: 1, scale: 4.5, aspect: 5, swap: true },
  shingle: { pat: 1, scale: 4.2, aspect: 0.8, swap: true },
  brick: { pat: 1, scale: 4, aspect: 2 },
  cobble: { pat: 2, scale: 2.6 },
  grass: { pat: 3, scale: 2.4, amt: 0.42 },
  thatch: { pat: 4, scale: 2, swap: true },
  water: { pat: 5, scale: 0.55, patCol: '#f7f1dc', amt: 0.8 },
  fall: { pat: 5, scale: 0.9, patCol: '#f7f1dc', amt: 0.85, double: true },
  furrow: { pat: 6, scale: 2.4, amt: 0.45 },
  leaves: { pat: 7, scale: 3.2, amt: 0.5 },
  sea: { pat: 8, scale: 0.42, amt: 0.4 },
}

const cache = new Map<string, ShaderMaterial>()

export function ink(color: string, o: InkOpts = {}): ShaderMaterial {
  const key = color + JSON.stringify(o)
  let m = cache.get(key)
  if (!m) {
    const opacity = o.opacity ?? 1
    m = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      vertexColors: !!o.vc,
      side: o.double ? DoubleSide : undefined,
      uniforms: {
        ...inkUniforms,
        uColor: { value: new Color(color) },
        uPatCol: { value: new Color(o.patCol ?? '#2b2118') },
        uOpacity: { value: opacity },
        uPat: { value: o.pat ?? 0 },
        uScale: { value: o.scale ?? 1 },
        uAspect: { value: o.aspect ?? 1 },
        uAmt: { value: o.amt ?? 0.5 },
        uSwap: { value: o.swap ? 1 : 0 },
        uHatch: { value: o.hatch ?? 1 },
      },
    })
    cache.set(key, m)
  }
  return m
}

/** Hatched blob shadow, drawn flat on the ground. */
export const shadowMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uSeed: inkUniforms.uSeed, uInk: inkUniforms.uInk },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uSeed; uniform vec3 uInk; varying vec2 vUv;
    void main(){
      float r = length(vUv - 0.5) * 2.0;
      vec2 s = gl_FragCoord.xy;
      float h = smoothstep(0.55, 0.9, sin((s.x + s.y) * 0.75) * 0.5 + 0.5);
      gl_FragColor = vec4(uInk, smoothstep(1.0, 0.5, r) * (0.13 + 0.3 * h));
    }`,
})

const hulls = new Map<number, ShaderMaterial>()

/** Inverted-hull ink outline whose weight wavers like a dip pen. */
export function hull(thickness: number): ShaderMaterial {
  let m = hulls.get(thickness)
  if (!m) {
    m = new ShaderMaterial({
      side: BackSide,
      uniforms: { uSeed: inkUniforms.uSeed, uInk: inkUniforms.uInk, uT: { value: thickness } },
      vertexShader: /* glsl */ `
        uniform float uSeed; uniform float uT;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec3 j = vec3(hash(w.xyz + uSeed), hash(w.yzx + uSeed + 3.1), hash(w.zxy + uSeed + 7.7)) - 0.5;
          vec3 n = normalize(mat3(modelMatrix) * normal);
          float weight = 0.7 + 0.6 * hash(floor(w.xyz * 2.5) + uSeed);
          w.xyz += j * 0.014 + n * uT * weight; // a gentle dip-pen waver, not a shake
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0); }`,
    })
    hulls.set(thickness, m)
  }
  return m
}

export const INK = '#2b2118'
