export const enum GameState {
  MENU = 0,
  PLAYING = 1,
  FALLING = 2,
  GAMEOVER = 3,
}

export const enum GameMode {
  DESKTOP = 0,
  VR_EASY = 1,
  VR_HARD = 2,
}

export const LANE_COUNT = 7;
export const LANE_WIDTH = 0.40;
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

// 13KB bundle optimization: Unused color string constants commented out (saved for reference)
/*
export const RAINBOW_HEX_STRINGS = [
  '#ff2a4b',
  '#ff7b00',
  '#ffdd00',
  '#10e052',
  '#00d4ff',
  '#3a55ff',
  '#b82bfb',
];

export const COLOR_NAMES_EN = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Cyan',
  'Blue',
  'Violet',
];
*/

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
  missTriggered?: boolean;
  echoed?: boolean;
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
