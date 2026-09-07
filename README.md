# ✨ Stab the Rainbow 🦄⚡🌈
> *When celestial gallop physics, decaying rainbow highways, cranial cloud-piercing, and an unforgiving 13-kilobyte limit collide.*

[![JS13kGames](https://img.shields.io/badge/JS13kGames-2026%20WebXR-ff0055.svg?style=flat-square)](https://js13kgames.com)
[![Bundle Size](https://img.shields.io/badge/ZIP%20Size-8.38%20KB%20(%E2%89%A413%20KB)-brightgreen.svg?style=flat-square)](#-how-did-this-fit-in-13-kb)
[![Category](https://img.shields.io/badge/Category-WebXR%203D-blueviolet.svg?style=flat-square)](#-webxr--desktop-controls)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 🧐 What is *Stab the Rainbow*?

Legend has it that rainbows don't just hang in the sky indefinitely by pure luck. Every cosmic rainbow highway is maintained by a celestial galloping unicorn equipped with an unusually long, razor-sharp cranial crystal horn.

The problem? **Rainbow roads decay under cosmic entropy.** 

Individual color bands (Ruby Red, Solar Orange, Cosmic Yellow, Emerald Green, Neon Cyan, Deep Blue, and Astral Violet) continuously lose energy, flicker in panic, and completely vanish into the bottomless astral void. If you step on a color band that has vanished... well, let's just say unicorn hooves have zero aerodynamic lift. You plunge into the abyss, and Newton weeps.

To keep the highway intact beneath your hooves, you must **stab oncoming color-coded clouds with your forehead horn**. Stabbing a cloud instantly replenishes that color band back to 100% integrity with a blinding flash of celestial glory!

---

## 🎮 WebXR & Desktop Controls

*Stab the Rainbow* was built from the ground up to feel natural, visceral, and exhilarating both inside an **immersive VR headset** (Meta Quest, Apple Vision Pro, SteamVR) and on a **desktop browser**.

### 🥽 Virtual Reality (WebXR)
- **Aim the Horn:** Move your **HEAD**. Look directly at an oncoming cloud to impale it with your magnificent forehead horn!
- **Steer Across Lanes:** The unicorn's gallop path naturally glides horizontally toward where your gaze is aimed.
- **Jump Over Gaps:** Press any **VR Controller Trigger / Grip** (or tap screen) to leap gracefully over missing void lanes.

### 🖥️ Desktop PC & Mac
- **Aim the Horn:** Move your **MOUSE**. Your view and horn tip track the cursor in real time.
- **Steer Across Lanes:** Mouse horizontal positioning smoothly steers your lane, or use **`A` / `D`** and **`←` / `→` Arrow Keys** for manual lane shifts.
- **Jump Over Gaps:** Press **`SPACEBAR`** or **Left Click** to execute a parabolic leap over empty void lanes.

---

## 🌈 The Rainbow Highway Mechanics

The celestial highway consists of **7 distinct parallel color tracks**:
1. **Ruby Red** (`#ff2a4b`) — Root frequency, deep warmth.
2. **Solar Orange** (`#ff7b00`) — Solar resonance, radiant drive.
3. **Cosmic Yellow** (`#ffdd00`) — Shimmering solar flare.
4. **Emerald Green** (`#10e052`) — Heart of the spectrum, lush balance.
5. **Neon Cyan** (`#00d4ff`) — High-energy stellar sky.
6. **Deep Blue** (`#3a55ff`) — Deep astral midnight.
7. **Astral Violet** (`#b82bfb`) — Ultra-high frequency cosmic edge.

### Highway Decay & Void Survival
- **Energy Drain:** All lanes steadily decay over time. As game speed ramps up, the drain rate accelerates.
- **Urgent Danger Alerts:** The highway AI dynamically picks an urgent target lane that drains three times as fast, challenging you to locate and hunt down that specific cloud color!
- **Warning Flicker:** When a lane's energy drops below **32%**, its surface begins oscillating rapidly between translucent and opaque.
- **The Void:** When energy hits **0%**, the lane completely dissolves. If you are grounded and standing on that lane, you enter a hilarious tumbling freefall through space!
- **Leaping:** While airborne during a jump, void lanes cannot drag you down. Time your jumps precisely to leap across missing color bands!

---

## 🎵 Generative Ezo-Ambient Soundscape (Web Audio API)

There are **strictly zero MP3, OGG, or WAV audio files** bundled with this game. The entire acoustic world is synthesized purely in real time using the **Web Audio API** in roughly ~2 KB of code:

### 1. The Lydian Meditation Drone
A deep, warming quad-voice tonic drone rooted in $C_2$ ($65.4\text{ Hz}$), $G_2$, $D_3$, and $E_3$. Each voice is filtered through an independent resonant low-pass biquad filter with subtle detuning, creating a slow, hypnotic, meditative shimmer.

### 2. Spatial 3D Cloud Chords (Living Generative Music)
Every approaching cloud is its own acoustic sound source!
- The 7 cloud colors correspond to **7 harmonically locked chords in C Lydian / Pentatonic space**:
  - **Red:** $C\text{ Maj}^7$
  - **Orange:** $D^9$
  - **Yellow:** $E\text{ min}^7$
  - **Green:** $F^\sharp\text{ dim} / F\text{ Lydian}$
  - **Cyan:** $G\text{ Maj}^7$
  - **Blue:** $A\text{ min}^9$
  - **Violet:** $B\text{ min}^{7\flat 5}$
- **Real-time 3D Stereo Panning:** As a cloud drifts from left to right across the tracks, a `StereoPannerNode` maps its $X$ coordinate smoothly across the stereo field.
- **Distance-Based Gain Attenuation:** Faraway clouds whisper softly in the distance; as they hurtle toward your horn, their harmonic chord swells in volume, harmonizing seamlessly with all other approaching clouds into an evolving generative symphony.

### 3. Crystalline SFX
- **Horn Stab:** Rapid 5-tone ascending crystal chime arpeggio with exponential gain decay.
- **Jump Whoosh:** Resonant upward sine frequency glide from $260\text{ Hz} \to 620\text{ Hz}$.
- **Void Fall:** Comical descending sawtooth wobble with biquad filter decay as the unicorn plunges into starlight.

---

## 📐 Unified 3D World-Space Canvas UI

Instead of wrestling with 2D DOM elements that break or vanish when entering WebXR immersion, *Stab the Rainbow* renders its entire user interface directly onto dynamic **Three.js CanvasTextures** in 3D world space:
- **Title Screen:** Runs over a live attract-mode demo of the unicorn galloping across the stars.
- **Persistent High Scores:** Stored cleanly in `localStorage`.
- **Interactive 3D Buttons:** Clickable on Desktop via raycasting, and triggerable in VR via controller triggers or head reticle gaze.
- **Audio Toggles:** Independent mute toggles for ambient music and sound effects.
- **In-Game HUD:** Floating overhead display featuring current score, dynamic danger alerts (`⚡ SAVE CYAN!`), and 7 mini color gem health gauges.
- **Game Over Screen:** Featuring final score, high score tracking, and a random humorous death quote selected from the *Unicorn Post-Mortem Anthology*.

---

## 🗜️ How Did This Fit in 13 KB?

The game source is written in clean, modular TypeScript. The production build pipeline compresses everything down to **under 8.4 KB (ZIP)**:

| Pipeline Step | Tool | Output Size | Notes |
| :--- | :--- | :--- | :--- |
| **1. Bundle** | `esbuild` | ~26.1 KB | Single IIFE bundle with tree-shaking |
| **2. Minify** | `terser` | ~25.4 KB | 15 passes, unsafe math, pure getters, toplevel mangling |
| **3. CSS Minify** | `csso` | ~0.32 KB | Structural CSS cleanup |
| **4. Crush** | `roadroller` | ~10.1 KB | Context modeling & LZ entropy crusher |
| **5. HTML Pack** | `build.ts` | ~10.9 KB | Inline script wrapper with CORS-resilient ESM loader |
| **6. ZIP** | `ect -9 -strip` | **8,379 bytes** | **62.9% of limit (4,933 bytes remaining!)** |

### External WebXR Library Rule
In strict compliance with the **js13kGames WebXR category rules**, Three.js r185 ESM is imported externally from `https://play.js13kgames.com/2026/webxr/three.js` (with an automatic fallback to local `./three.js` to ensure zero CORS headaches when testing on `localhost` or offline). Three.js itself is **not bundled inside the ZIP archive**, keeping the competition zip payload strictly under 13,312 bytes.

---

## 🚀 Development & Build

### Prerequisites
- Node.js $\ge 20$
- npm

### Commands
```bash
# Start local development server with hot-reload
npm run dev

# Run TypeScript typechecker (strict mode)
npm run typecheck

# Run production build and generate dist/stab-the-rainbow.zip
npm run build
```

---

## 🦄 Credits & License

- **Author:** Filip Paulů — [paulu.cz](https://paulu.cz/)
- **Engine:** Three.js r185 (ESM)
- **Competition:** js13kGames 2026 (WebXR Category)
- **License:** MIT
