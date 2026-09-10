import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { characterAssets, getCharacterAsset } from './assets';

describe('character assets', () => {
  it('uses one isolated file for every life stage', () => {
    expect(characterAssets).toHaveLength(6);
    expect(new Set(characterAssets).size).toBe(6);
    characterAssets.forEach((asset) => {
      expect(asset).toMatch(/^\/art\/character-stage-[1-6]\.png$/);
      expect(existsSync(join(process.cwd(), 'public', asset))).toBe(true);
    });
  });

  it('clamps stage selection to the available files', () => {
    expect(getCharacterAsset(-1)).toBe(characterAssets[0]);
    expect(getCharacterAsset(99)).toBe(characterAssets[5]);
  });
});
