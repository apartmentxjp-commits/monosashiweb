// 2D layer: kinetic typography + HUD. Redrawn for every motion-blur sub-sample.
import * as THREE from 'three';
import {
  W,
  H,
  clamp,
  lerp,
  range,
  ease,
  spring,
  warpYears,
  WARP_END,
  COPY,
  CARDS,
  graphYears,
  cashFlow,
  breakEvenYear,
  graphYearTime,
} from './timeline.js';

const SERIF = '"Noto Serif CJK JP", serif';
const SANS = '"Noto Sans CJK JP", sans-serif';
const LATIN = 'Manrope, sans-serif';
const MONO = '"JetBrains Mono", monospace';

const GOLD = '#f3c47e';
const GOLD_HI = '#fff0d2';
const GOLD_DEEP = '#d9893a';
const ICE = '#8fd2ff';
const MUTED = 'rgba(214, 224, 236, 0.62)';

export class Overlay {
  constructor(canvas, world) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.widthCache = new Map();
  }

  font(weight, size, family) {
    return `${weight} ${size}px ${family}`;
  }

  measure(text, font, spacing = 0) {
    const key = `${font}|${spacing}|${text}`;
    let v = this.widthCache.get(key);
    if (v === undefined) {
      const ctx = this.ctx;
      ctx.font = font;
      ctx.letterSpacing = '0px';
      v = ctx.measureText(text).width + spacing * [...text].length;
      this.widthCache.set(key, v);
    }
    return v;
  }

  goldGradient(x0, y0, x1, y1) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, GOLD_HI);
    g.addColorStop(0.45, GOLD);
    g.addColorStop(1, GOLD_DEEP);
    return g;
  }

  /**
   * Per-glyph reveal: rise from a mask, blur -> sharp, tracking eases in.
   * opts: font, size, x, y, align, t0, stagger, dur, color, spacing, spacingFrom, out (time), outDur, blur
   */
  text(t, str, o) {
    const ctx = this.ctx;
    const chars = [...str];
    const spacing = o.spacing ?? 0;
    const inT = range(t, o.t0, o.t0 + (o.stagger ?? 0.03) * chars.length + (o.dur ?? 0.5));
    const trk = lerp(o.spacingFrom ?? spacing, spacing, ease.outExpo(inT));
    const widths = chars.map((ch) => this.measure(ch, o.font) + trk);
    const total = widths.reduce((a, b) => a + b, 0) - trk;
    let x = o.align === 'center' ? o.x - total / 2 : o.align === 'right' ? o.x - total : o.x;
    ctx.save();
    ctx.font = o.font;
    ctx.textBaseline = 'alphabetic';
    const colorFn = typeof o.color === 'function' ? o.color : null;
    chars.forEach((ch, i) => {
      const st = o.t0 + i * (o.stagger ?? 0.03);
      const p = range(t, st, st + (o.dur ?? 0.5));
      const e = (o.ease ?? ease.outExpo)(p);
      let yOff = (1 - e) * o.size * (o.rise ?? 0.55);
      let alpha = clamp(p * 2.2) * (o.alpha ?? 1);
      let blur = (1 - e) * (o.blur ?? 10);
      if (o.out !== undefined) {
        const os = o.out + i * (o.outStagger ?? 0.015);
        const q = range(t, os, os + (o.outDur ?? 0.3));
        const qe = ease.inCubic(q);
        yOff -= qe * o.size * 0.5;
        alpha *= 1 - q;
        blur += qe * 12;
      }
      if (alpha > 0.002) {
        ctx.globalAlpha = alpha;
        ctx.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : 'none';
        ctx.fillStyle = colorFn ? colorFn(i, ch, x, widths[i]) : o.color;
        if (o.mask) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - 20, o.y - o.size * 1.15, widths[i] + 40, o.size * 1.45);
          ctx.clip();
          ctx.fillText(ch, x, o.y + yOff);
          ctx.restore();
        } else ctx.fillText(ch, x, o.y + yOff);
      }
      x += widths[i];
    });
    ctx.restore();
    return total;
  }

  line(x0, y0, x1, y1, color, width = 1, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  // Ruler: gold line drawn from the centre outwards, ticks pop in behind it.
  ruler(cx, y, width, p, alpha = 1, ticks = 50) {
    const ctx = this.ctx;
    const half = (width / 2) * ease.outExpo(p);
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
    g.addColorStop(0, 'rgba(243,196,126,0)');
    g.addColorStop(0.15, GOLD);
    g.addColorStop(0.5, GOLD_HI);
    g.addColorStop(0.85, GOLD);
    g.addColorStop(1, 'rgba(243,196,126,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - half, y - 1, half * 2, 2);
    for (let i = 0; i <= ticks; i++) {
      const x = cx - width / 2 + (width * i) / ticks;
      const d = Math.abs(x - cx) / (width / 2);
      const tp = clamp((ease.outExpo(p) - d) * 6);
      if (tp <= 0) continue;
      const len = (i % 10 === 0 ? 16 : i % 5 === 0 ? 10 : 5) * ease.outBack(tp);
      ctx.globalAlpha = alpha * (1 - d * 0.7) * tp;
      ctx.fillRect(x - 0.6, y + 1, 1.2, len);
    }
    ctx.restore();
  }

  kicker(t, str, x, y, t0, opts = {}) {
    return this.text(t, str, {
      font: this.font(opts.weight ?? 600, opts.size ?? 15, opts.family ?? LATIN),
      size: opts.size ?? 15,
      x,
      y,
      align: opts.align ?? 'left',
      t0,
      stagger: 0.012,
      dur: 0.4,
      color: opts.color ?? GOLD,
      spacing: opts.spacing ?? 7,
      spacingFrom: opts.spacingFrom ?? 22,
      blur: 4,
      rise: 0,
      out: opts.out,
      outDur: 0.2,
      outStagger: 0.004,
      alpha: opts.alpha ?? 1,
    });
  }

  // ---------------------------------------------------------------- scenes
  drawWarp(t) {
    const ctx = this.ctx;
    const years = Math.floor(warpYears(t) + 1e-6);
    const intro = range(t, 0.03, 0.2);
    const exit = range(t, 2.0, 2.3);
    if (intro <= 0 || exit >= 1) return;
    const settle = range(t, WARP_END - 0.1, WARP_END + 0.25);
    const pop = spring(range(t, WARP_END, WARP_END + 0.8), 6, 1.6);
    const scale = lerp(1.0, 1.0, settle) * (t >= WARP_END ? 1 + (pop - 1) * 0.04 : 1) * (1 - ease.inCubic(exit) * 0.15);
    const alpha = intro * (1 - ease.inCubic(exit));
    const cx = W / 2,
      cy = H / 2 + 60 - ease.inCubic(exit) * 40;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.filter = exit > 0 ? `blur(${(exit * 14).toFixed(1)}px)` : 'none';
    const num = String(years).padStart(2, '0');
    ctx.font = this.font(200, 250, LATIN);
    ctx.textBaseline = 'alphabetic';
    const cell = ctx.measureText('0').width * 1.02;
    const nw = cell * num.length;
    ctx.font = this.font(500, 58, SERIF);
    const uw = ctx.measureText('年後').width;
    const total = nw + 18 + uw;
    const x0 = -total / 2;
    ctx.font = this.font(200, 250, LATIN);
    ctx.textAlign = 'center';
    const landed = t >= WARP_END;
    ctx.fillStyle = landed ? this.goldGradient(x0, -200, x0 + nw, 0) : '#f6efe4';
    if (landed) {
      ctx.shadowColor = 'rgba(243,196,126,0.45)';
      ctx.shadowBlur = 40 * (1 - settle * 0.5);
    }
    [...num].forEach((d, i) => ctx.fillText(d, x0 + cell * (i + 0.5), 0));
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.font = this.font(500, 58, SERIF);
    ctx.fillStyle = landed ? GOLD : 'rgba(246,239,228,0.85)';
    ctx.fillText('年後', x0 + nw + 18, -8);
    ctx.filter = 'none';
    // mini ruler under the counter showing progress through 50 years
    const rw = 560,
      ry = 44;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-rw / 2, ry, rw, 1);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-rw / 2, ry - 0.5, (rw * warpYears(t)) / 50, 2);
    for (let i = 0; i <= 50; i++) {
      const x = -rw / 2 + (rw * i) / 50;
      const on = i <= warpYears(t);
      ctx.fillStyle = on ? GOLD : 'rgba(255,255,255,0.25)';
      const len = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4;
      ctx.fillRect(x - 0.6, ry + 2, 1.2, len);
    }
    ctx.font = this.font(600, 12, LATIN);
    ctx.letterSpacing = '5px';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('TODAY', -rw / 2, ry + 36);
    ctx.textAlign = 'right';
    ctx.fillStyle = landed ? GOLD : 'rgba(255,255,255,0.55)';
    ctx.fillText('50 YEARS', rw / 2 + 5, ry + 36);
    ctx.restore();
  }

  drawPromise(t) {
    if (t < 1.95 || t > 4.05) return;
    const out = 3.62;
    this.kicker(t, 'MEASURE THE FUTURE', W / 2, 402, COPY.kicker, { align: 'center', out });
    this.text(t, 'その物件の未来を、', {
      font: this.font(500, 84, SERIF),
      size: 84,
      x: W / 2 + 22,
      y: 530,
      align: 'center',
      t0: COPY.line1,
      stagger: 0.032,
      dur: 0.6,
      color: '#f7f1e8',
      spacing: 10,
      spacingFrom: 34,
      mask: true,
      out,
      outStagger: 0.012,
    });
    this.text(t, '買う前に。', {
      font: this.font(600, 96, SERIF),
      size: 96,
      x: W / 2 + 24,
      y: 668,
      align: 'center',
      t0: COPY.line2,
      stagger: 0.05,
      dur: 0.6,
      color: (i, ch, x, w) => this.goldGradient(x, 580, x + w, 680),
      spacing: 14,
      spacingFrom: 40,
      mask: true,
      out: out + 0.08,
      outStagger: 0.02,
    });
    const rp = range(t, 3.05, 3.7);
    const ro = range(t, 3.72, 3.95);
    if (rp > 0) this.ruler(W / 2, 718, 520, rp, 1 - ro);
  }

  card(t, t0, x, y, w, h, anchor, draw, out = 7.78) {
    const ctx = this.ctx;
    const lp = ease.outExpo(range(t, t0, t0 + 0.22));
    const pp = ease.outExpo(range(t, t0 + 0.1, t0 + 0.42));
    const fade = 1 - range(t, out, out + 0.2);
    if (lp <= 0 || fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    // anchor dot + pulse
    if (anchor && !anchor.behind) {
      const pr = range(t, t0, t0 + 0.6);
      ctx.fillStyle = GOLD_HI;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(243,196,126,${(1 - pr) * 0.9})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 4 + ease.outCubic(pr) * 26, 0, Math.PI * 2);
      ctx.stroke();
      // leader: anchor -> elbow -> card edge
      const ex = x < anchor.x ? x + w : x;
      const ey = y + 34;
      const midX = lerp(anchor.x, ex, 0.55);
      const pts = [
        [anchor.x, anchor.y],
        [midX, ey],
        [ex, ey],
      ];
      const segs = [Math.hypot(midX - anchor.x, ey - anchor.y), Math.abs(ex - midX)];
      const L = segs[0] + segs[1];
      let rem = L * lp;
      ctx.strokeStyle = 'rgba(243,196,126,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < 2; i++) {
        const k = clamp(rem / segs[i]);
        ctx.lineTo(lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k));
        rem -= segs[i];
        if (rem <= 0) break;
      }
      ctx.stroke();
    }
    if (pp > 0) {
      // glass panel wipes open
      ctx.save();
      ctx.beginPath();
      const openW = w * pp;
      const ox = anchor && x < anchor.x ? x + w - openW : x;
      ctx.rect(ox, y, openW, h);
      ctx.clip();
      const bg = ctx.createLinearGradient(x, y, x + w, y + h);
      bg.addColorStop(0, 'rgba(22,32,48,0.72)');
      bg.addColorStop(1, 'rgba(10,15,24,0.55)');
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
      const bd = ctx.createLinearGradient(x, y, x + w, y + h);
      bd.addColorStop(0, 'rgba(243,196,126,0.75)');
      bd.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      bd.addColorStop(1, 'rgba(143,210,255,0.35)');
      ctx.strokeStyle = bd;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // corner ticks
      ctx.fillStyle = GOLD;
      for (const [cx, cy, dx, dy] of [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ]) {
        ctx.fillRect(cx - (dx < 0 ? 12 : 0), cy - (dy < 0 ? 2 : 0), 12, 2);
        ctx.fillRect(cx - (dx < 0 ? 2 : 0), cy - (dy < 0 ? 12 : 0), 2, 12);
      }
      draw(ctx, range(t, t0 + 0.2, t0 + 0.95));
      ctx.restore();
    }
    ctx.restore();
  }

  valueText(ctx, str, x, y, size, unit, unitSize, p) {
    // digits roll/scramble in, settle with outExpo
    ctx.font = this.font(300, size, MONO);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
    const w = ctx.measureText(str).width;
    if (unit) {
      ctx.font = this.font(500, unitSize, SANS);
      ctx.fillStyle = GOLD;
      ctx.globalAlpha *= clamp(p * 2);
      ctx.fillText(unit, x + w + 8, y);
    }
  }

  countStr(target, p, decimals = 0) {
    const v = target * ease.outExpo(p);
    const s = v.toFixed(decimals);
    const [i, d] = s.split('.');
    const withComma = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return d ? `${withComma}.${d}` : withComma;
  }

  drawBuild(t) {
    if (t < 4.0 || t >= 8.0) return;
    const ctx = this.ctx;
    const out = 7.72;
    const world = this.world;
    const P = (x, y, z) => world.project(new THREE.Vector3(x, y, z));
    // scene tag
    this.kicker(t, 'PROPERTY SCAN', 120, 132, 4.15, { out });
    this.text(t, '東京都世田谷区', {
      font: this.font(500, 40, SANS),
      size: 40,
      x: 118,
      y: 190,
      t0: 4.22,
      stagger: 0.03,
      dur: 0.45,
      color: '#f7f1e8',
      spacing: 4,
      spacingFrom: 16,
      mask: true,
      out,
    });
    this.text(t, '中古マンション ｜ 2LDK ｜ 築12年', {
      font: this.font(400, 19, SANS),
      size: 19,
      x: 120,
      y: 230,
      t0: 4.35,
      stagger: 0.01,
      dur: 0.4,
      color: MUTED,
      spacing: 2,
      out,
    });
    const tagLine = range(t, 4.3, 4.8) * (1 - range(t, out, out + 0.2));
    if (tagLine > 0) this.line(120, 256, 120 + 330 * ease.outExpo(tagLine), 256, 'rgba(243,196,126,0.6)', 1);
    this.text(t, '購入価格 5,480万円 ・ 想定家賃 23.0万円/月', {
      font: this.font(400, 17, SANS),
      size: 17,
      x: 120,
      y: 288,
      t0: 4.5,
      stagger: 0.008,
      dur: 0.35,
      color: 'rgba(214,224,236,0.5)',
      spacing: 1.5,
      out,
    });

    const [cYield, cRisk, cLoan, cValue] = CARDS;
    // yield (right top)
    this.card(t, cYield.t, 1420, 150, 380, 170, P(2.6, 5.2, 1.8), (c, p) => {
      c.font = this.font(500, 19, SANS);
      c.fillStyle = MUTED;
      c.fillText('想定利回り', 1450, 196);
      this.valueText(c, this.countStr(4.8, p, 1), 1450, 285, 76, '%', 30, p);
      // ring gauge
      const cx = 1720,
        cy = 238,
        r = 44;
      c.lineWidth = 7;
      c.strokeStyle = 'rgba(255,255,255,0.1)';
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, GOLD_HI);
      g.addColorStop(1, GOLD_DEEP);
      c.strokeStyle = g;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.62 * ease.outExpo(p));
      c.stroke();
    });
    // risk (left)
    this.card(t, cRisk.t, 120, 470, 380, 170, P(-2.6, 3.1, 2.35), (c, p) => {
      c.font = this.font(500, 19, SANS);
      c.fillStyle = MUTED;
      c.fillText('リスクスコア', 150, 516);
      this.valueText(c, this.countStr(32, p), 150, 590, 62, '/ 100', 20, p);
      const bx = 150,
        by = 608,
        bw = 320;
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fillRect(bx, by, bw, 5);
      const g = c.createLinearGradient(bx, 0, bx + bw * 0.32, 0);
      g.addColorStop(0, ICE);
      g.addColorStop(1, GOLD);
      c.fillStyle = g;
      c.fillRect(bx, by, bw * 0.32 * ease.outExpo(p), 5);
      c.font = this.font(400, 13, SANS);
      c.fillStyle = 'rgba(214,224,236,0.45)';
      c.fillText('低リスク', bx, by + 24);
      c.textAlign = 'right';
      c.fillText('高リスク', bx + bw, by + 24);
      c.textAlign = 'left';
    });
    // loan (left bottom)
    this.card(t, cLoan.t, 120, 690, 380, 150, P(-2.4, 1.2, 2.35), (c, p) => {
      c.font = this.font(500, 19, SANS);
      c.fillStyle = MUTED;
      c.fillText('ローン残高（10年後）', 150, 736);
      this.valueText(c, this.countStr(3892, p), 150, 810, 62, '万円', 24, p);
    });
    // asset value (right)
    this.card(t, cValue.t, 1420, 380, 380, 190, P(2.6, 2.4, 0.2), (c, p) => {
      c.font = this.font(500, 19, SANS);
      c.fillStyle = MUTED;
      c.fillText('将来の資産価値（50年後）', 1450, 426);
      this.valueText(c, this.countStr(7124, p), 1450, 500, 62, '万円', 24, p);
      // mini bars echoing the brand mark
      const hs = [0.36, 0.66, 1];
      hs.forEach((hh, i) => {
        const k = ease.outBack(range(p, i * 0.12, 0.5 + i * 0.12));
        c.fillStyle = i === 2 ? GOLD : 'rgba(243,196,126,0.55)';
        c.fillRect(1718 + i * 16, 540 - 60 * hh * k, 9, 60 * hh * k);
      });
      c.font = this.font(400, 14, SANS);
      c.fillStyle = 'rgba(214,224,236,0.45)';
      c.fillText('購入価格 5,480万円 から', 1450, 542);
    });

    // headline
    const y = 985;
    const words = [
      ['収益性', 1],
      ['も、', 0],
      ['リスク', 1],
      ['も、', 0],
      ['将来性', 1],
      ['も。', 0],
    ];
    const str = words.map((w) => w[0]).join('');
    const strong = [];
    words.forEach(([w, s]) => [...w].forEach(() => strong.push(s)));
    this.text(t, str, {
      font: this.font(500, 50, SERIF),
      size: 50,
      x: W / 2,
      y,
      align: 'center',
      t0: COPY.buildCopy,
      stagger: 0.028,
      dur: 0.5,
      color: (i) => (strong[i] ? '#fbf6ee' : 'rgba(243,196,126,0.9)'),
      spacing: 8,
      spacingFrom: 24,
      mask: true,
      out: 7.75,
      outStagger: 0.006,
      outDur: 0.2,
    });
    void ctx;
  }

  drawGraph(t) {
    if (t < 8.0 || t >= 11.02) return;
    const ctx = this.ctx;
    const years = graphYears(t);
    const out = 10.82;
    const fade = 1 - range(t, out, out + 0.18);
    const world = this.world;
    const P = (x, y) => world.project(new THREE.Vector3(x, y, 0));
    this.kicker(t, '50-YEAR SIMULATION', 120, 132, 8.08, { out });
    this.text(t, '累計キャッシュフロー', {
      font: this.font(500, 24, SANS),
      size: 24,
      x: 120,
      y: 182,
      t0: 8.12,
      stagger: 0.02,
      dur: 0.4,
      color: MUTED,
      spacing: 3,
      spacingFrom: 12,
      out,
    });
    const v = Math.round(cashFlow(years));
    const inP = ease.outExpo(range(t, 8.1, 8.45));
    ctx.save();
    ctx.globalAlpha = inP * fade;
    const str = (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-US');
    ctx.font = this.font(200, 128, MONO);
    ctx.fillStyle = v >= 0 ? this.goldGradient(120, 190, 560, 300) : '#bfe6ff';
    ctx.fillText(str, 112, 310 + (1 - inP) * 30);
    const sw = ctx.measureText(str).width;
    ctx.font = this.font(500, 34, SANS);
    ctx.fillStyle = 'rgba(247,241,232,0.85)';
    ctx.fillText('万円', 124 + sw, 306 + (1 - inP) * 30);
    ctx.font = this.font(500, 17, LATIN);
    ctx.letterSpacing = '4px';
    ctx.fillStyle = 'rgba(214,224,236,0.55)';
    ctx.fillText(`YEAR ${String(Math.floor(years)).padStart(2, '0')} / 50`, 122, 352);
    ctx.restore();

    // axis labels
    const g = this.world;
    ctx.save();
    ctx.globalAlpha = fade;
    for (let y = 0; y <= 50; y += 10) {
      const p = P(g.gx(y), g.GBASE - 0.62);
      const k = range(t, 8.05 + y * 0.004, 8.35 + y * 0.004);
      if (k <= 0) continue;
      ctx.globalAlpha = fade * k * (y <= years + 0.5 ? 0.95 : 0.4);
      ctx.font = this.font(500, 17, SANS);
      ctx.fillStyle = y <= years ? GOLD : 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(y === 0 ? '購入' : `${y}年`, p.x, p.y + 6);
    }
    ctx.restore();

    // break-even label
    const bt = graphYearTime(breakEvenYear);
    if (t > bt) {
      const p = P(g.gx(breakEvenYear), g.gy(0));
      const k = spring(range(t, bt, bt + 0.9), 6, 1.5);
      const a = clamp((t - bt) * 5) * fade;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = this.font(600, 12, LATIN);
      ctx.letterSpacing = '4px';
      ctx.fillStyle = ICE;
      ctx.fillText('BREAK-EVEN', p.x + 18, p.y - 44 - k * 6);
      ctx.font = this.font(500, 22, SANS);
      ctx.letterSpacing = '2px';
      ctx.fillStyle = '#eaf6ff';
      ctx.fillText('黒字転換', p.x + 18, p.y - 16 - k * 6);
      ctx.restore();
    }

    // milestones
    for (const y of [10, 20, 30, 40, 50]) {
      const mt = graphYearTime(y);
      if (t < mt) continue;
      const val = Math.round(cashFlow(y));
      const p = P(g.gx(y), g.gy(cashFlow(y)));
      const k = spring(range(t, mt, mt + 0.8), 6.5, 1.6);
      const a = clamp((t - mt) * 6) * fade;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = this.font(500, 15, SANS);
      ctx.fillStyle = MUTED;
      const lift = 30 + k * 16;
      ctx.fillText(`${y}年目`, p.x, p.y - lift - 34);
      ctx.font = this.font(400, 30, MONO);
      ctx.fillStyle = y === 50 ? GOLD_HI : '#f7f1e8';
      ctx.fillText(`+${val.toLocaleString('en-US')}`, p.x - 14, p.y - lift);
      const vw = ctx.measureText(`+${val.toLocaleString('en-US')}`).width;
      ctx.font = this.font(500, 15, SANS);
      ctx.fillStyle = GOLD;
      ctx.textAlign = 'left';
      ctx.fillText('万円', p.x - 14 + vw / 2 + 4, p.y - lift);
      ctx.restore();
    }
  }

  drawNumbers(t) {
    if (t < 10.95 || t > 13.05) return;
    const out = 12.6;
    const rush = ease.inExpo(range(t, 12.55, 13.0));
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const s = 1 + rush * 0.6;
    ctx.scale(s, s);
    ctx.translate(-W / 2, -H / 2);
    this.text(t, '感覚ではなく、', {
      font: this.font(500, 72, SERIF),
      size: 72,
      x: W / 2 + 12,
      y: 470,
      align: 'center',
      t0: COPY.numbers1,
      stagger: 0.045,
      dur: 0.6,
      color: '#f4efe7',
      spacing: 12,
      spacingFrom: 40,
      mask: true,
      out,
      outStagger: 0.01,
      outDur: 0.35,
    });
    this.text(t, '数字で。', {
      font: this.font(700, 150, SERIF),
      size: 150,
      x: W / 2 + 22,
      y: 680,
      align: 'center',
      t0: COPY.numbers2,
      stagger: 0.07,
      dur: 0.55,
      color: (i, ch, x, w) => this.goldGradient(x, 540, x + w, 690),
      spacing: 22,
      spacingFrom: 60,
      mask: true,
      rise: 0.4,
      out: out + 0.05,
      outStagger: 0.012,
      outDur: 0.35,
    });
    const rp = range(t, 12.05, 12.55);
    if (rp > 0) this.ruler(W / 2, 735, 640, rp, 1 - range(t, 12.6, 12.85), 50);
    ctx.restore();
  }

  drawLogo(t) {
    if (t < 13.0) return;
    const ctx = this.ctx;
    const lt = t - 13.0;
    // wordmark
    const tr = lerp(70, 34, ease.outExpo(range(t, 13.08, 14.2)));
    const font = this.font(300, 92, LATIN);
    const word = 'MONO-SASHI';
    const chars = [...word];
    const widths = chars.map((c) => this.measure(c, font));
    const total = widths.reduce((a, b) => a + b, 0) + tr * (chars.length - 1);
    let x = W / 2 - total / 2;
    const y = 660;
    ctx.save();
    ctx.font = font;
    const order = chars.map((_, i) => Math.abs(i - 4.5));
    chars.forEach((ch, i) => {
      const st = 13.1 + order[i] * 0.035;
      const p = range(t, st, st + 0.7);
      const e = ease.outExpo(p);
      ctx.globalAlpha = clamp(p * 2);
      ctx.filter = e < 0.98 ? `blur(${((1 - e) * 14).toFixed(2)}px)` : 'none';
      ctx.fillStyle = '#f8f3ea';
      ctx.fillText(ch, x, y);
      x += widths[i] + tr;
    });
    ctx.filter = 'none';
    // light sweep across the wordmark
    const sw = range(t, 14.0, 14.7);
    if (sw > 0 && sw < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      const sx = lerp(W / 2 - total / 2 - 200, W / 2 + total / 2 + 200, ease.inOutCubic(sw));
      const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
      g.addColorStop(0, 'rgba(255,214,150,0)');
      g.addColorStop(0.5, 'rgba(255,226,170,0.95)');
      g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(W / 2 - total / 2 - 40, y - 100, total + 80, 130);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    this.ruler(W / 2, 712, 560, range(t, 13.35, 14.0), 1, 50);
    this.text(t, '未来は、自分で選ぶ。', {
      font: this.font(500, 40, SERIF),
      size: 40,
      x: W / 2 + 8,
      y: 800,
      align: 'center',
      t0: COPY.tagline,
      stagger: 0.04,
      dur: 0.6,
      color: '#f4efe7',
      spacing: 8,
      spacingFrom: 24,
      mask: true,
    });
    this.kicker(t, '不動産投資シミュレーションアプリ', W / 2 + 3, 862, 14.1, {
      align: 'center',
      size: 16,
      weight: 500,
      spacing: 6,
      spacingFrom: 14,
      family: SANS,
      color: 'rgba(214,224,236,0.6)',
    });
    void lt;
  }

  draw(t) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    this.drawWarp(t);
    this.drawPromise(t);
    this.drawBuild(t);
    this.drawGraph(t);
    this.drawNumbers(t);
    this.drawLogo(t);
  }
}
