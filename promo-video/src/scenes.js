// All 3D content. Every function is a pure function of time so any frame can be rendered
// in any order (deterministic, parallel-safe).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  W,
  H,
  FPS,
  clamp,
  lerp,
  range,
  ease,
  spring,
  warpYears,
  WARP_END,
  FLOORS,
  floorTime,
  graphYears,
  GRAPH_T0,
  cashFlow,
  breakEvenYear,
  graphYearTime,
} from './timeline.js';

// ------------------------------------------------------------------ utils
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise1 = (x, seed = 0) => {
  const i = Math.floor(x),
    f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
};

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
export const GOLD = '#f3c47e';
export const GOLD_DEEP = '#e0923a';
export const ICE = '#8fd2ff';
export const WARM_WHITE = '#fff3e2';

function bar(a, b, thick) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(thick, len, thick);
  g.translate(0, len / 2, 0);
  const s = new Float32Array(g.attributes.position.count);
  for (let i = 0; i < s.length; i++) s[i] = g.attributes.position.getY(i) / len;
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

// A bar that reveals from r0 (at a) to r1 (at b).
function revealBar(a, b, thick, r0 = 0, r1 = 1, extra = {}) {
  const g = bar(a, b, thick);
  const s = g.attributes.aS.array;
  const r = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) r[i] = lerp(r0, r1, s[i]);
  g.setAttribute('aReveal', new THREE.BufferAttribute(r, 1));
  const grp = new Float32Array(s.length).fill(extra.group ?? 0);
  g.setAttribute('aGroup', new THREE.BufferAttribute(grp, 1));
  g.deleteAttribute('aS');
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function textTexture(text, { font, size = 128, color = '#fff', pad = 16, spacing = 0 }) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${font.replace('{size}', size)}`;
  ctx.letterSpacing = `${spacing}px`;
  const m = ctx.measureText(text);
  c.width = Math.ceil(m.width + pad * 2);
  c.height = Math.ceil(size * 1.35 + pad * 2);
  ctx.font = `${font.replace('{size}', size)}`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: c.width / c.height };
}

function glowTexture(size = 256, falloff = 2.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5,
        dy = (y + 0.5) / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const v = Math.pow(Math.max(0, 1 - r), falloff) + 0.35 * Math.exp(-r * r * 60);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function streakTexture() {
  const w = 512,
    h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = Math.abs((x + 0.5) / w - 0.5) * 2,
        dy = Math.abs((y + 0.5) / h - 0.5) * 2;
      const v = Math.pow(1 - dx, 3) * Math.exp(-dy * dy * 18);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

const additive = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
};

// Point sprites with per-point size / colour / alpha, all updated on the CPU.
function makePoints(n, seedColor = ICE) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(0.05), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const m = new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uScale: { value: 500 }, uColor: { value: C(seedColor) } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
      uniform float uScale; uniform vec3 uColor;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = aSize * uScale / max(0.05, -mv.z);
        // keep sub-pixel points energy-preserving instead of shrinking to nothing
        float k = clamp(s / 2.0, 0.0, 1.0);
        gl_PointSize = clamp(max(s, 2.0), 1.0, 96.0);
        vColor = uColor * aColor * aAlpha * k * k;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        float a = exp(-r * r * 4.0) + 0.5 * exp(-r * r * 30.0);
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// Additive "light-bar" material with draw-on reveal + scanline highlight + distance fade.
function lightMaterial({ color = GOLD, intensity = 2, fogStart = 10, fogDensity = 0.04 } = {}) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: {
      uColor: { value: C(color) },
      uIntensity: { value: intensity },
      uProgress: { value: 1 },
      uGroupProgress: { value: Array.from({ length: 12 }, () => 1) },
      uGroupFlash: { value: Array.from({ length: 12 }, () => 0) },
      uFlash: { value: 0 },
      uScanY: { value: -100 },
      uScanColor: { value: C(ICE, 3) },
      uFogStart: { value: fogStart },
      uFogDensity: { value: fogDensity },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aReveal;
      attribute float aGroup;
      uniform float uGroupProgress[12];
      uniform float uGroupFlash[12];
      varying float vReveal; varying float vDepth; varying vec3 vWorld;
      varying float vProg; varying float vGFlash;
      void main() {
        vReveal = aReveal;
        int gi = int(aGroup + 0.5);
        vProg = 1.0; vGFlash = 0.0;
        for (int i = 0; i < 12; i++) { if (i == gi) { vProg = uGroupProgress[i]; vGFlash = uGroupFlash[i]; } }
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity; uniform float uProgress; uniform float uFlash;
      uniform float uScanY; uniform vec3 uScanColor; uniform float uFogStart; uniform float uFogDensity;
      uniform float uOpacity;
      varying float vReveal; varying float vDepth; varying vec3 vWorld; varying float vProg; varying float vGFlash;
      void main() {
        float p = min(uProgress, vProg);
        if (vReveal > p) discard;
        float lead = smoothstep(p - 0.1, p, vReveal) * step(p, 0.999);
        vec3 c = uColor * uIntensity * (1.0 + uFlash + vGFlash * 3.0) + vec3(1.0, 0.92, 0.82) * lead * 6.0;
        c += uScanColor * exp(-abs(vWorld.y - uScanY) * 7.0);
        float fog = exp(-max(vDepth - uFogStart, 0.0) * uFogDensity);
        gl_FragColor = vec4(c * fog * uOpacity, 1.0);
      }`,
  });
}

// ================================================================== WARP
const YL = 6; // world units per year
const TX = 3.4,
  TY0 = -1.5,
  TY1 = 2.1;

function buildWarp(root) {
  const g = new THREE.Group();
  root.add(g);

  const box = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, ...additive });
  const specs = [];
  const months = 12 * 58;
  for (let m = 0; m <= months; m++) {
    const z = (-m * YL) / 12;
    const year = m % 12 === 0;
    const len = year ? 1.05 : m % 6 === 0 ? 0.62 : m % 3 === 0 ? 0.42 : 0.22;
    const k = year ? 3.2 : m % 3 === 0 ? 1.5 : 0.9;
    const y = m / 12;
    const beyond = y > 50 ? Math.exp(-(y - 50) * 0.9) : 1;
    const gold = C(GOLD, k * beyond);
    const ice = C(ICE, k * 0.55 * beyond);
    // floor + ceiling (ticks along x from both side edges)
    for (const [yy, face] of [
      [TY0, 0],
      [TY1, 1],
    ])
      for (const sx of [-1, 1])
        specs.push({
          face,
          pos: [sx * (TX - len / 2), yy, z],
          scale: [len, 0.022, 0.035],
          color: face === 0 ? gold : C(GOLD, k * 0.5 * beyond),
        });
    // walls (ticks along y from both edges)
    for (const sx of [-1, 1])
      for (const [yy, dir] of [
        [TY0, 1],
        [TY1, -1],
      ])
        specs.push({ face: 2, pos: [sx * TX, yy + (dir * len) / 2, z], scale: [0.022, len, 0.035], color: ice });
    // year gates
    if (year && m > 0) {
      const yr = m / 12;
      const gk = (yr === 50 ? 9 : yr % 10 === 0 ? 1.6 : 0.35) * beyond;
      const th = yr === 50 ? 0.05 : 0.02;
      const col = C(yr === 50 ? WARM_WHITE : GOLD, gk);
      specs.push({ face: 3, pos: [0, TY0, z], scale: [TX * 2, th, th], color: col, gate: yr });
      specs.push({ face: 3, pos: [0, TY1, z], scale: [TX * 2, th, th], color: col, gate: yr });
      specs.push({ face: 3, pos: [-TX, (TY0 + TY1) / 2, z], scale: [th, TY1 - TY0, th], color: col, gate: yr });
      specs.push({ face: 3, pos: [TX, (TY0 + TY1) / 2, z], scale: [th, TY1 - TY0, th], color: col, gate: yr });
    }
  }
  // rails
  const railLen = months / 12 * YL + 40;
  for (const x of [-TX, TX])
    for (const y of [TY0, TY1])
      specs.push({
        face: y === TY0 ? 0 : 1,
        pos: [x, y, -railLen / 2 + 20],
        scale: [0.03, 0.03, railLen],
        color: C(GOLD, y === TY0 ? 1.3 : 0.6),
      });

  const inst = new THREE.InstancedMesh(box, mat, specs.length);
  const rand = rng(7);
  const m4 = new THREE.Matrix4();
  specs.forEach((s, i) => {
    s.rand = rand();
    m4.compose(V(...s.pos), new THREE.Quaternion(), V(...s.scale));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, s.color);
  });
  inst.frustumCulled = false;
  g.add(inst);

  // Year numerals lying on the floor
  const labels = new THREE.Group();
  for (let y = 1; y <= 50; y++) {
    const { tex, aspect } = textTexture(String(y).padStart(2, '0'), {
      font: '200 {size}px Manrope',
      size: 150,
      color: '#fff',
    });
    const big = y % 10 === 0 || y === 50;
    const sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(aspect * 0.55, 0.55),
      new THREE.MeshBasicMaterial({
        map: tex,
        color: C(y === 50 ? WARM_WHITE : GOLD, y === 50 ? 3.5 : big ? 1.8 : 0.9),
        fog: true,
        ...additive,
      }),
    );
    sprite.rotation.x = -Math.PI / 2;
    sprite.position.set(-TX + 1.75, TY0 + 0.003, -y * YL + 0.55);
    labels.add(sprite);
    // mirrored on the ceiling for the right side
    const s2 = sprite.clone();
    s2.rotation.x = Math.PI / 2;
    s2.position.set(TX - 1.75, TY1 - 0.003, -y * YL + 0.55);
    s2.material = sprite.material.clone();
    s2.material.color.multiplyScalar(0.45);
    labels.add(s2);
  }
  g.add(labels);

  // Destination glow beyond year 50
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ map: glowTexture(256, 3), color: C('#ffd6a0', 1.2), ...additive }),
  );
  glow.position.set(0, 0.2, -50 * YL - 60);
  g.add(glow);

  // Shockwave frame at the landing
  const shock = new THREE.Group();
  const shockMat = new THREE.MeshBasicMaterial({ color: C(WARM_WHITE, 4), ...additive });
  const th = 0.03;
  for (const [x, y, sx, sy] of [
    [0, TY0, TX * 2, th],
    [0, TY1, TX * 2, th],
    [-TX, (TY0 + TY1) / 2, th, TY1 - TY0],
    [TX, (TY0 + TY1) / 2, th, TY1 - TY0],
  ]) {
    const b = new THREE.Mesh(box, shockMat);
    b.position.set(x, y, 0);
    b.scale.set(sx, sy, th);
    shock.add(b);
  }
  shock.position.set(0, 0, -50 * YL);
  g.add(shock);

  // Speed dust
  const dust = makePoints(2600, ICE);
  const dr = rng(11);
  const dpos = dust.geometry.attributes.position.array;
  const dsz = dust.geometry.attributes.aSize.array;
  const dcol = dust.geometry.attributes.aColor.array;
  for (let i = 0; i < 2600; i++) {
    dpos[i * 3] = (dr() * 2 - 1) * TX * 0.95;
    dpos[i * 3 + 1] = lerp(TY0, TY1, dr());
    dpos[i * 3 + 2] = 10 - dr() * (50 * YL + 60);
    dsz[i] = 0.012 + dr() * 0.03;
    const warm = dr() < 0.35;
    const c = C(warm ? GOLD : ICE, 0.8 + dr() * 2.5);
    dcol[i * 3] = c.r;
    dcol[i * 3 + 1] = c.g;
    dcol[i * 3 + 2] = c.b;
  }
  g.add(dust);

  return { g, inst, specs, m4, labels, glow, shock, shockMat, dust, mat };
}

// ================================================================== BUILD
const BW = 2.6,
  BD = 1.8,
  FH = 0.9;

function buildBuilding(root) {
  const g = new THREE.Group();
  root.add(g);
  const geos = [];
  const T = 0.028;
  for (let i = 0; i <= FLOORS; i++) {
    const y = i * FH;
    const grp = Math.min(i, FLOORS - 1) + (i === FLOORS ? 1 : 0);
    const gi = Math.min(grp, 11);
    // slab outline: from each edge midpoint outwards
    const corners = [V(-BW, y, -BD), V(BW, y, -BD), V(BW, y, BD), V(-BW, y, BD)];
    for (let k = 0; k < 4; k++) {
      const a = corners[k],
        b = corners[(k + 1) % 4];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      geos.push(revealBar(mid, a, T, 0, 1, { group: gi }));
      geos.push(revealBar(mid, b, T, 0, 1, { group: gi }));
    }
    // balcony (front) for residential floors
    if (i >= 1 && i < FLOORS) {
      const bz = BD + 0.55;
      const bx = BW - 0.2;
      const pts = [V(-bx, y, BD), V(-bx, y, bz), V(bx, y, bz), V(bx, y, BD)];
      for (let k = 0; k < 3; k++) geos.push(revealBar(pts[k], pts[k + 1], T * 0.8, 0.2, 1, { group: gi }));
      // railing top
      const ry = y + 0.34;
      geos.push(revealBar(V(-bx, ry, bz), V(bx, ry, bz), T * 0.6, 0.3, 1, { group: gi }));
      for (const x of [-bx, bx]) geos.push(revealBar(V(x, y, bz), V(x, ry, bz), T * 0.6, 0.3, 1, { group: gi }));
    }
    // columns and mullions up to next floor
    if (i < FLOORS) {
      const cols = [
        [-BW, -BD],
        [BW, -BD],
        [BW, BD],
        [-BW, BD],
        [-BW / 3, BD],
        [BW / 3, BD],
        [-BW, 0],
        [BW, 0],
      ];
      cols.forEach(([x, z], ci) =>
        geos.push(revealBar(V(x, y, z), V(x, y + FH, z), ci < 4 ? T : T * 0.6, 0, 1, { group: gi })),
      );
    }
  }
  // roof parapet + crown
  const ry = FLOORS * FH;
  geos.push(revealBar(V(-BW * 0.45, ry, -BD * 0.5), V(-BW * 0.45, ry + 0.5, -BD * 0.5), T, 0, 1, { group: 7 }));
  geos.push(revealBar(V(BW * 0.45, ry, -BD * 0.5), V(BW * 0.45, ry + 0.5, -BD * 0.5), T, 0, 1, { group: 7 }));
  geos.push(revealBar(V(-BW * 0.45, ry + 0.5, -BD * 0.5), V(BW * 0.45, ry + 0.5, -BD * 0.5), T, 0, 1, { group: 7 }));

  const edgeMat = lightMaterial({ color: WARM_WHITE, intensity: 1.0, fogStart: 18, fogDensity: 0.04 });
  const edges = new THREE.Mesh(mergeGeometries(geos), edgeMat);
  edges.frustumCulled = false;
  g.add(edges);

  // Glass skin
  const glassMat = new THREE.ShaderMaterial({
    ...additive,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uScanY: { value: -100 },
      uOpacity: { value: 1 },
      uDeep: { value: C('#10355c', 1) },
      uIce: { value: C(ICE, 1) },
      uWarm: { value: C('#ffb865', 1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uReveal; uniform float uScanY; uniform float uOpacity;
      uniform vec3 uDeep; uniform vec3 uIce; uniform vec3 uWarm;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        if (vW.y > uReveal) discard;
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
        vec3 c = mix(uDeep * 0.18, uIce * 0.3, f);
        float streak = smoothstep(0.82, 1.0, sin((vW.x * 0.8 + vW.y * 0.9 + vW.z * 0.8) * 1.6 - uTime * 2.2));
        c += uIce * streak * 0.07;
        vec2 cell = floor(vec2((vW.x + vW.z) / 0.866, vW.y / 0.9));
        float lit = step(0.62, hash(cell));
        vec2 fc = fract(vec2((vW.x + vW.z) / 0.866, vW.y / 0.9));
        float inner = smoothstep(0.0, 0.12, fc.x) * smoothstep(1.0, 0.88, fc.x) * smoothstep(0.05, 0.2, fc.y) * smoothstep(0.95, 0.7, fc.y);
        c += uWarm * lit * inner * 0.16 * (0.7 + 0.3 * sin(uTime * 0.7 + hash(cell) * 6.0));
        c += uIce * exp(-abs(vW.y - uScanY) * 5.0) * 0.8;
        gl_FragColor = vec4(c * uOpacity, 1.0);
      }`,
  });
  const skin = new THREE.Group();
  const H0 = FLOORS * FH;
  const faces = [
    [new THREE.PlaneGeometry(BW * 2, H0), [0, H0 / 2, BD], 0],
    [new THREE.PlaneGeometry(BW * 2, H0), [0, H0 / 2, -BD], Math.PI],
    [new THREE.PlaneGeometry(BD * 2, H0), [BW, H0 / 2, 0], Math.PI / 2],
    [new THREE.PlaneGeometry(BD * 2, H0), [-BW, H0 / 2, 0], -Math.PI / 2],
  ];
  for (const [geo, p, ry] of faces) {
    const m = new THREE.Mesh(geo, glassMat);
    m.position.set(...p);
    m.rotation.y = ry;
    skin.add(m);
  }
  g.add(skin);

  // Scan frame (rectangle) that rides the construction
  const scanGeos = [];
  const sx = BW + 0.5,
    sz = BD + 0.9;
  const sc = [V(-sx, 0, -sz), V(sx, 0, -sz), V(sx, 0, sz), V(-sx, 0, sz)];
  for (let k = 0; k < 4; k++) scanGeos.push(revealBar(sc[k], sc[(k + 1) % 4], 0.018));
  const scanMat = lightMaterial({ color: ICE, intensity: 3.5, fogStart: 20 });
  const scan = new THREE.Mesh(mergeGeometries(scanGeos), scanMat);
  g.add(scan);
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(sx * 2, sz * 2),
    new THREE.MeshBasicMaterial({ color: C(ICE, 0.12), ...additive, side: THREE.DoubleSide }),
  );
  sheet.rotation.x = -Math.PI / 2;
  scan.add(sheet);

  // Ground: measuring dial
  const dial = new THREE.Group();
  const dialGeos = [];
  const ringR = [4.6, 5.3, 7.4];
  ringR.forEach((r, ri) => {
    const n = ri === 1 ? 180 : 120;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const len = k % 10 === 0 ? 0.36 : k % 5 === 0 ? 0.2 : 0.1;
      const dir = V(Math.cos(a), 0, Math.sin(a));
      dialGeos.push(revealBar(dir.clone().multiplyScalar(r), dir.clone().multiplyScalar(r + len * (ri === 1 ? -1 : 1)), 0.014, k / n, k / n));
    }
  });
  const dialMat = lightMaterial({ color: GOLD, intensity: 0.75, fogStart: 10, fogDensity: 0.07 });
  const dialMesh = new THREE.Mesh(mergeGeometries(dialGeos), dialMat);
  dial.add(dialMesh);
  for (const r of ringR) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.006, r + 0.006, 256),
      new THREE.MeshBasicMaterial({ color: C(GOLD, 0.6), ...additive, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    dial.add(ring);
  }
  const floorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ map: glowTexture(256, 2.5), color: C('#2a5c8c', 0.35), ...additive }),
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = -0.01;
  dial.add(floorGlow);
  g.add(dial);

  // grid
  const grid = new THREE.GridHelper(60, 60, 0x1d2c3d, 0x111a24);
  grid.material.transparent = true;
  grid.material.blending = THREE.AdditiveBlending;
  grid.material.depthWrite = false;
  grid.position.y = -0.02;
  g.add(grid);

  // particles that assemble the building
  const N = 3600;
  const parts = makePoints(N, WARM_WHITE);
  const r = rng(21);
  const pdata = [];
  const edgeGeo = edges.geometry;
  const pos = edgeGeo.attributes.position.array;
  const grpA = edgeGeo.attributes.aGroup.array;
  const vcount = pos.length / 3;
  for (let i = 0; i < N; i++) {
    const vi = Math.floor(r() * vcount);
    const vj = Math.min(vcount - 1, vi + 1 + Math.floor(r() * 3));
    const u = r();
    const target = V(
      lerp(pos[vi * 3], pos[vj * 3], u),
      lerp(pos[vi * 3 + 1], pos[vj * 3 + 1], u),
      lerp(pos[vi * 3 + 2], pos[vj * 3 + 2], u),
    );
    const theta = r() * Math.PI * 2,
      rad = 6 + r() * 9;
    const start = V(Math.cos(theta) * rad, target.y + (r() - 0.3) * 8, Math.sin(theta) * rad);
    const grp = Math.min(FLOORS - 1, Math.round(grpA[vi]));
    pdata.push({ target, start, t0: floorTime(grp) - 0.55 - r() * 0.35, dur: 0.45 + r() * 0.2, seed: r() * 100, size: 0.02 + r() * 0.035, warm: r() < 0.6 });
  }
  g.add(parts);

  // ambient dust
  const amb = makePoints(900, ICE);
  const ar = rng(5);
  const ap = amb.geometry.attributes.position.array;
  const as = amb.geometry.attributes.aSize.array;
  const aa = amb.geometry.attributes.aAlpha.array;
  const ambBase = [];
  for (let i = 0; i < 900; i++) {
    ambBase.push([(ar() * 2 - 1) * 16, ar() * 10, (ar() * 2 - 1) * 16, ar() * 10]);
    as[i] = 0.015 + ar() * 0.03;
    aa[i] = 0.3 + ar() * 0.9;
    ap[i * 3] = ambBase[i][0];
  }
  g.add(amb);

  return { g, edges, edgeMat, glassMat, skin, scan, scanMat, sheet, dial, dialMat, parts, pdata, amb, ambBase, grid };
}

// ================================================================== GRAPH
const GX0 = -9,
  GX1 = 9,
  GY0 = -2.0,
  GYK = 5.0 / 2400,
  GBASE = -2.75;
export const gx = (year) => GX0 + ((GX1 - GX0) * year) / 50;
export const gy = (v) => GY0 + v * GYK;

function buildGraph(root) {
  const g = new THREE.Group();
  root.add(g);
  const N = 500;
  // ribbon (line) + area fill
  const lp = [],
    ls = [],
    ap = [],
    as = [],
    av = [],
    li = [],
    ai = [];
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const y = (50 * i) / N;
    pts.push(V(gx(y), gy(cashFlow(y)), 0));
  }
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(N, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    const n = V(-t.y, t.x, 0);
    const w = 0.028;
    lp.push(p.x + n.x * w, p.y + n.y * w, 0, p.x - n.x * w, p.y - n.y * w, 0);
    ls.push(i / N, i / N);
    ap.push(p.x, p.y, -0.01, p.x, GBASE, -0.01);
    as.push(i / N, i / N);
    av.push(1, 0);
    if (i < N) {
      const k = i * 2;
      li.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      ai.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lineGeo.setAttribute('aS', new THREE.Float32BufferAttribute(ls, 1));
  lineGeo.setIndex(li);
  const lineMat = new THREE.ShaderMaterial({
    ...additive,
    side: THREE.DoubleSide,
    uniforms: { uProgress: { value: 0 }, uA: { value: C(ICE, 3.2) }, uB: { value: C(GOLD, 4.5) } },
    vertexShader: /* glsl */ `attribute float aS; varying float vS;
      void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uProgress; uniform vec3 uA; uniform vec3 uB; varying float vS;
      void main(){ if (vS > uProgress) discard;
        vec3 c = mix(uA, uB, smoothstep(0.0, 0.6, vS));
        c *= 0.75 + 1.8 * exp(-(uProgress - vS) * 40.0);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const line = new THREE.Mesh(lineGeo, lineMat);
  g.add(line);

  const areaGeo = new THREE.BufferGeometry();
  areaGeo.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
  areaGeo.setAttribute('aS', new THREE.Float32BufferAttribute(as, 1));
  areaGeo.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
  areaGeo.setIndex(ai);
  const areaMat = new THREE.ShaderMaterial({
    ...additive,
    side: THREE.DoubleSide,
    uniforms: { uProgress: { value: 0 }, uColor: { value: C(GOLD_DEEP, 0.55) }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aS; attribute float aV; varying float vS; varying float vV; varying vec3 vP;
      void main(){ vS = aS; vV = aV; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uProgress; uniform vec3 uColor; uniform float uTime; varying float vS; varying float vV; varying vec3 vP;
      void main(){ if (vS > uProgress) discard;
        float a = pow(vV, 2.2) * 0.5;
        float stripes = 0.6 + 0.4 * step(0.5, fract(vP.x * 2.778));
        a *= stripes * smoothstep(0.0, 0.02, uProgress - vS + 0.02);
        gl_FragColor = vec4(uColor * a, 1.0); }`,
  });
  const area = new THREE.Mesh(areaGeo, areaMat);
  g.add(area);

  // Axis = ruler
  const axisGeos = [];
  axisGeos.push(revealBar(V(GX0 - 0.3, GBASE, 0), V(GX1 + 0.3, GBASE, 0), 0.03, 0, 1));
  for (let y = 0; y <= 50; y++) {
    const len = y % 10 === 0 ? 0.42 : y % 5 === 0 ? 0.24 : 0.12;
    const x = gx(y);
    axisGeos.push(revealBar(V(x, GBASE, 0), V(x, GBASE - len, 0), 0.018, (y / 50) * 0.98, (y / 50) * 0.98 + 0.02));
  }
  const axisMat = lightMaterial({ color: GOLD, intensity: 2.2, fogStart: 40 });
  const axis = new THREE.Mesh(mergeGeometries(axisGeos), axisMat);
  g.add(axis);

  // horizontal guides
  const guideGeos = [];
  for (const v of [0, 500, 1000, 1500, 2000, 2500]) guideGeos.push(revealBar(V(GX0, gy(v), -0.02), V(GX1, gy(v), -0.02), v === 0 ? 0.014 : 0.008, 0, 1));
  const guideMat = lightMaterial({ color: '#6f8fb0', intensity: 0.35, fogStart: 40 });
  const guides = new THREE.Mesh(mergeGeometries(guideGeos), guideMat);
  g.add(guides);

  // milestones: vertical drop lines + dots + pulses
  const glowTex = glowTexture(128, 2);
  const miles = [10, 20, 30, 40, 50].map((y) => {
    const p = V(gx(y), gy(cashFlow(y)), 0);
    const vbar = new THREE.Mesh(
      revealBar(V(p.x, GBASE, 0), p, 0.012, 0, 1),
      lightMaterial({ color: GOLD, intensity: 1.2, fogStart: 40 }),
    );
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(WARM_WHITE, 4), ...additive }));
    dot.position.copy(p);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 96),
      new THREE.MeshBasicMaterial({ color: C(GOLD, 2.5), ...additive }),
    );
    ring.position.copy(p);
    g.add(vbar, dot, ring);
    return { year: y, p, vbar, dot, ring, t: graphYearTime(y) };
  });
  const be = V(gx(breakEvenYear), gy(0), 0);
  const beRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 96), new THREE.MeshBasicMaterial({ color: C(ICE, 3), ...additive }));
  beRing.position.copy(be);
  g.add(beRing);

  // head: flare + streak
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(WARM_WHITE, 6), ...additive }));
  const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTexture(), color: C('#ffd9a8', 2.2), ...additive }));
  g.add(head, streak);

  // sparks emitted from the head
  const SP = 900;
  const sparks = makePoints(SP, GOLD);
  const sr = rng(33);
  const sdata = [];
  for (let i = 0; i < SP; i++)
    sdata.push({
      e: (i / SP) * 50,
      vx: -0.2 - sr() * 0.6,
      vy: (sr() * 2 - 1) * 0.5,
      vz: (sr() * 2 - 1) * 0.6,
      life: 0.4 + sr() * 0.7,
      size: 0.02 + sr() * 0.04,
      warm: sr() < 0.7,
    });
  g.add(sparks);

  const amb = makePoints(700, ICE);
  const ar = rng(8);
  const ap2 = amb.geometry.attributes.position.array;
  const asz = amb.geometry.attributes.aSize.array;
  const aal = amb.geometry.attributes.aAlpha.array;
  for (let i = 0; i < 700; i++) {
    ap2[i * 3] = (ar() * 2 - 1) * 22;
    ap2[i * 3 + 1] = (ar() * 2 - 1) * 10;
    ap2[i * 3 + 2] = -ar() * 30 + 4;
    asz[i] = 0.02 + ar() * 0.05;
    aal[i] = 0.15 + ar() * 0.6;
  }
  amb.geometry.attributes.position.needsUpdate = true;
  g.add(amb);

  return { g, lineMat, areaMat, axisMat, guideMat, miles, beRing, head, streak, sparks, sdata, amb };
}

// ================================================================== NUMBERS
function buildNumbers(root) {
  const g = new THREE.Group();
  root.add(g);
  const words = ['4.8%', '32', '3,892', '7,124', '+2,398', '5,480', '23.0', '55.2', '50', '−52', '+931', '+1,620', '+118', '+406', '12', '2LDK'];
  const texs = words.map((w, i) =>
    textTexture(w, { font: `${i % 3 === 0 ? 300 : 200} {size}px "JetBrains Mono"`, size: 120, color: '#fff' }),
  );
  const r = rng(99);
  const items = [];
  for (let i = 0; i < 170; i++) {
    const t = texs[Math.floor(r() * texs.length)];
    const warm = r() < 0.45;
    const mat = new THREE.SpriteMaterial({ map: t.tex, color: C(warm ? GOLD : ICE, 1), fog: true, ...additive });
    const s = new THREE.Sprite(mat);
    const h = 0.35 + r() * 0.9;
    s.scale.set(h * t.aspect, h, 1);
    const base = V((r() * 2 - 1) * 16, (r() * 2 - 1) * 9, -r() * 70 + 2);
    // keep a clear window for the headline
    if (Math.abs(base.y) < 2.2 && Math.abs(base.x) < 7 && base.z > -14) base.y += Math.sign(base.y || 1) * 3;
    // angular distance from the view axis (camera starts at z = 10): dim what sits behind the headline
    const ang = Math.hypot(base.x, base.y * 1.6) / (10 - base.z);
    const clearK = ang < 0.32 ? 0.12 + 0.88 * Math.pow(ang / 0.32, 3) : 1;
    items.push({ s, base, k: (0.25 + r() * 1.1) * clearK, drift: r() * 6.28, mat });
    g.add(s);
  }
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(256, 3), color: C('#ffe2b8', 3), ...additive }));
  g.add(core);
  return { g, items, core };
}

// ================================================================== LOGO
function buildLogo(root) {
  const g = new THREE.Group();
  root.add(g);
  const barMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: C('#fff1d6', 2.4) },
      uBottom: { value: C('#d98a2e', 1.1) },
      uGlint: { value: -2 },
      uHeight: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vW;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform float uGlint; uniform float uHeight;
      varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec3 vW;
      void main(){
        float h = clamp(vW.y / 1.1, 0.0, 1.0);
        vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, h));
        float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
        c += vec3(1.0, 0.85, 0.6) * f * 2.0;
        float gl = exp(-pow((vW.x + vW.y * 0.6) - uGlint, 2.0) * 30.0);
        c += vec3(1.0, 0.95, 0.85) * gl * 7.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const heights = [0.33, 0.61, 0.89];
  const bars = heights.map((h, i) => {
    const geo = new RoundedBoxGeometry(0.12, h, 0.12, 3, 0.03);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, barMat);
    m.position.set((i - 1) * 0.24, 0.15, 0);
    g.add(m);
    return m;
  });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(256, 2.2), color: C('#ffb45e', 0.35), ...additive }));
  halo.position.set(0, 0.6, -0.5);
  halo.scale.set(9, 9, 1);
  g.add(halo);

  const N = 1400;
  const dust = makePoints(N, GOLD);
  const r = rng(77);
  const data = [];
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2,
      el = (r() * 2 - 1) * 0.9;
    const sp = 0.6 + Math.pow(r(), 2.5) * 7;
    data.push({
      v: V(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp * 0.6 + 0.2, Math.sin(a) * Math.cos(el) * sp * 0.6),
      size: 0.008 + r() * 0.03,
      warm: r() < 0.8,
      tw: r() * 6.28,
      drift: V((r() * 2 - 1) * 0.1, 0.05 + r() * 0.12, 0),
    });
  }
  g.add(dust);
  return { g, bars, barMat, halo, dust, data };
}

// ================================================================== WORLD
export function createWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.012);
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 800);
  const warp = buildWarp(scene);
  const build = buildBuilding(scene);
  const graph = buildGraph(scene);
  const nums = buildNumbers(scene);
  const logo = buildLogo(scene);

  const setPointScale = (pts) => {
    pts.material.uniforms.uScale.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  };
  const allPoints = [warp.dust, build.parts, build.amb, graph.sparks, graph.amb, logo.dust];

  function show(name) {
    warp.g.visible = name === 'warp';
    build.g.visible = name === 'build';
    graph.g.visible = name === 'graph';
    nums.g.visible = name === 'numbers';
    logo.g.visible = name === 'logo';
  }

  // ------------------------------------------------------------ WARP update
  const shakeV = new THREE.Vector3();
  function updateWarp(t) {
    show('warp');
    scene.fog.density = 0.014;
    const years = warpYears(t);
    const speed = t < WARP_END ? (warpYears(t + 0.001) - years) / 0.001 : 0; // years/s
    const settle = range(t, WARP_END, 4.0);
    const e = ease.inOutCubic(settle);
    const camZ = 16 - years * YL - e * 3.2;
    const sp = clamp(speed / 150);
    shakeV.set(noise1(t * 30, 1) * 0.05 * sp, noise1(t * 30, 2) * 0.04 * sp, 0);
    camera.position.set(shakeV.x, lerp(0, 1.0, e) + shakeV.y, camZ);
    camera.fov = lerp(52, 92, Math.pow(sp, 0.7)) - e * 4;
    camera.updateProjectionMatrix();
    const look = V(0, lerp(0, 1.45, e), camZ - 10);
    camera.lookAt(look);
    // barrel roll that unwinds as we decelerate
    const roll = (1 - ease.outCubic(clamp(t / WARP_END))) * 0.55 + (0.02 * Math.sin(t * 1.3)) * e;
    camera.rotateZ(roll);

    // retract walls & ceiling after the landing
    const retract = range(t, 2.0, 2.9);
    const land = range(t, WARP_END - 0.05, WARP_END + 0.35);
    const { inst, specs, m4 } = warp;
    if (retract > 0 || land > 0) {
      const q = new THREE.Quaternion();
      specs.forEach((s, i) => {
        let k = 1;
        if (s.face === 1 || s.face === 2 || (s.face === 3 && s.pos[1] !== TY0)) {
          const rr = range(retract, s.rand * 0.5, s.rand * 0.5 + 0.5);
          k = 1 - ease.inOutCubic(rr);
        }
        const sc = s.scale.slice();
        if (s.face === 2) sc[1] *= k;
        else sc[0] *= k;
        if (s.face === 3 && s.pos[1] !== TY0) {
          sc[0] = s.scale[0] * k;
          sc[1] = s.scale[1] * k;
        }
        m4.compose(V(...s.pos), q, V(...sc));
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
    }
    // year-50 gate pulse on landing + shockwave
    const pulse = Math.exp(-Math.max(0, t - WARP_END) * 4) * (t >= WARP_END - 0.02 ? 1 : 0);
    const sw = range(t, 2.0, 2.9);
    warp.shock.visible = t >= 2.0 && sw < 1;
    const ss = 1 + ease.outExpo(sw) * 3.2;
    warp.shock.scale.set(ss, ss, 1);
    warp.shockMat.color = C(WARM_WHITE, 5 * (1 - sw) * (1 - sw));
    warp.glow.material.color = C('#ffd6a0', 0.8 + pulse * 2.5 + e * 0.4);
    warp.labels.visible = true;
    warp.labels.children.forEach((m, i) => {
      if (i % 2 === 1) m.material.opacity = 1 - retract;
    });
    const dust = warp.dust;
    setPointScale(dust);
    // after landing, dust drifts gently toward camera
    dust.position.z = e * 2.5;
    return { speed, years };
  }

  // ------------------------------------------------------------ BUILD update
  const tmp = new THREE.Vector3();
  function updateBuild(t) {
    show('build');
    scene.fog.density = 0.02;
    const lt = t - 4.0;
    const orbit = ease.inOutSine(clamp(lt / 4.2));
    const ang = lerp(-0.95, 0.35, orbit);
    const rad = lerp(13.5, 17.5, ease.outCubic(clamp(lt / 4)));
    const hgt = lerp(0.8, 5.6, ease.inOutCubic(clamp(lt / 3.6)));
    camera.fov = 36;
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(ang) * rad, hgt, Math.cos(ang) * rad);
    camera.lookAt(0, lerp(2.9, 3.4, orbit), 0);
    camera.rotateZ(lerp(-0.06, 0.02, orbit));

    const eu = build.edgeMat.uniforms;
    for (let i = 0; i < 12; i++) {
      const ft = i < 8 ? floorTime(Math.min(i, FLOORS)) : 99;
      eu.uGroupProgress.value[i] = ease.outCubic(range(t, ft - 0.05, ft + 0.3));
      eu.uGroupFlash.value[i] = t >= ft ? Math.exp(-(t - ft) * 6) : 0;
    }
    eu.uProgress.value = 1;
    const topT = floorTime(FLOORS);
    const buildH = FLOORS * FH;
    let scanY;
    const lastFloor = floorTime(FLOORS - 1) + 0.2;
    if (t < lastFloor) {
      let f = 0;
      for (let i = 0; i < FLOORS; i++) if (t >= floorTime(i)) f = i;
      const ft = floorTime(f);
      scanY = lerp(f * FH, (f + 1) * FH, ease.outExpo(range(t, ft, ft + 0.16)));
    } else {
      // second, slow, analytical pass top -> bottom -> top
      const u = range(t, lastFloor + 0.3, 7.9);
      scanY = buildH + 0.5 - Math.sin(u * Math.PI) * (buildH + 0.5);
    }
    eu.uScanY.value = scanY;
    build.scan.position.y = scanY;
    build.scanMat.uniforms.uIntensity.value = 3.5 * clamp(range(t, 4.0, 4.15)) * (1 - range(t, 7.6, 7.95));
    build.sheet.material.color = C(ICE, 0.07 * (1 - range(t, 7.6, 7.95)));
    const gu = build.glassMat.uniforms;
    gu.uTime.value = t;
    gu.uReveal.value = t < lastFloor ? scanY : buildH + 1;
    gu.uScanY.value = scanY;
    gu.uOpacity.value = range(t, 4.2, 4.8);
    build.dialMat.uniforms.uProgress.value = ease.outCubic(range(t, 4.0, 4.9));
    build.dial.rotation.y = t * 0.08;
    void topT;

    // particles
    setPointScale(build.parts);
    const P = build.parts.geometry.attributes;
    const pp = P.position.array,
      pc = P.aColor.array,
      ps = P.aSize.array,
      pa = P.aAlpha.array;
    const gold = C(GOLD),
      ice = C(ICE);
    build.pdata.forEach((d, i) => {
      const u = range(t, d.t0, d.t0 + d.dur);
      const e = ease.inOutCubic(u);
      const swirl = (1 - e) * 1.2;
      tmp.lerpVectors(d.start, d.target, e);
      tmp.x += Math.sin(d.seed + t * 2) * swirl;
      tmp.z += Math.cos(d.seed * 1.3 + t * 2) * swirl;
      pp[i * 3] = tmp.x;
      pp[i * 3 + 1] = tmp.y;
      pp[i * 3 + 2] = tmp.z;
      const after = t - (d.t0 + d.dur);
      const alpha = u <= 0 ? range(t, d.t0 - 0.3, d.t0) * 0.5 : after > 0 ? Math.exp(-after * 3.5) : 0.5 + u;
      pa[i] = alpha * 2.2;
      ps[i] = d.size * (after > 0 ? 1 + Math.exp(-after * 8) * 2 : 1);
      const c = d.warm ? gold : ice;
      pc[i * 3] = c.r;
      pc[i * 3 + 1] = c.g;
      pc[i * 3 + 2] = c.b;
    });
    P.position.needsUpdate = P.aColor.needsUpdate = P.aSize.needsUpdate = P.aAlpha.needsUpdate = true;

    setPointScale(build.amb);
    const A = build.amb.geometry.attributes;
    build.ambBase.forEach((b, i) => {
      A.position.array[i * 3] = b[0] + Math.sin(t * 0.3 + b[3]) * 0.3;
      A.position.array[i * 3 + 1] = b[1] + ((t * 0.25 + b[3]) % 10) - 5 + 5;
      A.position.array[i * 3 + 2] = b[2] + Math.cos(t * 0.3 + b[3]) * 0.3;
    });
    A.position.needsUpdate = true;
  }

  // ------------------------------------------------------------ GRAPH update
  function updateGraph(t) {
    show('graph');
    scene.fog.density = 0.01;
    const years = graphYears(t);
    const prog = years / 50;
    const headP = V(gx(years), gy(cashFlow(years)), 0);
    const e = ease.inOutCubic(range(t, 8.0, 10.75));
    const focus = new THREE.Vector3().lerpVectors(
      V(headP.x + 1.6, headP.y + 0.6, 0),
      V(0.2, 0.15, 0),
      e,
    );
    const dist = lerp(6.0, 21.5, ease.inOutCubic(range(t, 8.0, 10.9)));
    const yaw = lerp(0.42, -0.1, ease.inOutSine(range(t, 8.0, 11.0)));
    const pitch = lerp(0.1, 0.03, e);
    camera.fov = 35;
    camera.updateProjectionMatrix();
    camera.position.set(focus.x + Math.sin(yaw) * dist, focus.y + Math.sin(pitch) * dist, Math.cos(yaw) * dist);
    camera.lookAt(focus);
    camera.rotateZ(lerp(0.03, 0, e));

    graph.lineMat.uniforms.uProgress.value = prog;
    graph.areaMat.uniforms.uProgress.value = prog;
    graph.axisMat.uniforms.uProgress.value = ease.outExpo(range(t, 8.0, 8.5));
    graph.guideMat.uniforms.uProgress.value = ease.outCubic(range(t, 8.05, 8.8));
    graph.head.position.copy(headP);
    const hs = (0.35 + 0.95 * (dist / 21.5)) * (1 + Math.sin(t * 40) * 0.06);
    graph.head.scale.set(hs, hs, 1);
    graph.head.visible = prog > 0.001;
    graph.streak.position.copy(headP);
    graph.streak.scale.set(9 * (0.3 + 0.7 * dist / 21.5), 0.5 * (0.35 + 0.65 * dist / 21.5), 1);
    graph.streak.visible = prog > 0.001;
    const done = range(t, 10.5, 10.9);
    graph.head.material.color = C(WARM_WHITE, 6 * (1 - done * 0.4));

    for (const m of graph.miles) {
      const u = range(t, m.t - 0.02, m.t + 0.25);
      m.vbar.material.uniforms.uProgress.value = ease.outExpo(u);
      m.vbar.material.uniforms.uIntensity.value = 0.8;
      m.dot.visible = t >= m.t;
      const ds = 0.55 + Math.exp(-Math.max(0, t - m.t) * 6) * 1.2;
      m.dot.scale.set(ds, ds, 1);
      const ru = range(t, m.t, m.t + 0.7);
      m.ring.visible = t >= m.t && ru < 1;
      const rs = 0.05 + ease.outExpo(ru) * 0.6;
      m.ring.scale.set(rs, rs, 1);
      m.ring.material.color = C(GOLD, 2.2 * (1 - ru) * (1 - ru));
    }
    const bt = graphYearTime(breakEvenYear);
    const bu = range(t, bt, bt + 0.9);
    graph.beRing.visible = t >= bt && bu < 1;
    const bs = 0.05 + ease.outExpo(bu) * 1.3;
    graph.beRing.scale.set(bs, bs, 1);
    graph.beRing.material.color = C(ICE, 3.5 * (1 - bu));

    setPointScale(graph.sparks);
    const S = graph.sparks.geometry.attributes;
    graph.sdata.forEach((d, i) => {
      const te = graphYearTime(d.e);
      const age = t - te;
      const alive = d.e <= years && age >= 0 && age < d.life;
      const p0x = gx(d.e),
        p0y = gy(cashFlow(d.e));
      S.position.array[i * 3] = p0x + d.vx * age;
      S.position.array[i * 3 + 1] = p0y + d.vy * age - 0.4 * age * age;
      S.position.array[i * 3 + 2] = d.vz * age;
      S.aAlpha.array[i] = alive ? Math.pow(1 - age / d.life, 1.5) * 3 : 0;
      S.aSize.array[i] = d.size;
      const c = C(d.warm ? GOLD : ICE);
      S.aColor.array[i * 3] = c.r;
      S.aColor.array[i * 3 + 1] = c.g;
      S.aColor.array[i * 3 + 2] = c.b;
    });
    S.position.needsUpdate = S.aAlpha.needsUpdate = S.aSize.needsUpdate = S.aColor.needsUpdate = true;
    setPointScale(graph.amb);
    graph.amb.position.x = -t * 0.3;
    return { headP, years };
  }

  // ------------------------------------------------------------ NUMBERS update
  function updateNumbers(t) {
    show('numbers');
    scene.fog.density = 0.028;
    const lt = t - 11.0;
    const rush = ease.inExpo(range(t, 12.55, 13.0));
    camera.fov = lerp(48, 80, rush);
    camera.updateProjectionMatrix();
    camera.position.set(Math.sin(lt * 0.4) * 0.4, Math.cos(lt * 0.3) * 0.2, 10 - lt * 1.6 - rush * 52);
    camera.lookAt(0, 0, camera.position.z - 10);
    camera.rotateZ(lerp(0.02, -0.05, lt / 2) + rush * 0.4);
    nums.items.forEach((it) => {
      it.s.position.set(it.base.x + Math.sin(lt * 0.5 + it.drift) * 0.2, it.base.y + Math.cos(lt * 0.4 + it.drift) * 0.15, it.base.z);
      const intro = ease.outCubic(range(t, 11.0 + it.drift * 0.03, 11.35 + it.drift * 0.03));
      it.mat.opacity = 1;
      it.mat.color = C(it.mat.color.r > it.mat.color.b ? GOLD : ICE, it.k * intro * (1 + rush * 2));
    });
    nums.core.position.set(0, 0, camera.position.z - 12);
    const cs = 2 + rush * 30;
    nums.core.scale.set(cs, cs, 1);
    nums.core.material.color = C('#ffe2b8', 0.2 + rush * 4);
    return { rush };
  }

  // ------------------------------------------------------------ LOGO update
  function updateLogo(t) {
    show('logo');
    scene.fog.density = 0.0;
    const lt = t - 13.0;
    camera.fov = 30;
    camera.updateProjectionMatrix();
    const push = ease.outCubic(clamp(lt / 2));
    camera.position.set(Math.sin(lt * 0.35) * 0.08, 0.04, 10.4 - push * 0.4);
    camera.lookAt(0, 0.02, 0);
    logo.bars.forEach((b, i) => {
      const s = spring(Math.max(0, lt - 0.02 - i * 0.07) * 1.2, 5.5, 1.3);
      b.scale.set(1, Math.max(0.0001, s), 1);
      b.visible = s > 0.001;
    });
    logo.barMat.uniforms.uGlint.value = lerp(-1.5, 2.2, ease.inOutCubic(range(t, 13.95, 14.55)));
    logo.halo.material.color = C('#ffb45e', 0.12 + 0.5 * Math.exp(-lt * 2.5));
    setPointScale(logo.dust);
    const D = logo.dust.geometry.attributes;
    const gold = C(GOLD),
      warm = C(WARM_WHITE);
    logo.data.forEach((d, i) => {
      // exponential drag: x = v * (1 - e^{-k t}) / k
      const k = 2.2;
      const s = (1 - Math.exp(-k * lt)) / k;
      D.position.array[i * 3] = d.v.x * s + d.drift.x * lt;
      D.position.array[i * 3 + 1] = 0.6 + d.v.y * s + d.drift.y * lt;
      D.position.array[i * 3 + 2] = d.v.z * s;
      const tw = 0.6 + 0.4 * Math.sin(lt * 5 + d.tw);
      D.aAlpha.array[i] = lt < 0 ? 0 : (0.25 + 2.5 * Math.exp(-lt * 2.2)) * tw;
      D.aSize.array[i] = d.size;
      const c = d.warm ? gold : warm;
      D.aColor.array[i * 3] = c.r;
      D.aColor.array[i * 3 + 1] = c.g;
      D.aColor.array[i * 3 + 2] = c.b;
    });
    D.position.needsUpdate = D.aAlpha.needsUpdate = D.aSize.needsUpdate = D.aColor.needsUpdate = true;
  }

  const project = (v) => {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, behind: p.z > 1 };
  };

  function update(t) {
    let info = {};
    if (t < 4.0) info = updateWarp(t);
    else if (t < 8.0) updateBuild(t);
    else if (t < 11.0) info = updateGraph(t);
    else if (t < 13.0) info = updateNumbers(t);
    else updateLogo(t);
    allPoints.forEach((p) => p.visible && setPointScale(p));
    camera.updateMatrixWorld();
    return info;
  }

  // Motion-blur sample count per frame: more where things move fast.
  function samples(t) {
    if (t < 4.0) {
      const sp = t < WARP_END ? (warpYears(t + 0.001) - warpYears(t)) / 0.001 : 0;
      const shift = (sp * YL * 0.5) / FPS; // units moved while the shutter is open
      return clamp(Math.ceil(shift / 0.07), 5, 44);
    }
    if (t > 12.5 && t < 13.0) return 16;
    if (Math.abs(t - 4.0) < 0.05 || Math.abs(t - 8.0) < 0.05 || Math.abs(t - 11.0) < 0.05 || Math.abs(t - 13.0) < 0.05) return 8;
    return 5;
  }

  return { scene, camera, update, project, samples, gx, gy, GBASE, build, graph };
}

export { GRAPH_T0 };
