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
});
