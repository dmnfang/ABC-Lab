export const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

export function originalSequence() {
  return [...ALPHABET];
}

export function randomSequence() {
  const result = [...ALPHABET];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
