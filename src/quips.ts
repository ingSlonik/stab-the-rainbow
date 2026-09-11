// 13KB bundle optimization: quips.ts is preserved for documentation/reference.
// Random in-run speech/dialogue quips were disabled to save ~1KB bundle size.
// The single best death quote is retained directly for Game Over.

/*
import { randChoice } from './math';

export const UNICORN_START_QUIPS = [
  'Horns up, clouds down!',
  'Gallop into the rainbow!',
  'Full speed ahead!',
  'Piercing the sky!',
];

export const UNICORN_STAB_QUIPS = [
  'Stab!',
  'Pierced!',
  'Pop!',
  'Direct hit!',
  'Right through!',
];

export const UNICORN_COMBO_QUIPS = [
  'Rainbow combo!',
  'Pure magic!',
  'Unstoppable!',
  'Prismatic power!',
];

export const UNICORN_DEATH_QUIPS = [
  'Gravity: 1, Unicorn: 0.',
  'Fell into the abyss!',
  'Gravity was faster this time.',
  'Watch your step!',
];


// Commented out for 13KB bundle size optimization:
// let lastSpokenTime = 0;
//
// export function speakQuip(text: string, force = false): void {
//   const now = Date.now();
//   if (!force && now - lastSpokenTime < 3200) {
//     return;
//   }
//   lastSpokenTime = now;
//
//   if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
//     try {
//       window.speechSynthesis.cancel();
//       const utterance = new SpeechSynthesisUtterance(text);
//       utterance.lang = 'en-US';
//       utterance.pitch = 1.35;
//       utterance.rate = 1.10;
//       utterance.volume = 0.9;
//       window.speechSynthesis.speak(utterance);
//     } catch (_) {}
//   }
// }

export function getRandomStartQuip(): string {
  return randChoice(UNICORN_START_QUIPS);
}

export function getRandomStabQuip(): string {
  return randChoice(UNICORN_STAB_QUIPS);
}

export function getRandomComboQuip(): string {
  return randChoice(UNICORN_COMBO_QUIPS);
}

export function getRandomDeathQuip(): string {
  return randChoice(UNICORN_DEATH_QUIPS);
}
*/