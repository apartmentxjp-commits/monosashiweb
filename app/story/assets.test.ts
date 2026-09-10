import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { characterAssets, characterCrops, getCharacterAsset } from './assets';

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

  it('crops each alpha group without entering an adjacent group', () => {
    const occupiedGroups = [[21,296],[373,531],[614,811],[914,1256],[1294,1670],[1722,2155]];
    characterCrops.forEach(({ x, width }, index) => {
      const [start, end] = occupiedGroups[index];
      expect(x).toBeLessThanOrEqual(start);
      expect(x + width).toBeGreaterThan(end);
      if (index > 0) expect(x).toBeGreaterThan(occupiedGroups[index - 1][1]);
      if (index < 5) expect(x + width).toBeLessThan(occupiedGroups[index + 1][0]);
    });
  });
});
