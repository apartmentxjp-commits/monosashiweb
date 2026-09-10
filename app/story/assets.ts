export const characterAssets = Array.from(
  { length: 6 },
  (_, index) => `/art/character-stage-${index + 1}.png`,
);

export function getCharacterAsset(stage: number) {
  const safeStage = Math.min(characterAssets.length - 1, Math.max(0, Math.floor(stage)));
  return characterAssets[safeStage];
}
