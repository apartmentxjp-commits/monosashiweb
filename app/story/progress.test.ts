import { describe, expect, it } from 'vitest';
import { getStoryState, rangeProgress } from './progress';

describe('story progress', () => {
  it('normalizes a scene range', () => {
    expect(rangeProgress(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(rangeProgress(0.1, 0.2, 0.4)).toBe(0);
    expect(rangeProgress(0.5, 0.2, 0.4)).toBe(1);
  });

  it('reveals the ruler only after the purchase', () => {
    expect(getStoryState(0.26).rulerReveal).toBe(0);
    expect(getStoryState(0.36).rulerReveal).toBe(1);
  });

  it('finishes with a mature family, property, and final statement', () => {
    const state = getStoryState(1);
    expect(state.lifeStage).toBe(5);
    expect(state.familyStage).toBe(2);
    expect(state.propertyStage).toBe(4);
    expect(state.finalReveal).toBe(1);
  });
});
