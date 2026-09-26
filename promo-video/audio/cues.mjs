// Dump every sound-relevant cue (in real film time) to audio/cues.json for make_audio.py.
import fs from 'node:fs';
import * as T from '../src/timeline.js';

const r = (d) => +T.realTime(d).toFixed(4);
const cues = {
  drop: T.MUSIC_T0,
  beat: T.MUSIC_BEAT,
  musicOffset: T.MUSIC_OFFSET,
  warpYears: Array.from({ length: 50 }, (_, i) => ({ year: i + 1, t: r(T.warpYearTime(i + 1)) })),
  warpLand: r(T.WARP_END),
  hits: T.HITS.map((h) => ({ t: r(h.t), flash: h.flash })),
  copy: Object.fromEntries(Object.entries(T.COPY).map(([k, v]) => [k, r(v)])),
  floors: Array.from({ length: T.FLOORS }, (_, i) => r(T.floorTime(i))),
  cards: T.CARDS.map((c) => r(c.t)),
  milestones: [10, 20, 30, 40, 50].map((y) => r(T.graphYearTime(y))),
  breakEven: r(T.graphYearTime(T.breakEvenYear)),
  rush: [r(12.55), r(13.0)],
  glint: [r(13.95), r(14.55)],
};
fs.writeFileSync(new URL('./cues.json', import.meta.url), JSON.stringify(cues, null, 2));
console.log(JSON.stringify(cues).slice(0, 600));
