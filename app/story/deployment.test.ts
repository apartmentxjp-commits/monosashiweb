import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel static deployment', () => {
  it('exports a static site into the configured public directory', () => {
    expect(existsSync('index.html')).toBe(true);
    expect(existsSync('static-src/main.tsx')).toBe(true);
    expect(existsSync('vercel.json')).toBe(true);
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(vercel.buildCommand).toBe('npm run build:vercel');
    expect(vercel.outputDirectory).toBe('dist-vercel');
  });

  it('publishes a large X card with the MONO-SASHI social preview', () => {
    const html = readFileSync('index.html', 'utf8');
    const imageUrl = 'https://site-omega-three-21.vercel.app/og/mono-sashi-x-og.png';

    expect(existsSync('public/og/mono-sashi-x-og.png')).toBe(true);
    expect(html).toContain(
      '<meta name="application-name" content="不動産投資シミュレーションアプリ MONO-SASHI" />',
    );
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:url" content="https://site-omega-three-21.vercel.app/" />');
    expect(html).toContain('<meta property="og:title" content="物件選びを、もっと安全に。｜MONO-SASHI" />');
    expect(html).toContain(
      '<meta property="og:description" content="不動産投資の判断を、感覚ではなく数字で。MONO-SASHIは、物件の収益性・リスク・将来性を見える化します。" />',
    );
    expect(html).toContain(`<meta property="og:image" content="${imageUrl}" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain(`<meta name="twitter:image" content="${imageUrl}" />`);
  });
});
