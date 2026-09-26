// Deterministic frame renderer.
//   node render.mjs --stills 0.3,1.0,2.5          -> out/stills/t_<sec>.png
//   node render.mjs --frames [--from 0 --to 899] [--workers 3] [--samples N]
//                                               -> out/frames/f_00000.png ...
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node22/lib/node_modules/playwright');
  }
}
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const has = (k) => args.includes(`--${k}`);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(port) {
  const browser = await chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
      ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
      : undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(0);
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('404')) console.log(`[page ${m.type()}]`, m.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  return { browser, page };
}

async function shot(page, file, frame, samples) {
  const s = await page.evaluate(([f, sm]) => {
    const n = window.__renderFrame(f, sm ? { samples: sm } : {});
    // block until the GPU work for this frame is done so the screenshot never waits on it
    const gl = window.__engine.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return n;
  }, [frame, samples]);
  await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 }, timeout: 0 });
  return s;
}

const srv = await serve();
const port = srv.address().port;
const samplesOverride = arg('samples') ? Number(arg('samples')) : undefined;

try {
  if (has('stills')) {
    const dir = path.join(OUT, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const { browser, page } = await openPage(port);
    for (const ts of arg('stills').split(',').map(Number)) {
      const frame = Math.round(ts * 60);
      const file = path.join(dir, `t_${ts.toFixed(2)}.png`);
      const t0 = Date.now();
      const s = await shot(page, file, frame, samplesOverride);
      console.log(`${file}  (${s} samples, ${Date.now() - t0}ms)`);
    }
    await browser.close();
  } else if (has('frames')) {
    const dir = path.join(OUT, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    const from = Number(arg('from', 0));
    const to = Number(arg('to', 899));
    const workers = Number(arg('workers', 3));
    const skip = has('resume');
    const all = [];
    for (let f = from; f <= to; f++) all.push(f);
    let next = 0;
    let done = 0;
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const { browser, page } = await openPage(port);
        while (next < all.length) {
          const f = all[next++];
          const file = path.join(dir, `f_${String(f).padStart(5, '0')}.png`);
          if (skip && fs.existsSync(file)) {
            done++;
            continue;
          }
          await shot(page, file, f, samplesOverride);
          done++;
          if (done % 20 === 0) {
            const el = (Date.now() - t0) / 1000;
            console.log(`w${w} frame ${f}  ${done}/${all.length}  ${el.toFixed(0)}s  eta ${((el / done) * (all.length - done)).toFixed(0)}s`);
          }
        }
        await browser.close();
      }),
    );
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  srv.close();
}
