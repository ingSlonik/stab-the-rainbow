import { randChoice } from './math';

export const UNICORN_START_QUIPS = [
  'Zapomeň na ruce! Teď jsi plnokrevný jednorožec!',
  'Pohni zadkem a zatřes hřívou!',
  'Varování: Sousedé si budou myslet, že v obýváku cvičíš rituální tanec.',
  'Hlava vpřed, rohy nabrousit a žádné slitování s mraky!',
  'Pravidlo číslo jedna: Pořádně se do toho opři čelem!',
  'Dneska žádné mačkání tlačítek. Dneska maká tělo!',
];

export const UNICORN_STAB_QUIPS = [
  'Baf! Takhle se trkají mraky!',
  'Mňam! Cukrová vata s příchutí blesku!',
  'Moje hříva je dnes naprosto dokonalá!',
  'Bodni ho do břicha!',
  '10 z 10 za aerodynamiku rohu!',
  'Trefa přímo na komoru!',
  'Kdo je tady král duhy? Ty!',
  'Krk tě možná bolí, ale styl máš božský!',
  'Prásk! Duha je zachráněna!',
  'Takhle se to dělá ve vysoké společnosti jednorožců!',
];

export const UNICORN_COMBO_QUIPS = [
  'Duhové kombo! Jsi nezastavitelný trkací stroj!',
  'Magie na maximum! Jen tak dál!',
  'Rychleji, než stíhá duha schnout!',
  'Extatický cval! Pozor na strop!',
];

export const UNICORN_DEATH_QUIPS = [
  'Jednorožec sice neumí létat, ale padat mu jde skvěle!',
  'Gravitace: 1, Tvoje krční páteř: 0.',
  'Příště víc trhni hlavou, ne nohama o konferenční stolek!',
  'Alespoň jsi v tom headsetu spálil pár kalorií.',
  'Zavolejte fyzioterapeuta, jednorožec zahučel do propasti!',
  'Rainbow out of order. Zkus to znova a s větším nasazením!',
];

let lastSpokenTime = 0;

export function speakQuip(text: string, force = false): void {
  const now = Date.now();
  if (!force && now - lastSpokenTime < 3200) {
    return; // Zabránění překrývání řeči
  }
  lastSpokenTime = now;

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'cs-CZ';
      utterance.pitch = 1.35; // Vyšší, energický a hravý hlas jednorožce
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
