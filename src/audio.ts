const { sin, cos, max, min, pow } = Math;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let droneGain: GainNode | null = null;
let cloudsGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

let isMuted = false;
let sfxMuted = false;

// Convert semitones from A4 (440Hz)
const freq = (semi: number) => 440 * pow(2, (semi - 9) / 12);

// 7 Chords in C Lydian (harmonious, uplifting, ethereal ezo mood)
// Semi relative to C4 (0 = C4, 2 = D4, 4 = E4, 5 = F4, 6 = F#4, 7 = G4, 9 = A4, 11 = B4, 12 = C5...)
const COLOR_CHORD_SEMIS = [
  [-12, 0, 4, 7, 11],     // 0: Red - C Maj7
  [-10, 2, 6, 9, 14],     // 1: Orange - D9
  [-8, 4, 7, 11, 16],     // 2: Yellow - E min7
  [-7, 5, 9, 12, 18],     // 3: Green - F# dim / F Lydian
  [-5, 7, 11, 14, 19],    // 4: Cyan - G Maj7
  [-3, 9, 12, 16, 21],    // 5: Blue - A min9
  [-1, 11, 14, 18, 23],   // 6: Violet - B min7b5
];

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
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.8, t);
    masterGain.connect(audioCtx.destination);

    // Drone bus
    droneGain = audioCtx.createGain();
    droneGain.gain.setValueAtTime(isMuted ? 0 : 0.25, t);
    droneGain.connect(masterGain);

    // Clouds spatial bus
    cloudsGain = audioCtx.createGain();
    cloudsGain.gain.setValueAtTime(isMuted ? 0 : 0.35, t);
    cloudsGain.connect(masterGain);

    // SFX bus
    sfxGain = audioCtx.createGain();
    sfxGain.gain.setValueAtTime(sfxMuted ? 0 : 0.6, t);
    sfxGain.connect(masterGain);

    startDrone();
  }
}

function startDrone(): void {
  if (!audioCtx || !droneGain) return;
  const t = audioCtx.currentTime;

  // Root Lydian drone notes (C2, G2, D3, E3)
  const droneNotes = [65.4, 98.0, 146.8, 164.8];
  droneNotes.forEach((f, i) => {
    const osc = audioCtx!.createOscillator();
    const g = audioCtx!.createGain();
    const filter = audioCtx!.createBiquadFilter();

    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(f, t);

    // Subtle detune for shimmer
    osc.detune.setValueAtTime((i - 1.5) * 4, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320 + i * 50, t);

    g.gain.setValueAtTime(0.2 / (i + 1), t);

    osc.connect(filter);
    filter.connect(g);
    g.connect(droneGain!);
    osc.start(t);
  });
}

export function toggleAudio(): boolean {
  isMuted = !isMuted;
  if (audioCtx && droneGain && cloudsGain) {
    const t = audioCtx.currentTime;
    droneGain.gain.setTargetAtTime(isMuted ? 0 : 0.25, t, 0.05);
    cloudsGain.gain.setTargetAtTime(isMuted ? 0 : 0.35, t, 0.05);
  }
  return isMuted;
}

export function toggleSfx(): boolean {
  sfxMuted = !sfxMuted;
  if (audioCtx && sfxGain) {
    sfxGain.gain.setTargetAtTime(sfxMuted ? 0 : 0.6, audioCtx.currentTime, 0.05);
  }
  return sfxMuted;
}

export function getAudioMuted(): boolean {
  return isMuted;
}

export function getSfxMuted(): boolean {
  return sfxMuted;
}

// -------------------------------------------------------------
// Cloud Spatial Audio Voice
// -------------------------------------------------------------
export interface CloudAudioVoice {
  panner: StereoPannerNode;
  gain: GainNode;
  oscs: OscillatorNode[];
  colorIdx: number;
}

export function createCloudVoice(colorIdx: number): CloudAudioVoice | null {
  if (!audioCtx || !cloudsGain) return null;

  const t = audioCtx.currentTime;
  const panner = audioCtx.createStereoPanner();
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, t);

  gain.connect(panner);
  panner.connect(cloudsGain);

  const semis = COLOR_CHORD_SEMIS[colorIdx] || COLOR_CHORD_SEMIS[0];
  const oscs: OscillatorNode[] = [];

  // Pick 3 harmonic tones for ambient cloud voice
  [semis[0] + 12, semis[2] + 12, semis[3] + 12].forEach((s) => {
    const o = audioCtx!.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq(s), t);
    o.connect(gain);
    o.start(t);
    oscs.push(o);
  });

  return { panner, gain, oscs, colorIdx };
}

export function updateCloudVoice(
  voice: CloudAudioVoice | null,
  x: number,
  z: number
): void {
  if (!voice || !audioCtx) return;

  const t = audioCtx.currentTime;
  // Stereo pan based on horizontal X position (-3.5 to 3.5 -> -0.9 to 0.9)
  const panVal = max(-0.95, min(0.95, x / 4));
  voice.panner.pan.setTargetAtTime(panVal, t, 0.08);

  // Distance along -Z towards player at z = 0
  const dist = max(0, -z);
  let vol = 0;
  if (dist < 45 && dist > 1) {
    // Closer = louder, peaking around dist = 5-10
    const norm = 1 - (dist - 1) / 44;
    vol = pow(norm, 1.8) * 0.22;
  }
  voice.gain.gain.setTargetAtTime(vol, t, 0.08);
}

export function stopCloudVoice(voice: CloudAudioVoice | null): void {
  if (!voice || !audioCtx) return;
  const t = audioCtx.currentTime;
  voice.gain.gain.setTargetAtTime(0, t, 0.05);
  setTimeout(() => {
    voice.oscs.forEach((o) => {
      try {
        o.stop();
        o.disconnect();
      } catch (_) {}
    });
    try {
      voice.gain.disconnect();
      voice.panner.disconnect();
    } catch (_) {}
  }, 100);
}

// -------------------------------------------------------------
// Sound Effects
// -------------------------------------------------------------
export function playStabSound(colorIdx: number): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const semis = COLOR_CHORD_SEMIS[colorIdx] || COLOR_CHORD_SEMIS[0];

  // Shimmering arpeggio
  semis.forEach((s, idx) => {
    const noteTime = t + idx * 0.045;
    const osc = audioCtx!.createOscillator();
    const g = audioCtx!.createGain();

    osc.type = idx === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq(s + 24), noteTime);

    g.gain.setValueAtTime(0.35 / (idx * 0.4 + 1), noteTime);
    g.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.6);

    osc.connect(g);
    g.connect(sfxGain!);
    osc.start(noteTime);
    osc.stop(noteTime + 0.65);
  });
}

export function playJumpSound(): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(260, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.18);

  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t);
  osc.stop(t + 0.25);
}

export function playFallSound(): void {
  if (!audioCtx || !sfxGain || sfxMuted) return;

  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  osc.type = 'sawtooth';
  // Comical downward slide
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.9);

  // Soft lowpass filter to keep it warm and funny
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.linearRampToValueAtTime(120, t + 0.9);

  g.gain.setValueAtTime(0.45, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

  osc.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);
  osc.start(t);
  osc.stop(t + 1.05);
}
