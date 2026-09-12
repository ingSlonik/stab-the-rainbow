// =============================================================
// Stab the Rainbow - High-Energy Procedural Audio Engine
// Driving gallop beat, rolling synth bass, catchy lead theme,
// and shimmering cloud reverberations ("echo").
// =============================================================

import { GameState } from './types';

const { max, min, pow } = Math;

let audioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let echoBus: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

let isMuted = false;
let sfxMuted = false;

// Audio state tracking
let curGameState: GameState = GameState.MENU;
let curIsGrounded = true;
let musicSpeedMult = 1.0;

// Convert semitone offset from C4 (261.63 Hz)
const semitoneFreq = (semi: number): number => 261.626 * pow(2, semi / 12);

// Web Audio API Compact Helpers (100% identical audio behavior)
const setVal = (p: AudioParam, v: number, t: number) => p.setValueAtTime(v, t);
const rampExp = (p: AudioParam, v: number, t: number) => p.exponentialRampToValueAtTime(v, t);
const rampLin = (p: AudioParam, v: number, t: number) => p.linearRampToValueAtTime(v, t);
const createOsc = (type: OscillatorType, f: number, t: number, dest?: AudioNode): OscillatorNode => {
  const osc = audioCtx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (dest) osc.connect(dest);
  return osc;
};
const createGain = (vol: number, t: number, dest?: AudioNode): GainNode => {
  const g = audioCtx!.createGain();
  g.gain.setValueAtTime(vol, t);
  if (dest) g.connect(dest);
  return g;
};
const createFilter = (type: BiquadFilterType, freq: number, t: number, q?: number, dest?: AudioNode): BiquadFilterNode => {
  const filter = audioCtx!.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (q !== undefined) filter.Q.setValueAtTime(q, t);
  if (dest) filter.connect(dest);
  return filter;
};
// Sdružený helper pro vytvoření a nastavení stereo panoramatu
const createPan = (panVal: number, t: number, dest?: AudioNode): StereoPannerNode => {
  const p = audioCtx!.createStereoPanner();
  p.pan.setValueAtTime(panVal, t);
  if (dest) p.connect(dest);
  return p;
};
const startStop = (n: AudioScheduledSourceNode, t: number, d: number) => {
  n.start(t);
  n.stop(t + d);
};

// 7 Rainbow Chords & Scales (C Lydian/Major: Red, Orange, Yellow, Green, Cyan, Blue, Violet)
// Relative to C4:
const RAINBOW_CHORD_SEMIS: number[][] = [
  [-12, 0, 4, 7, 11],    // 0: Red - C Maj7
  [-10, 2, 6, 9, 14],    // 1: Orange - D9
  [-8, 4, 7, 11, 16],    // 2: Yellow - E min7
  [-7, 5, 9, 12, 17],    // 3: Green - F Maj7
  [-5, 7, 11, 14, 19],   // 4: Cyan - G Maj7
  [-3, 9, 12, 16, 21],   // 5: Blue - A min9
  [-1, 11, 14, 17, 23],  // 6: Violet - B min7b5
];

// -------------------------------------------------------------
// Initialization & Audio Graph
// -------------------------------------------------------------
export function initAudio(): void {
  if (!audioCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (!audioCtx) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  if (!masterGain) {
    const t = audioCtx.currentTime;

    // Master Dynamics Compressor: delivers punchy "grády", glues bass & hooves without clipping
    masterCompressor = audioCtx.createDynamicsCompressor();
    setVal(masterCompressor.threshold, -14, t);
    setVal(masterCompressor.knee, 8, t);
    setVal(masterCompressor.ratio, 5, t);
    setVal(masterCompressor.attack, 0.003, t);
    setVal(masterCompressor.release, 0.12, t);
    masterCompressor.connect(audioCtx.destination);

    masterGain = createGain(0.85, t, masterCompressor);

    // Music Bus
    musicGain = createGain(isMuted ? 0 : 0.42, t, masterGain);

    // SFX Bus
    sfxGain = createGain(sfxMuted ? 0 : 0.65, t, masterGain);

    // Spatial Echo / Reverb Bus ("Dozvuky" for clouds and rainbow stabs)
    initEchoBus();

    // Reusable noise buffer for snares
    if (!noiseBuffer) {
      const sampleRate = audioCtx.sampleRate;
      noiseBuffer = audioCtx.createBuffer(1, Math.floor(sampleRate * 0.2), sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    // Start Procedural Music Sequencer
    startSequencer();
  }
}

function initEchoBus(): void {
  if (!audioCtx || !masterGain) return;

  const t = audioCtx.currentTime;
  echoBus = createGain(isMuted ? 0 : 0.35, t);

  const delayL = audioCtx.createDelay();
  setVal(delayL.delayTime, 0.18, t);

  const delayR = audioCtx.createDelay();
  setVal(delayR.delayTime, 0.27, t);

  const feedback = createGain(0.38, t, delayL);
  const lowpass = createFilter('lowpass', 2400, t);

  const panL = createPan(-0.6, t);
  const panR = createPan(0.6, t);

  // Cross-feedback stereo echo loop
  echoBus.connect(delayL);
  delayL.connect(panL);
  panL.connect(lowpass);

  lowpass.connect(delayR);
  delayR.connect(panR);
  panR.connect(feedback);

  panL.connect(masterGain);
  panR.connect(masterGain);
}

// -------------------------------------------------------------
// Volume & Mute Controls
// -------------------------------------------------------------
export function toggleAudio(): boolean {
  isMuted = !isMuted;
  if (audioCtx && musicGain && echoBus) {
    const t = audioCtx.currentTime;
    musicGain.gain.setTargetAtTime(isMuted ? 0 : 0.42, t, 0.05);
    echoBus.gain.setTargetAtTime(isMuted ? 0 : 0.35, t, 0.05);
  }
  return isMuted;
}

export function toggleSfx(): boolean {
  sfxMuted = !sfxMuted;
  if (audioCtx && sfxGain) {
    sfxGain.gain.setTargetAtTime(sfxMuted ? 0 : 0.65, audioCtx.currentTime, 0.05);
  }
  return sfxMuted;
}

export function getAudioMuted(): boolean {
  return isMuted;
}

export function getSfxMuted(): boolean {
  return sfxMuted;
}

export function setAudioState(state: GameState, isGrounded: boolean, speedMultiplier = 1.0): void {
  curGameState = state;
  curIsGrounded = isGrounded;
  musicSpeedMult = max(0.9, min(1.35, speedMultiplier));
}

// -------------------------------------------------------------
// Synthesizers: Hooves, Kick, Snare, Bass, Arp, Lead
// -------------------------------------------------------------

// 1. Galloping Hoof Impact (Alternating Left/Right Hooves on Crystal Rainbow)
function playHoof(time: number, isLeft: boolean, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  // Clear stereo separation between left and right hooves
  const pan = createPan(isLeft ? -0.28 : 0.28, time, musicGain);
  const hoofGain = createGain(0.9, time, pan);

  // 1. Resonant hollow cavity knock ("clop/klap" - characteristic acoustic body)
  const startF = isLeft ? 500 : 640;
  const endF = isLeft ? 140 : 180;
  const knockGain = createGain(0.75 * intensity, time, hoofGain);
  rampExp(knockGain.gain, 0.0001, time + 0.046);
  // Bandpass filter produces the distinctive wooden / keratin "tok-tok" hollow knock
  const knockFilter = createFilter('bandpass', isLeft ? 520 : 700, time, 4.0, knockGain);
  const knockOsc = createOsc('triangle', startF, time, knockFilter);
  rampExp(knockOsc.frequency, endF, time + 0.04);

  // 2. Crisp crystal / horseshoe contact transient ("clip/cvak" - cuts through the mix)
  const clickGain = createGain(0.28 * intensity, time, hoofGain);
  rampExp(clickGain.gain, 0.0001, time + 0.018);
  const clickOsc = createOsc('square', isLeft ? 1700 : 2200, time, clickGain);
  rampExp(clickOsc.frequency, isLeft ? 650 : 850, time + 0.015);

  // 3. Low-end punch / thud (weight of the hoof landing on the rainbow track)
  const thudGain = createGain(0.52 * intensity, time, hoofGain);
  rampExp(thudGain.gain, 0.0001, time + 0.042);
  const thudOsc = createOsc('sine', 170, time, thudGain);
  rampExp(thudOsc.frequency, 55, time + 0.038);

  // 4. Crisp surface friction noise transient using reusable noiseBuffer
  if (noiseBuffer) {
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = createGain(0.20 * intensity, time, hoofGain);
    rampExp(noiseGain.gain, 0.0001, time + 0.02);
    const noiseFilter = createFilter('bandpass', isLeft ? 2400 : 3100, time, 2.2, noiseGain);
    noise.connect(noiseFilter);

    startStop(noise, time, 0.024);
  }

  startStop(knockOsc, time, 0.05);
  startStop(clickOsc, time, 0.025);
  startStop(thudOsc, time, 0.05);
}

// 2. Punchy Sub Kick (Underpinning heavy lead hoof)
function playKick(time: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const g = createGain(0.55 * intensity, time, musicGain);
  rampExp(g.gain, 0.0001, time + 0.11);
  const osc = createOsc('sine', 140, time, g);
  rampExp(osc.frequency, 42, time + 0.09);

  startStop(osc, time, 0.12);
}

// 3. Crisp Snare / Clap on Backbeats (2 & 4)
function playSnare(time: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted || !noiseBuffer) return;

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;

  const g = createGain(0.32 * intensity, time, musicGain);
  rampExp(g.gain, 0.0001, time + 0.08);
  const filter = createFilter('highpass', 1200, time, undefined, g);
  noise.connect(filter);

  startStop(noise, time, 0.09);
}

// 4. Rolling Synth Bassline (tightly locked with the gallop)
function playBassNote(time: number, semi: number, dur: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const g = createGain(0.36 * intensity, time, musicGain);
  rampExp(g.gain, 0.0001, time + dur);

  // Lowpass filter envelope for pluck attack
  const filter = createFilter('lowpass', 1800 * intensity, time, undefined, g);
  rampExp(filter.frequency, 320, time + dur);

  const osc = createOsc('sawtooth', semitoneFreq(semi), time, filter);

  startStop(osc, time, dur + 0.02);
}

// 5. Sparkling Prismatic Arpeggio (16th notes dancing across rainbow chords)
function playArpNote(time: number, semi: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const g = createGain(0.16 * intensity, time, musicGain);
  rampExp(g.gain, 0.0001, time + 0.085);
  const osc = createOsc('triangle', semitoneFreq(semi), time, g);

  startStop(osc, time, 0.09);
}

// 6. Catchy, Heroic Lead Theme
function playLeadNote(time: number, semi: number, dur: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const g = createGain(0.0001, time, musicGain);
  rampLin(g.gain, 0.24 * intensity, time + 0.025);
  setVal(g.gain, 0.22 * intensity, time + dur - 0.03);
  rampExp(g.gain, 0.0001, time + dur);

  const filter = createFilter('lowpass', 2600, time, undefined, g);

  const f = semitoneFreq(semi);
  const osc1 = createOsc('square', f, time, filter);
  const osc2 = createOsc('sawtooth', f * 1.004, time, filter); // Subtle shimmer detune

  if (echoBus) {
    const echoSend = createGain(0.12 * intensity, time, echoBus);
    g.connect(echoSend);
  }

  startStop(osc1, time, dur + 0.02);
  startStop(osc2, time, dur + 0.02);
}

// -------------------------------------------------------------
// Song Composition & Step Sequencer (8 Bars = 128 16th steps)
// -------------------------------------------------------------

// 8-Bar Chord Roots (in semitones relative to C4):
// Bar 0: C Maj (-12)
// Bar 1: G Maj (-17)
// Bar 2: A min (-15)
// Bar 3: F Maj (-19)
// Bar 4: C Maj (-12)
// Bar 5: G Maj (-17)
// Bar 6: F Maj (-19)
// Bar 7: G Sus4 -> G Maj (-17)
const BAR_ROOTS = [-12, -17, -15, -19, -12, -17, -19, -17];

// Arpeggio patterns for the 8 bars (semi relative to C4):
const cArp = [0, 4, 7, 12, 16, 12, 7, 4];
const gArp = [-1, 2, 7, 11, 14, 11, 7, 2];
const fArp = [-5, -1, 4, 7, 11, 7, 4, -1];
const ARP_CHORDS = [
  cArp,
  gArp,
  [-3, 0, 4, 9, 12, 9, 4, 0],
  fArp,
  cArp,
  gArp,
  fArp,
  [-1, 2, 5, 7, 11, 14, 11, 7],
];

// Lead Melody: [stepIndex, semitone, durationInSteps]
const LEAD_THEME = [
  0, 7, 4, 4, 4, 4, 8, 7, 2, 10, 9, 2, 12, 12, 4, 16, 11, 6, 22, 7, 2, 24, 14, 6,
  32, 12, 4, 36, 9, 4, 40, 4, 2, 42, 7, 2, 44, 9, 4, 48, 17, 4, 52, 16, 4, 56, 14, 4, 60, 12, 4,
  64, 7, 4, 68, 12, 4, 72, 14, 2, 74, 16, 2, 76, 19, 4, 80, 17, 4, 84, 16, 2, 86, 14, 2, 88, 12, 6,
  96, 9, 4, 100, 12, 4, 104, 14, 4, 108, 16, 4, 112, 14, 6, 118, 11, 2, 120, 12, 6,
];

const HOOF_STEPS = [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15];

let sequencerInterval: any = null;
let curStep = 0;
let nextStepTime = 0;

function startSequencer(): void {
  if (sequencerInterval) return;
  nextStepTime = audioCtx!.currentTime + 0.1;

  sequencerInterval = setInterval(() => {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    // Schedule 180ms ahead (rock-solid lookahead)
    while (nextStepTime < now + 0.18) {
      scheduleStep(curStep, nextStepTime);

      // Base tempo 134 BPM; step = 16th note
      const baseStepDur = 60 / (134 * 4);
      const stepDur = baseStepDur / musicSpeedMult;
      nextStepTime += stepDur;
      curStep = (curStep + 1) % 128;
    }
  }, 25);
}

function scheduleStep(step: number, time: number): void {
  const isPlaying = curGameState === GameState.PLAYING;
  const isMenu = curGameState === GameState.MENU;
  const isFalling = curGameState === GameState.FALLING;

  if (isFalling) return; // Music halts dramatically during fall

  const bar = Math.floor(step / 16);
  const stepInBar = step % 16;
  const root = BAR_ROOTS[bar];
  const arpNotes = ARP_CHORDS[bar];

  // -----------------------------------------------------------
  // A. Hoofbeats & Gallop Beat
  // Classic 16th gallop pattern: [1, 0, 1, 1,  1, 0, 1, 1, ...]
  // -----------------------------------------------------------
  const hoofHitIdx = HOOF_STEPS.indexOf(stepInBar);

  if ((isPlaying || isMenu) && hoofHitIdx !== -1) {
    // Alternates Left ("Clop") and Right ("Clip") hooves consistently on every consecutive strike
    const isLeftHoof = hoofHitIdx % 2 === 0;
    // In air (jumping), hooves are silenced for dramatic lift!
    const hoofVol = isPlaying
      ? (curIsGrounded ? (stepInBar % 4 === 0 ? 1.05 : 0.85) : 0.08)
      : 0.58;
    playHoof(time, isLeftHoof, hoofVol);

    if (isPlaying) {
      // Sub kick on beat 1 & 3
      if (stepInBar === 0 || stepInBar === 8) {
        playKick(time, curIsGrounded ? 0.95 : 0.4);
      }
      // Snare / Clap on beat 2 & 4
      if (stepInBar === 4 || stepInBar === 12) {
        playSnare(time, 0.95);
      }
    }
  }

  // -----------------------------------------------------------
  // B. Rolling Synth Bassline (locked into the gallop groove)
  // -----------------------------------------------------------
  if ((isPlaying || isMenu) && hoofHitIdx !== -1) {
    const isOctaveUp = stepInBar % 4 === 3;
    const bassSemi = root + (isOctaveUp ? 12 : 0);
    const intensity = isPlaying ? (stepInBar === 0 || stepInBar === 8 ? 1.0 : 0.75) : 0.4;
    playBassNote(time, bassSemi, 0.09, intensity);
  }

  // -----------------------------------------------------------
  // C. Sparkling Prismatic Arpeggio
  // -----------------------------------------------------------
  const arpSemi = arpNotes[stepInBar % 8] + (stepInBar >= 8 ? 12 : 0);
  const arpIntensity = isPlaying ? 0.8 : 0.45;
  playArpNote(time, arpSemi, arpIntensity);

  // -----------------------------------------------------------
  // D. Catchy Lead Melody
  // -----------------------------------------------------------
  if (isPlaying) {
    for (let i = 0; i < LEAD_THEME.length; i += 3) {
      if (LEAD_THEME[i] === step) {
        playLeadNote(time, LEAD_THEME[i + 1], LEAD_THEME[i + 2] * (60 / (134 * 4)) * 0.92, 1.0);
        break;
      }
    }
  }
}

// -------------------------------------------------------------
// Cloud Sounds: Pure Spatial Reverberations ("echo")
// -------------------------------------------------------------

/**
 * Cloud pass-by echo: gentle spatial resonant chime into the echo bus
 * Only triggers when passing very close, leaving a soft shimmering tail.
 */
export function playCloudEcho(colorIdx: number, panX: number): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const chord = RAINBOW_CHORD_SEMIS[colorIdx] || RAINBOW_CHORD_SEMIS[0];
  const semi = chord[2] + 12;

  // Clear stereo separation in SFX bus + spatial echo tail
  const pan = createPan(max(-0.95, min(0.95, panX)), t, sfxGain);

  const g = createGain(0.0001, t, pan);
  rampLin(g.gain, 0.28, t + 0.03);
  rampExp(g.gain, 0.0001, t + 0.35);

  if (echoBus) g.connect(echoBus);

  const osc = createOsc('triangle', semitoneFreq(semi), t, g);
  startStop(osc, t, 0.38);
}


// -------------------------------------------------------------
// Crisp Sound Effects (SFX)
// -------------------------------------------------------------

/**
 * Cloud Stab SFX: Explosive crystal impact + colorful chord arpeggio
 * that blooms into the spatial echo bus ("dozvuk").
 */
export function playStabSound(colorIdx: number): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const chord = RAINBOW_CHORD_SEMIS[colorIdx] || RAINBOW_CHORD_SEMIS[0];

  // 1. Crystal impact transient
  const clickGain = createGain(0.4, t, sfxGain);
  rampExp(clickGain.gain, 0.001, t + 0.06);
  const click = createOsc('sawtooth', 1400, t, clickGain);
  rampExp(click.frequency, 200, t + 0.05);

  startStop(click, t, 0.07);

  // 2. Multi-octave rainbow shimmer feeding directly into the echo bus!
  chord.forEach((s, idx) => {
    const noteTime = t + idx * 0.032;
    const g = createGain(0.32 / (idx * 0.35 + 1), noteTime, sfxGain!);
    rampExp(g.gain, 0.0001, noteTime + 0.55);
    if (echoBus) g.connect(echoBus); // Blossoms into the spatial echo tail!
    const osc = createOsc(idx % 2 === 0 ? 'triangle' : 'sine', semitoneFreq(s + 24), noteTime, g);

    startStop(osc, noteTime, 0.6);
  });
}

/**
 * Unicorn Jump SFX: Bouncy, energetic upward spring sweep
 */
export function playJumpSound(): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const g = createGain(0.42, t, sfxGain);
  rampExp(g.gain, 0.001, t + 0.2);
  const osc = createOsc('triangle', 240, t, g);
  rampExp(osc.frequency, 680, t + 0.16);

  startStop(osc, t, 0.22);
}

/**
 * Dramatic / Comic Fall SFX: Cartoony slide whistle down
 */
export function playFallSound(): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const g = createGain(0.48, t, sfxGain);
  rampExp(g.gain, 0.001, t + 0.9);

  const filter = createFilter('lowpass', 500, t, undefined, g);
  rampLin(filter.frequency, 120, t + 0.85);

  const osc = createOsc('sawtooth', 320, t, filter);
  rampExp(osc.frequency, 45, t + 0.85);

  startStop(osc, t, 0.95);
}
