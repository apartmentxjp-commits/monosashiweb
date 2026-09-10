import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile panorama end coverage', () => {
  it('keeps a panorama canvas wider than 2100px through the final camera position', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    const mobileStart = css.search(/@media\s*\(max-width:\s*720px\)/);
    const mobile = css.slice(mobileStart);
    const width = Number(mobile.match(/\.story-world\s*\{[\s\S]*?width:\s*(\d+)px/)?.[1]);
    expect(width).toBeGreaterThanOrEqual(2100);
  });

  it('fades every panorama edge into the paper background', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    const worldRule = css.match(/\.story-world\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(worldRule).toContain('radial-gradient');
    expect(worldRule).toContain('mask-image');
  });
});
