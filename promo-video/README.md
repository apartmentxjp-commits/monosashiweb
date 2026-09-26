# MONO-SASHI — 15s promo film

`output/mono-sashi-promo-15s.mp4` is a 1920×1080, 60fps, H.264 + AAC, 15.0s film.

This folder is self-contained. It does not touch the MONO-SASHI app (`app/`, `static-src/`, …).

## Concept — "Measure the future"

MONO-SASHI (ものさし = ruler) lets you see a property's 50-year future before you buy.
The film turns the ruler into the hero object: gold graduations become a tunnel you fly
through, then a floor, a 3D measuring dial, the x-axis of the 50-year cash-flow chart, and
finally the rule under the logo.

| real time | scene | beat |
|---|---|---|
| 0.00–1.9 | **Warp**: flash on the drop, hyperspeed through a tunnel of ruler ticks, counter 00→50年後, barrel roll unwinds, lands on the year-50 gate | drop / bar 1 |
| 1.9–3.8 | **Promise**: walls retract, *その物件の未来を、買う前に。* | bar 2 |
| 3.8–7.5 | **Scan**: a residential building assembles from particles floor by floor; HUD cards on the beat (想定利回り 4.8% / リスクスコア 32 / ローン残高 3,892万円 / 資産価値 7,124万円), *収益性も、リスクも、将来性も。* | bars 3–4 |
| 7.5–11.3 | **Simulation**: the cumulative cash-flow curve draws over 50 years; 10/20/30/40/50-year milestones land exactly on beats; break-even pulse | bars 5–6 |
| 11.3–13.2 | **Numbers**: a depth field of the product's figures, *感覚ではなく、数字で。*, rush into the core | bar 7 |
| 13.2–15.0 | **Logo** on the track's one-bar break: 3D brand bars spring up in gold dust, MONO-SASHI, ruler rule, *未来は、自分で選ぶ。* | break |

Figures are taken from the product's own OG card (`public/og/mono-sashi-x-og.png`).
The palette is the site's ink/orange, pushed to a dark luxury grade with champagne gold and the favicon's sky blue.

## Sound

- Music: the user-supplied track `audio/source.m4a` (~128 BPM, 8-bar sections of 14.98s).
  The film uses the section that starts at 14.915s, so its drop lands on the opening flash
  and its closing one-bar break carries the logo. The track fades out over the last 0.45s.
- All picture cues are designed on a 120 BPM "design time" grid and re-timed onto the track's
  real beat grid by `TIME_ANCHORS` in `src/timeline.js`.
- SFX (`audio/make_audio.py`) are synthesized from the same cues: a year-by-year ratchet
  during the warp, floor clicks, HUD blips and count ticks, milestone bells, a break-even chime,
  a riser into the logo, then a sub impact and a shimmer chord. Mastered to about -14 LUFS / -1 dBTP.

## Tech

- **Three.js** scenes (`src/scenes.js`): instanced ruler geometry, custom additive light-bar
  shaders with draw-on reveal, fresnel glass, CPU-driven point particles, rounded 3D logo bars.
- **Canvas 2D** kinetic typography and HUD (`src/overlay.js`): per-glyph mask, rise, blur and
  tracking, count-ups, and leader lines tracked to 3D anchors.
- **Engine** (`src/engine.js`): true motion blur by sub-frame accumulation (5–44 samples,
  adaptive to speed), dual-filter HDR bloom, ACES + split-tone grade, chromatic aberration,
  zoom blur on hits, and grain. Typography is composited after the grade so whites stay white.
- Deterministic: every frame is a pure function of time. `render.mjs` drives headless Chromium
  (SwiftShader WebGL2) with Playwright across parallel workers, and FFmpeg encodes the result.

## Rebuild

```bash
cd promo-video
npm install
node render.mjs --stills 0.6,3.4,6.4,10.6,14.9   # preview stills -> out/stills/
node render.mjs --frames --workers 3              # 900 frames -> out/frames/
node audio/cues.mjs && python3 audio/make_audio.py  # needs numpy + scipy -> out/audio/mix.wav
ffmpeg -framerate 60 -i out/frames/f_%05d.png -i out/audio/mix.wav \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high -tune film \
  -c:a aac -b:a 256k -shortest -movflags +faststart output/mono-sashi-promo-15s.mp4
```
