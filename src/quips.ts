import { randChoice } from './math';

export const UNICORN_START_QUIPS = [
  'Hlava vpřed, rohy nabrousit!',
  'Maká celé tělo!',
];

export const UNICORN_STAB_QUIPS = [
  'Trk!',
  'Trefa!',
  'Prásk!',
];

export const UNICORN_COMBO_QUIPS = [
  'Duhové kombo!',
  'Magie!',
];

export const UNICORN_DEATH_QUIPS = [
  'Gravitace: 1, Ty: 0.',
  'Pád do propasti!',
];

let lastSpokenTime = 0;

export function speakQuip(text: string, force = false): void {
  const now = Date.now();
  if (!force && now - lastSpokenTime < 3200) {
    return;
  }
  lastSpokenTime = now;

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'cs-CZ';
      utterance.pitch = 1.35;
      utterance.rate = 1.10;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  }
}

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
