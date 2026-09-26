import { Engine } from './engine.js';
import { createWorld } from './scenes.js';
import { Overlay } from './overlay.js';
import { FPS, DURATION, designTime } from './timeline.js';
import * as THREE from 'three';

const FONTS = [
  '200 40px Manrope', '300 40px Manrope', '500 40px Manrope', '600 40px Manrope',
  '200 40px "JetBrains Mono"', '300 40px "JetBrains Mono"', '400 40px "JetBrains Mono"',
  '500 40px "Noto Serif CJK JP"', '600 40px "Noto Serif CJK JP"', '700 40px "Noto Serif CJK JP"',
  '400 40px "Noto Sans CJK JP"', '500 40px "Noto Sans CJK JP"',
];

async function boot() {
  await Promise.all(FONTS.map((f) => document.fonts.load(f, 'MONO-SASHI 0123456789 未来物件')));
  const world = createWorld();
  const overlay = new Overlay(document.getElementById('ov'), world);
  const engine = new Engine(document.getElementById('gl'), document.getElementById('ov'));
  const bgs = {
    warp: { a: new THREE.Color(0.006, 0.008, 0.014), b: new THREE.Color(0.001, 0.0015, 0.003), center: new THREE.Vector2(0.5, 0.52) },
    build: { a: new THREE.Color(0.014, 0.022, 0.036), b: new THREE.Color(0.0015, 0.002, 0.004), center: new THREE.Vector2(0.5, 0.42) },
    graph: { a: new THREE.Color(0.012, 0.018, 0.03), b: new THREE.Color(0.0015, 0.002, 0.004), center: new THREE.Vector2(0.55, 0.55) },
    numbers: { a: new THREE.Color(0.012, 0.014, 0.022), b: new THREE.Color(0.001, 0.0015, 0.003), center: new THREE.Vector2(0.5, 0.5) },
    logo: { a: new THREE.Color(0.03, 0.022, 0.014), b: new THREE.Color(0.002, 0.002, 0.003), center: new THREE.Vector2(0.5, 0.45) },
  };
  const bgFor = (t) => (t < 4 ? bgs.warp : t < 8 ? bgs.build : t < 11 ? bgs.graph : t < 13 ? bgs.numbers : bgs.logo);

  function drawAt(tReal) {
    const ts = designTime(tReal);
    const info = world.update(ts);
    overlay.draw(ts);
    const post = {};
    if (ts < 2.0 && info.speed !== undefined) post.zoom = Math.min(0.12, info.speed / 1500);
    if (ts > 12.55 && ts < 13.0) post.zoom = ((ts - 12.55) / 0.45) ** 3 * 0.25;
    post.fade = tReal > 14.75 ? 1 - ((tReal - 14.75) / 0.25) ** 2 * 0.35 : 1;
    if (ts < 0.05) post.exposure = ts / 0.05;
    return { scene: world.scene, camera: world.camera, post, bg: bgFor(ts) };
  }

  window.__renderFrame = (frame, opts = {}) => {
    const t = frame / FPS;
    const s = opts.samples ?? world.samples(designTime(t));
    engine.renderFrame(t, frame, s, drawAt);
    return s;
  };
  window.__engine = engine;
  window.__meta = { FPS, DURATION, frames: Math.round(FPS * DURATION) };
  window.__ready = true;
}

boot().catch((e) => {
  window.__error = String(e && e.stack ? e.stack : e);
  console.error(e);
});
