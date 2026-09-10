import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel static deployment', () => {
  it('exports a static site into the configured public directory', () => {
    const config = readFileSync('next.config.ts', 'utf8');
    expect(config).toContain("output: 'export'");
    expect(existsSync('vercel.json')).toBe(true);
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(vercel.outputDirectory).toBe('dist/client');
  });
});
