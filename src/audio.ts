// =============================================================
// Stab the Rainbow - High-Energy Procedural Audio Engine
// Driving gallop beat, rolling synth bass, catchy lead theme,
// and shimmering cloud reverberations ("dozvuky").
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
    masterCompressor.threshold.setValueAtTime(-14, t);
    masterCompressor.knee.setValueAtTime(8, t);
    masterCompressor.ratio.setValueAtTime(5, t);
    masterCompressor.attack.setValueAtTime(0.003, t);
    masterCompressor.release.setValueAtTime(0.12, t);
    masterCompressor.connect(audioCtx.destination);

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.85, t);
    masterGain.connect(masterCompressor);

    // Music Bus
    musicGain = audioCtx.createGain();
    musicGain.gain.setValueAtTime(isMuted ? 0 : 0.42, t);
    musicGain.connect(masterGain);

    // SFX Bus
    sfxGain = audioCtx.createGain();
    sfxGain.gain.setValueAtTime(sfxMuted ? 0 : 0.65, t);
    sfxGain.connect(masterGain);

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

  echoBus = audioCtx.createGain();
  echoBus.gain.setValueAtTime(isMuted ? 0 : 0.35, audioCtx.currentTime);

  const delayL = audioCtx.createDelay();
  delayL.delayTime.setValueAtTime(0.18, audioCtx.currentTime);

  const delayR = audioCtx.createDelay();
  delayR.delayTime.setValueAtTime(0.27, audioCtx.currentTime);

  const feedback = audioCtx.createGain();
  feedback.gain.setValueAtTime(0.38, audioCtx.currentTime);

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(2400, audioCtx.currentTime);

  const panL = audioCtx.createStereoPanner();
  panL.pan.setValueAtTime(-0.6, audioCtx.currentTime);

  const panR = audioCtx.createStereoPanner();
  panR.pan.setValueAtTime(0.6, audioCtx.currentTime);

  // Cross-feedback stereo echo loop
  echoBus.connect(delayL);
  delayL.connect(panL);
  panL.connect(lowpass);

  lowpass.connect(delayR);
  delayR.connect(panR);
  panR.connect(feedback);
  feedback.connect(delayL);

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

  const hoofGain = audioCtx.createGain();
  const pan = audioCtx.createStereoPanner();
  // Clear stereo separation between left and right hooves
  pan.pan.setValueAtTime(isLeft ? -0.28 : 0.28, time);

  // 1. Resonant hollow cavity knock ("clop/klap" - characteristic acoustic body)
  const knockOsc = audioCtx.createOscillator();
  const knockFilter = audioCtx.createBiquadFilter();
  const knockGain = audioCtx.createGain();

  knockOsc.type = 'triangle';
  const startF = isLeft ? 500 : 640;
  const endF = isLeft ? 140 : 180;
  knockOsc.frequency.setValueAtTime(startF, time);
  knockOsc.frequency.exponentialRampToValueAtTime(endF, time + 0.04);

  // Bandpass filter produces the distinctive wooden / keratin "tok-tok" hollow knock
  knockFilter.type = 'bandpass';
  knockFilter.frequency.setValueAtTime(isLeft ? 520 : 700, time);
  knockFilter.Q.setValueAtTime(4.0, time);

  knockGain.gain.setValueAtTime(0.75 * intensity, time);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.046);

  knockOsc.connect(knockFilter);
  knockFilter.connect(knockGain);
  knockGain.connect(hoofGain);

  // 2. Crisp crystal / horseshoe contact transient ("clip/cvak" - cuts through the mix)
  const clickOsc = audioCtx.createOscillator();
  const clickGain = audioCtx.createGain();
  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(isLeft ? 1700 : 2200, time);
  clickOsc.frequency.exponentialRampToValueAtTime(isLeft ? 650 : 850, time + 0.015);

  clickGain.gain.setValueAtTime(0.28 * intensity, time);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);

  clickOsc.connect(clickGain);
  clickGain.connect(hoofGain);

  // 3. Low-end punch / thud (weight of the hoof landing on the rainbow track)
  const thudOsc = audioCtx.createOscillator();
  const thudGain = audioCtx.createGain();
  thudOsc.type = 'sine';
  thudOsc.frequency.setValueAtTime(170, time);
  thudOsc.frequency.exponentialRampToValueAtTime(55, time + 0.038);

  thudGain.gain.setValueAtTime(0.52 * intensity, time);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.042);

  thudOsc.connect(thudGain);
  thudGain.connect(hoofGain);

  // 4. Crisp surface friction noise transient using reusable noiseBuffer
  if (noiseBuffer) {
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(isLeft ? 2400 : 3100, time);
    noiseFilter.Q.setValueAtTime(2.2, time);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.20 * intensity, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(hoofGain);

    noise.start(time);
    noise.stop(time + 0.024);
  }

  hoofGain.gain.setValueAtTime(0.9, time);
  hoofGain.connect(pan);
  pan.connect(musicGain);

  knockOsc.start(time);
  knockOsc.stop(time + 0.05);
  clickOsc.start(time);
  clickOsc.stop(time + 0.025);
  thudOsc.start(time);
  thudOsc.stop(time + 0.05);
}

// 2. Punchy Sub Kick (Underpinning heavy lead hoof)
function playKick(time: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);

  g.gain.setValueAtTime(0.55 * intensity, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);

  osc.connect(g);
  g.connect(musicGain);
  osc.start(time);
  osc.stop(time + 0.12);
}

// 3. Crisp Snare / Clap on Backbeats (2 & 4)
function playSnare(time: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted || !noiseBuffer) return;

  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1200, time);

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.32 * intensity, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

  noise.connect(filter);
  filter.connect(g);
  g.connect(musicGain);

  noise.start(time);
  noise.stop(time + 0.09);
}

// 4. Rolling Synth Bassline (tightly locked with the gallop)
function playBassNote(time: number, semi: number, dur: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();

  osc.type = 'sawtooth';
  const f = semitoneFreq(semi);
  osc.frequency.setValueAtTime(f, time);

  // Lowpass filter envelope for pluck attack
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800 * intensity, time);
  filter.frequency.exponentialRampToValueAtTime(320, time + dur);

  g.gain.setValueAtTime(0.36 * intensity, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  osc.connect(filter);
  filter.connect(g);
  g.connect(musicGain);

  osc.start(time);
  osc.stop(time + dur + 0.02);
}

// 5. Sparkling Prismatic Arpeggio (16th notes dancing across rainbow chords)
function playArpNote(time: number, semi: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(semitoneFreq(semi), time);

  g.gain.setValueAtTime(0.16 * intensity, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.085);

  osc.connect(g);
  g.connect(musicGain);

  osc.start(time);
  osc.stop(time + 0.09);
}

// 6. Catchy, Heroic Lead Theme
function playLeadNote(time: number, semi: number, dur: number, intensity: number): void {
  if (!audioCtx || !musicGain || isMuted) return;

  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();

  osc1.type = 'square';
  osc2.type = 'sawtooth';

  const f = semitoneFreq(semi);
  osc1.frequency.setValueAtTime(f, time);
  osc2.frequency.setValueAtTime(f * 1.004, time); // Subtle shimmer detune

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, time);

  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.24 * intensity, time + 0.025);
  g.gain.setValueAtTime(0.22 * intensity, time + dur - 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(g);
  g.connect(musicGain);

  if (echoBus) {
    const echoSend = audioCtx.createGain();
    echoSend.gain.setValueAtTime(0.12 * intensity, time);
    g.connect(echoSend);
    echoSend.connect(echoBus);
  }

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + dur + 0.02);
  osc2.stop(time + dur + 0.02);
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
const ARP_CHORDS = [
  [0, 4, 7, 12, 16, 12, 7, 4],   // C Maj
  [-1, 2, 7, 11, 14, 11, 7, 2],  // G Maj
  [-3, 0, 4, 9, 12, 9, 4, 0],    // A min
  [-5, -1, 4, 7, 11, 7, 4, -1],  // F Maj
  [0, 4, 7, 12, 16, 12, 7, 4],   // C Maj
  [-1, 2, 7, 11, 14, 11, 7, 2],  // G Maj
  [-5, -1, 4, 7, 11, 7, 4, -1],  // F Maj
  [-1, 2, 5, 7, 11, 14, 11, 7],  // G Sus
];

// Lead Melody: [stepIndex, semitone, durationInSteps]
const LEAD_THEME: [number, number, number][] = [
  // Phrase 1 (Bars 0-1): Triumphant rise
  [0, 7, 4],    // G4
  [4, 4, 4],    // E4
  [8, 7, 2],    // G4
  [10, 9, 2],   // A4
  [12, 12, 4],  // C5
  [16, 11, 6],  // B4
  [22, 7, 2],   // G4
  [24, 14, 6],  // D5

  // Phrase 2 (Bars 2-3): Energetic roll
  [32, 12, 4],  // C5
  [36, 9, 4],   // A4
  [40, 4, 2],   // E4
  [42, 7, 2],   // G4
  [44, 9, 4],   // A4
  [48, 17, 4],  // F5
  [52, 16, 4],  // E5
  [56, 14, 4],  // D5
  [60, 12, 4],  // C5

  // Phrase 3 (Bars 4-5): Soaring rainbow climax
  [64, 7, 4],   // G4
  [68, 12, 4],  // C5
  [72, 14, 2],  // D5
  [74, 16, 2],  // E5
  [76, 19, 4],  // G5
  [80, 17, 4],  // F5
  [84, 16, 2],  // E5
  [86, 14, 2],  // D5
  [88, 12, 6],  // C5

  // Phrase 4 (Bars 6-7): Uplifting turnaround hook
  [96, 9, 4],    // A4
  [100, 12, 4],  // C5
  [104, 14, 4],  // D5
  [108, 16, 4],  // E5
  [112, 14, 6],  // D5
  [118, 11, 2],  // B4
  [120, 12, 6],  // C5
];

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
  const HOOF_STEPS = [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15];
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
  if (isPlaying || isMenu) {
    const isBassStep = [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15].includes(stepInBar);
    if (isBassStep) {
      const isOctaveUp = stepInBar === 3 || stepInBar === 7 || stepInBar === 11 || stepInBar === 15;
      const bassSemi = root + (isOctaveUp ? 12 : 0);
      const intensity = isPlaying ? (stepInBar === 0 || stepInBar === 8 ? 1.0 : 0.75) : 0.4;
      playBassNote(time, bassSemi, 0.09, intensity);
    }
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
    const leadEntry = LEAD_THEME.find(([s]) => s === step);
    if (leadEntry) {
      const [, semi, durSteps] = leadEntry;
      const durSec = durSteps * (60 / (134 * 4)) * 0.92;
      playLeadNote(time, semi, durSec, 1.0);
    }
  }
}

// -------------------------------------------------------------
// Cloud Sounds: Pure Spatial Reverberations ("Dozvuky")
// -------------------------------------------------------------

/**
 * Cloud pass-by echo: gentle spatial resonant chime into the echo bus
 * Only triggers when passing very close, leaving a soft shimmering tail.
 */
export function playCloudEcho(colorIdx: number, panX: number, intensity = 0.22): void {
  if (!audioCtx || !echoBus || isMuted) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const pan = audioCtx.createStereoPanner();
  const g = audioCtx.createGain();

  const chord = RAINBOW_CHORD_SEMIS[colorIdx] || RAINBOW_CHORD_SEMIS[0];
  const semi = chord[2] + 12; // Shimmering harmonic chime

  osc.type = 'sine';
  osc.frequency.setValueAtTime(semitoneFreq(semi), t);

  pan.pan.setValueAtTime(max(-0.95, min(0.95, panX)), t);

  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.2 * intensity, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

  osc.connect(g);
  g.connect(pan);
  pan.connect(echoBus); // Feeds directly into the stereo delay reverb tail!

  osc.start(t);
  osc.stop(t + 0.5);
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
  const click = audioCtx.createOscillator();
  const clickGain = audioCtx.createGain();
  click.type = 'sawtooth';
  click.frequency.setValueAtTime(1400, t);
  click.frequency.exponentialRampToValueAtTime(200, t + 0.05);

  clickGain.gain.setValueAtTime(0.4, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  click.connect(clickGain);
  clickGain.connect(sfxGain);
  click.start(t);
  click.stop(t + 0.07);

  // 2. Multi-octave rainbow shimmer feeding directly into the echo bus!
  chord.forEach((s, idx) => {
    const noteTime = t + idx * 0.032;
    const osc = audioCtx!.createOscillator();
    const g = audioCtx!.createGain();

    osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(semitoneFreq(s + 24), noteTime);

    g.gain.setValueAtTime(0.32 / (idx * 0.35 + 1), noteTime);
    g.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.55);

    osc.connect(g);
    g.connect(sfxGain!);
    if (echoBus) g.connect(echoBus); // Blossoms into the spatial echo tail!

    osc.start(noteTime);
    osc.stop(noteTime + 0.6);
  });
}

/**
 * Unicorn Jump SFX: Bouncy, energetic upward spring sweep
 */
export function playJumpSound(): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(240, t);
  osc.frequency.exponentialRampToValueAtTime(680, t + 0.16);

  g.gain.setValueAtTime(0.42, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t);
  osc.stop(t + 0.22);
}

/**
 * Dramatic / Comic Fall SFX: Cartoony slide whistle down
 */
export function playFallSound(): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.85);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.linearRampToValueAtTime(120, t + 0.85);

  g.gain.setValueAtTime(0.48, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

  osc.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);

  osc.start(t);
  osc.stop(t + 0.95);
}
