export type StoryState = {
  cameraX: number;
  cameraScale: number;
  walkPhase: number;
  rulerReveal: number;
  encounter: number;
  decision: number;
  lifeStage: number;
  familyStage: number;
  propertyStage: number;
  finalReveal: number;
};

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function rangeProgress(value: number, start: number, end: number) {
  return clamp01((value - start) / (end - start));
}

export function getStoryState(progress: number): StoryState {
  const p = clamp01(progress);
  const growth = rangeProgress(p, 0.36, 0.9);
  const lifeStage = p < 0.12 ? 0 : p < 0.22 ? 1 : p < 0.32 ? 2 : p < 0.54 ? 3 : p < 0.72 ? 4 : 5;
  return {
    cameraX: p * 74,
    cameraScale: 1.12 - rangeProgress(p, 0, 0.86) * 0.28,
    walkPhase: p * 24,
    rulerReveal: rangeProgress(p, 0.27, 0.36),
    encounter: rangeProgress(p, 0.12, 0.2) * (1 - rangeProgress(p, 0.34, 0.43)),
    decision: rangeProgress(p, 0.2, 0.27) * (1 - rangeProgress(p, 0.34, 0.4)),
    lifeStage,
    familyStage: growth < 0.31 ? 0 : growth < 0.57 ? 1 : 2,
    propertyStage: Math.min(4, Math.floor(growth * 5)),
    finalReveal: rangeProgress(p, 0.94, 1),
  };
}
