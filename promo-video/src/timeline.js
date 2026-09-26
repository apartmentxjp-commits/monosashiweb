// Shared timeline for picture (browser) and sound (node -> cues.json -> python).
// 120 BPM: 1 beat = 0.5s, 1 bar = 2s. The whole film is 15s / 7.5 bars.

export const FPS = 60;
export const DURATION = 15;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const W = 1920;
export const H = 1080;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);

export const ease = {
  linear: (x) => x,
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inQuart: (x) => x * x * x * x,
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

// Damped spring 0 -> 1 (overshoots) for pops.
export const spring = (x, damp = 7, freq = 2.2) =>
  x <= 0 ? 0 : 1 - Math.exp(-damp * x) * Math.cos(freq * 2 * Math.PI * x);

// ---------------------------------------------------------------- scenes
export const SCENES = {
  warp: [0, 2.0], // hyperspeed through 50 years of ruler
  promise: [1.75, 4.0], // その物件の未来を、買う前に。
  build: [4.0, 8.0], // 3D property scan + HUD metrics
  graph: [8.0, 11.0], // 50-year cash-flow simulation
  numbers: [11.0, 13.0], // 感覚ではなく、数字で。
  logo: [13.0, 15.0], // end card
};

// ---------------------------------------------------------------- warp travel
export const WARP_END = 1.75;
export const WARP_K = 6.5;
const WARP_NORM = 1 - Math.pow(2, -WARP_K);
// Years travelled (0..50) during the opening warp.
export function warpYears(t) {
  const u = clamp(t / WARP_END);
  return (50 * (1 - Math.pow(2, -WARP_K * u))) / WARP_NORM;
}
export function warpYearTime(k) {
  const u = -Math.log2(1 - (k / 50) * WARP_NORM) / WARP_K;
  return u * WARP_END;
}

// ---------------------------------------------------------------- building
export const FLOORS = 7;
export const BUILD_START = 4.0;
// Floors snap in on a fast 16th-ish ratchet; the sound is generated from these cues.
export const floorTime = (i) => BUILD_START + 0.12 + i * 0.16;
export const CARDS = [
  { t: 5.0, key: 'yield' },
  { t: 5.5, key: 'risk' },
  { t: 6.0, key: 'loan' },
  { t: 6.5, key: 'value' },
];

// ---------------------------------------------------------------- graph
// Cumulative cash flow (万円) from the product's own 50-year simulation card.
export const CF_POINTS = [
  [0, 0],
  [1, -52],
  [10, 118],
  [20, 406],
  [30, 931],
  [40, 1620],
  [50, 2398],
];
// Linear in design time; with the time map, 10/20/30/40/50 years land on beats 18..22.
export const GRAPH_T0 = 8.3755;
export const GRAPH_T1 = 10.248;
export function graphYears(t) {
  return 50 * range(t, GRAPH_T0, GRAPH_T1);
}
export function graphYearTime(y) {
  let a = GRAPH_T0,
    b = GRAPH_T1;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (graphYears(m) < y) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

// Monotone cubic (Fritsch-Carlson) interpolation of the cash flow curve.
const mc = (() => {
  const xs = CF_POINTS.map((p) => p[0]);
  const ys = CF_POINTS.map((p) => p[1]);
  const n = xs.length;
  const d = [],
    m = Array.from({ length: n }, () => 0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i],
      b = m[i + 1] / d[i],
      s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return { xs, ys, m };
})();
export function cashFlow(y) {
  const { xs, ys, m } = mc;
  y = clamp(y, 0, 50);
  let i = 0;
  while (i < xs.length - 2 && y > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i],
    s = (y - xs[i]) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1,
    h10 = s ** 3 - 2 * s ** 2 + s,
    h01 = -2 * s ** 3 + 3 * s ** 2,
    h11 = s ** 3 - s ** 2;
  return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
}
export const breakEvenYear = (() => {
  for (let y = 1; y < 50; y += 0.01) if (cashFlow(y) >= 0) return y;
  return 5;
})();

// ---------------------------------------------------------------- copy cues
export const COPY = {
  kicker: 2.0,
  line1: 2.05, // その物件の未来を、
  line2: 3.0, // 買う前に。
  buildCopy: 7.0, // 収益性も、リスクも、将来性も。
  numbers1: 11.0, // 感覚ではなく、
  numbers2: 12.0, // 数字で。
  logo: 13.0,
  tagline: 13.75,
};

// ---------------------------------------------------------------- post cues
// Frame-level "kicks": exposure flash + chromatic aberration + zoom blur.
export const HITS = [
  { t: 0.05, flash: 1.5, ca: 1.0, decay: 0.12 },
  { t: 2.0, flash: 0.55, ca: 0.6, decay: 0.22 },
  { t: 4.0, flash: 0.9, ca: 0.8, decay: 0.2 },
  { t: 8.0, flash: 0.9, ca: 0.8, decay: 0.2 },
  { t: 11.0, flash: 0.7, ca: 0.6, decay: 0.22 },
  { t: 13.0, flash: 0.85, ca: 0.8, decay: 0.16 },
];

// ---------------------------------------------------------------- music sync
// Soundtrack: audio/source.m4a (user supplied), ~128.1 BPM, 8-bar sections of 14.98s.
// We take the section that starts with the drop at 14.965s of the track, so the drop
// lands on the opening flash and the section's closing one-bar break carries the logo.
export const MUSIC_OFFSET = 14.915; // track time at film t = 0
export const MUSIC_BEAT = 14.983 / 32; // measured drop-to-drop / 32 beats
export const MUSIC_T0 = 0.05; // film time of the drop
export const beatTime = (k) => MUSIC_T0 + k * MUSIC_BEAT;

// The picture was designed on a 120 BPM grid ("design time"). Piecewise-linear anchors
// [design, real] re-time every cue onto the real beat grid of the track.
export const TIME_ANCHORS = [
  [0, 0],
  [0.05, beatTime(0)],
  [2.0, beatTime(4)], // landing: bar 2
  [3.0, beatTime(6)], // 買う前に。
  [4.0, beatTime(8)], // cut: building
  [5.0, beatTime(10)],
  [5.5, beatTime(11)],
  [6.0, beatTime(12)],
  [6.5, beatTime(13)],
  [7.0, beatTime(14)],
  [8.0, beatTime(16)], // cut: graph
  [11.0, beatTime(24)], // cut: numbers
  [12.0, beatTime(26)], // 数字で。
  [13.0, beatTime(28)], // logo on the break
  [15.0, 15.0],
];
function mapPiecewise(x, from, to) {
  const A = TIME_ANCHORS;
  if (x <= A[0][from]) return A[0][to];
  for (let i = 0; i < A.length - 1; i++) {
    const a = A[i],
      b = A[i + 1];
    if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return A[A.length - 1][to] + (x - A[A.length - 1][from]);
}
export const designTime = (real) => mapPiecewise(real, 1, 0);
export const realTime = (design) => mapPiecewise(design, 0, 1);
