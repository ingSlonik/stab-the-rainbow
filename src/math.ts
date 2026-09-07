export const { sin, cos, max, min, floor, abs, random, pow, sqrt, PI } = Math;

export const PI2 = PI * 2;
export const HALF_PI = PI / 2;

export const clamp = (v: number, lo: number, hi: number): number => max(lo, min(hi, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const randRange = (lo: number, hi: number): number => lo + random() * (hi - lo);

export const randChoice = <T>(arr: T[]): T => arr[floor(random() * arr.length)];
