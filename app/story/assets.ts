export const characterAssets = Array.from(
  { length: 6 },
  (_, index) => `/art/character-stage-${index + 1}.png`,
);

export const characterCrops = [
  { x: 5, width: 320 },
  { x: 350, width: 210 },
  { x: 590, width: 250 },
  { x: 880, width: 400 },
  { x: 1275, width: 420 },
  { x: 1700, width: 472 },
] as const;

export function getCharacterAsset(stage: number) {
  const safeStage = Math.min(characterAssets.length - 1, Math.max(0, Math.floor(stage)));
  return characterAssets[safeStage];
}
