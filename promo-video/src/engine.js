// Render engine: HDR scene + 2D overlay -> sub-frame accumulation (true motion blur)
// -> dual-filter bloom -> filmic grade / chromatic aberration / zoom blur / grain.
import * as THREE from 'three';
import { W, H, FPS, HITS, clamp, designTime } from './timeline.js';

const FULL_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMPOSITE_FS = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tPrev;
  uniform float uWeight;
  uniform vec3 uBgA;
  uniform vec3 uBgB;
  uniform vec2 uBgCenter;
  void main() {
    vec2 p = (vUv - uBgCenter) * vec2(1.7778, 1.0);
    float r = length(p);
    vec3 bg = mix(uBgA, uBgB, smoothstep(0.0, 1.25, r));
    vec3 col = bg + texture2D(tScene, vUv).rgb;
    gl_FragColor = vec4(texture2D(tPrev, vUv).rgb + col * uWeight, 1.0);
  }
`;

const OVERLAY_FS = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tOverlay;
  uniform sampler2D tPrev;
  uniform float uWeight;
  uniform float uCoverage;
  void main() {
    vec4 o = texture2D(tOverlay, vUv);
    // alpha of blended half-float targets is unreliable on SwiftShader: keep coverage in RGB
    vec3 c = uCoverage > 0.5 ? vec3(o.a) : o.rgb * o.a;
    gl_FragColor = vec4(texture2D(tPrev, vUv).rgb + c * uWeight, 1.0);
  }
`;

const PREFILTER_FS = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;
  vec3 sampleBox(vec2 uv) {
    vec3 a = texture2D(tInput, uv + uTexel * vec2(-1.0, -1.0)).rgb;
    vec3 b = texture2D(tInput, uv + uTexel * vec2( 1.0, -1.0)).rgb;
    vec3 c = texture2D(tInput, uv + uTexel * vec2(-1.0,  1.0)).rgb;
    vec3 d = texture2D(tInput, uv + uTexel * vec2( 1.0,  1.0)).rgb;
    return (a + b + c + d) * 0.25;
  }
  void main() {
    vec3 c = sampleBox(vUv);
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    rq = (rq * rq) / (4.0 * uKnee + 1e-4);
    float w = max(rq, br - uThreshold) / max(br, 1e-4);
    gl_FragColor = vec4(min(c * w, vec3(40.0)), 1.0);
  }
`;

const DOWN_FS = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(tInput, vUv + t * vec2(-2.0, 2.0)).rgb;
    vec3 b = texture2D(tInput, vUv + t * vec2( 0.0, 2.0)).rgb;
    vec3 c = texture2D(tInput, vUv + t * vec2( 2.0, 2.0)).rgb;
    vec3 d = texture2D(tInput, vUv + t * vec2(-2.0, 0.0)).rgb;
    vec3 e = texture2D(tInput, vUv).rgb;
    vec3 f = texture2D(tInput, vUv + t * vec2( 2.0, 0.0)).rgb;
    vec3 g = texture2D(tInput, vUv + t * vec2(-2.0,-2.0)).rgb;
    vec3 h = texture2D(tInput, vUv + t * vec2( 0.0,-2.0)).rgb;
    vec3 i = texture2D(tInput, vUv + t * vec2( 2.0,-2.0)).rgb;
    vec3 j = texture2D(tInput, vUv + t * vec2(-1.0, 1.0)).rgb;
    vec3 k = texture2D(tInput, vUv + t * vec2( 1.0, 1.0)).rgb;
    vec3 l = texture2D(tInput, vUv + t * vec2(-1.0,-1.0)).rgb;
    vec3 m = texture2D(tInput, vUv + t * vec2( 1.0,-1.0)).rgb;
    vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    gl_FragColor = vec4(o, 1.0);
  }
`;

const UP_FS = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tInput;
  uniform sampler2D tBase;
  uniform vec2 uTexel;
  uniform float uScatter;
  void main() {
    vec2 t = uTexel;
    vec3 s = texture2D(tInput, vUv + t * vec2(-1.0, 1.0)).rgb
      + texture2D(tInput, vUv + t * vec2( 0.0, 1.0)).rgb * 2.0
      + texture2D(tInput, vUv + t * vec2( 1.0, 1.0)).rgb
      + texture2D(tInput, vUv + t * vec2(-1.0, 0.0)).rgb * 2.0
      + texture2D(tInput, vUv).rgb * 4.0
      + texture2D(tInput, vUv + t * vec2( 1.0, 0.0)).rgb * 2.0
      + texture2D(tInput, vUv + t * vec2(-1.0,-1.0)).rgb
      + texture2D(tInput, vUv + t * vec2( 0.0,-1.0)).rgb * 2.0
      + texture2D(tInput, vUv + t * vec2( 1.0,-1.0)).rgb;
    s /= 16.0;
    gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s * uScatter, 1.0);
  }
`;

const FINAL_FS = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tHdr;
  uniform sampler2D tBloom;
  uniform sampler2D tOv;
  uniform sampler2D tCov;
  uniform float uBloom;
  uniform float uExposure;
  uniform float uFlash;
  uniform vec3 uFlashColor;
  uniform float uCA;
  uniform float uZoom;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uSeed;
  uniform float uFade;
  uniform vec2 uZoomCenter;

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423) + uSeed);
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }
  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec4 sampleOv(vec2 uv) {
    vec2 dir = uv - 0.5;
    vec2 off = dir * uCA * 0.012 * (0.4 + dot(dir, dir) * 2.4);
    vec4 c = vec4(texture2D(tOv, uv).rgb, texture2D(tCov, uv).r);
    c.r = texture2D(tOv, uv + off).r;
    c.b = texture2D(tOv, uv - off).b;
    return c;
  }
  vec3 sampleHdr(vec2 uv) {
    vec2 dir = uv - 0.5;
    float d2 = dot(dir, dir);
    vec2 off = dir * (0.0025 + uCA * 0.018) * (0.4 + d2 * 2.4);
    vec3 c;
    c.r = texture2D(tHdr, uv + off).r;
    c.g = texture2D(tHdr, uv).g;
    c.b = texture2D(tHdr, uv - off).b;
    vec3 b;
    b.r = texture2D(tBloom, uv + off * 1.6).r;
    b.g = texture2D(tBloom, uv).g;
    b.b = texture2D(tBloom, uv - off * 1.6).b;
    return c + b * uBloom;
  }
  void main() {
    vec3 col = vec3(0.0);
    vec4 ov = vec4(0.0);
    if (uZoom > 0.0005) {
      float jitter = hash(vUv * 1000.0);
      for (int i = 0; i < 10; i++) {
        float k = (float(i) + jitter) / 10.0;
        vec2 uv = uZoomCenter + (vUv - uZoomCenter) * (1.0 - uZoom * k);
        col += sampleHdr(uv);
        ov += sampleOv(uZoomCenter + (vUv - uZoomCenter) * (1.0 - uZoom * k * 0.5));
      }
      col /= 10.0;
      ov /= 10.0;
    } else {
      col = sampleHdr(vUv);
      ov = sampleOv(vUv);
    }
    col *= uExposure;
    col += uFlashColor * uFlash;
    col *= 1.0 + uFlash * 0.6;

    // Grade: cool, deep shadows / warm champagne highlights.
    vec3 tm = aces(col);
    float l = dot(tm, vec3(0.2126, 0.7152, 0.0722));
    tm = mix(vec3(l), tm, 1.06);
    tm += vec3(-0.0008, 0.0004, 0.0025) * (1.0 - smoothstep(0.0, 0.3, l));
    tm = mix(tm, tm * vec3(1.03, 1.0, 0.95), smoothstep(0.45, 1.0, l));

    vec2 q = (vUv - 0.5) * vec2(1.7778, 1.0);
    float v = 1.0 - uVignette * smoothstep(0.35, 1.25, length(q));
    tm *= v;

    vec3 srgb = pow(clamp(tm, 0.0, 1.0), vec3(1.0 / 2.2));
    // typography is composited after the grade so whites stay white
    float fl = clamp(uFlash, 0.0, 1.0);
    srgb = srgb * (1.0 - ov.a) + ov.rgb * (1.0 + fl * 0.3);
    float n = hash(vUv * vec2(1920.0, 1080.0)) + hash(vUv * vec2(1920.0, 1080.0) + 7.31) - 1.0;
    float lum = dot(srgb, vec3(0.333));
    srgb += n * (uGrain * (0.55 + 0.45 * (1.0 - lum)) + 1.5 / 255.0);
    srgb *= uFade;
    gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
  }
`;

export class Engine {
  constructor(canvas, overlayCanvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.autoClear = true;
    this.renderer.toneMapping = THREE.NoToneMapping;

    const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true };
    this.sceneRT = new THREE.WebGLRenderTarget(W, H, { ...hdr, samples: 4 });
    // Accumulation is done by ping-pong in the shader: float blending is not available here.
    const f32 = () => new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
    this.acc = { scene: [f32(), f32()], ov: [f32(), f32()], cov: [f32(), f32()] };

    this.mips = [];
    let w = W / 2,
      h = H / 2;
    for (let i = 0; i < 7; i++) {
      const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)), {
        type: THREE.HalfFloatType,
        depthBuffer: false,
      });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      this.mips.push(rt);
      w /= 2;
      h /= 2;
    }
    this.ups = this.mips.map(
      (m) =>
        new THREE.WebGLRenderTarget(m.width, m.height, { type: THREE.HalfFloatType, depthBuffer: false }),
    );

    this.overlayTex = new THREE.CanvasTexture(overlayCanvas);
    this.overlayTex.minFilter = THREE.LinearFilter;
    this.overlayTex.magFilter = THREE.LinearFilter;
    this.overlayTex.generateMipmaps = false;
    this.overlayTex.colorSpace = THREE.NoColorSpace;
    this.overlayTex.premultiplyAlpha = false;

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const mat = (fs, uniforms, extra = {}) =>
      new THREE.ShaderMaterial({
        vertexShader: FULL_VS,
        fragmentShader: fs,
        uniforms,
        depthTest: false,
        depthWrite: false,
        ...extra,
      });

    this.compositeMat = mat(
      COMPOSITE_FS,
      {
        tScene: { value: null },
        tOverlay: { value: this.overlayTex },
        uWeight: { value: 1 },
        tPrev: { value: null },
        uBgA: { value: new THREE.Color(0.012, 0.016, 0.026) },
        uBgB: { value: new THREE.Color(0.0015, 0.002, 0.004) },
        uBgCenter: { value: new THREE.Vector2(0.5, 0.55) },
      },
      { blending: THREE.NoBlending },
    );
    this.overlayMat = mat(
      OVERLAY_FS,
      { tOverlay: { value: this.overlayTex }, tPrev: { value: null }, uWeight: { value: 1 }, uCoverage: { value: 0 } },
      { blending: THREE.NoBlending },
    );
    // explicit zero-write: renderer.clear() keeps alpha at 1 with an alpha:false context
    this.clearMat = mat(
      /* glsl */ `precision highp float; void main() { gl_FragColor = vec4(0.0); }`,
      {},
      { blending: THREE.NoBlending },
    );
    this.prefilterMat = mat(PREFILTER_FS, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 0.9 },
      uKnee: { value: 0.5 },
    });
    this.downMat = mat(DOWN_FS, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mat(UP_FS, {
      tInput: { value: null },
      tBase: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uScatter: { value: 0.85 },
    });
    this.finalMat = mat(FINAL_FS, {
      tHdr: { value: null },
      tBloom: { value: null },
      tOv: { value: null },
      tCov: { value: null },
      uBloom: { value: 0.55 },
      uExposure: { value: 1.0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
      uCA: { value: 0 },
      uZoom: { value: 0 },
      uZoomCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uVignette: { value: 0.55 },
      uGrain: { value: 0.022 },
      uSeed: { value: 0 },
      uFade: { value: 1 },
    });
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  bloom(src) {
    this.prefilterMat.uniforms.tInput.value = src;
    this.prefilterMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.pass(this.prefilterMat, this.mips[0]);
    for (let i = 1; i < this.mips.length; i++) {
      const prev = this.mips[i - 1];
      this.downMat.uniforms.tInput.value = prev.texture;
      this.downMat.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.pass(this.downMat, this.mips[i]);
    }
    let cur = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      this.upMat.uniforms.tInput.value = cur.texture;
      this.upMat.uniforms.tBase.value = this.mips[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / cur.width, 1 / cur.height);
      this.pass(this.upMat, this.ups[i]);
      cur = this.ups[i];
    }
    return cur.texture;
  }

  /**
   * @param t frame time (seconds)
   * @param drawAt callback(tSub) that updates the 3D scene + overlay canvas and returns {scene, camera, post}
   */
  renderFrame(t, frame, samples, drawAt) {
    const r = this.renderer;
    const acc = this.acc;
    const cur = { scene: 0, ov: 0, cov: 0 };
    for (const k of ['scene', 'ov', 'cov']) this.pass(this.clearMat, acc[k][0]);
    const accumulate = (k, material) => {
      material.uniforms.tPrev.value = acc[k][cur[k]].texture;
      this.pass(material, acc[k][1 - cur[k]]);
      cur[k] = 1 - cur[k];
    };
    const shutter = 0.5 / FPS;
    let post = {};
    for (let s = 0; s < samples; s++) {
      const ts = samples === 1 ? t : t + ((s + 0.5) / samples - 0.5) * shutter;
      const res = drawAt(ts);
      post = res.post || post;
      r.setRenderTarget(this.sceneRT);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      r.render(res.scene, res.camera);
      this.overlayTex.needsUpdate = true;
      this.compositeMat.uniforms.tScene.value = this.sceneRT.texture;
      this.compositeMat.uniforms.uWeight.value = 1 / samples;
      if (res.bg) {
        this.compositeMat.uniforms.uBgA.value.copy(res.bg.a);
        this.compositeMat.uniforms.uBgB.value.copy(res.bg.b);
        this.compositeMat.uniforms.uBgCenter.value.copy(res.bg.center);
      }
      accumulate('scene', this.compositeMat);
      this.overlayMat.uniforms.uWeight.value = 1 / samples;
      this.overlayMat.uniforms.uCoverage.value = 0;
      accumulate('ov', this.overlayMat);
      this.overlayMat.uniforms.uCoverage.value = 1;
      accumulate('cov', this.overlayMat);
    }

    const hdr = acc.scene[cur.scene].texture;
    const bloomTex = this.bloom(hdr);
    this.finalMat.uniforms.tHdr.value = hdr;
    this.finalMat.uniforms.tOv.value = acc.ov[cur.ov].texture;
    this.finalMat.uniforms.tCov.value = acc.cov[cur.cov].texture;
    const u = this.finalMat.uniforms;
    u.tBloom.value = bloomTex;
    const hit = hitEnvelope(designTime(t));
    u.uFlash.value = hit.flash + (post.flash || 0);
    u.uCA.value = hit.ca + (post.ca || 0);
    u.uZoom.value = hit.ca * 0.06 + (post.zoom || 0);
    if (post.zoomCenter) u.uZoomCenter.value.copy(post.zoomCenter);
    else u.uZoomCenter.value.set(0.5, 0.5);
    u.uBloom.value = post.bloom ?? 0.55;
    u.uExposure.value = post.exposure ?? 1.0;
    u.uFade.value = post.fade ?? 1.0;
    u.uSeed.value = (frame * 0.61803398875) % 1;
    this.pass(this.finalMat, null);
  }
}

export function hitEnvelope(t) {
  let flash = 0,
    ca = 0;
  for (const h of HITS) {
    const dt = t - h.t;
    if (dt < -0.034 || dt > 2) continue;
    const a = dt < 0 ? clamp(1 + dt / 0.034) : Math.exp(-dt / h.decay);
    flash += h.flash * a * a;
    ca += h.ca * a;
  }
  return { flash, ca };
}
