export const enum GameState {
  MENU = 0,
  PLAYING = 1,
  FALLING = 2,
  GAMEOVER = 3,
}

export const LANE_COUNT = 7;
export const LANE_WIDTH = 1.1;
export const TRACK_WIDTH = LANE_COUNT * LANE_WIDTH;

// 7 Rainbow Colors: Red, Orange, Yellow, Green, Cyan, Blue, Violet
export const RAINBOW_COLORS = [
  0xff2a4b, // Red
  0xff7b00, // Orange
  0xffdd00, // Yellow
  0x10e052, // Green
  0x00d4ff, // Cyan
  0x3a55ff, // Blue
  0xb82bfb, // Violet
];

export const RAINBOW_HEX_STRINGS = [
  '#ff2a4b',
  '#ff7b00',
  '#ffdd00',
  '#10e052',
  '#00d4ff',
  '#3a55ff',
  '#b82bfb',
];

export const COLOR_NAMES = [
  'Ruby Red',
  'Solar Orange',
  'Cosmic Yellow',
  'Emerald Green',
  'Neon Cyan',
  'Deep Blue',
  'Astral Violet',
];

export interface CloudData {
  mesh: any;
  lane: number;
  colorIdx: number;
  x: number;
  y: number;
  z: number;
  baseY: number;
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  radius: number;
  stabbed: boolean;
  popping: boolean;
  popTimer: number;
  popDuration: number;
  panner?: any;
  gainNode?: any;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}
