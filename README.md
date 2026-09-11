# ✨ Stab the Rainbow 🦄⚡🌈
> *A high-speed cosmic gallop simulator where you physically embody a galloping unicorn, headbutt decaying starlight clouds with a crystal forehead horn, and desperately prevent a 7-lane celestial highway from collapsing into the void — handcrafted in 13 KB for js13kGames 2026.*

[![JS13kGames](https://img.shields.io/badge/JS13kGames-2026%20WebXR-ff0055.svg?style=flat-square)](https://js13kgames.com)
[![Bundle Size](https://img.shields.io/badge/ZIP%20Size-12.94%20KB%20(%E2%89%A413%20KB)-brightgreen.svg?style=flat-square)](#-how-did-this-fit-in-13-kb)
[![Category](https://img.shields.io/badge/Category-WebXR%203D-blueviolet.svg?style=flat-square)](#-webxr-embodiment--controls)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 🧐 What is *Stab the Rainbow*?

Legend has it that cosmic rainbows don't just hang gracefully in deep space through good vibes alone. Every interstellar rainbow highway is maintained by an unsung hero: a celestial galloping unicorn equipped with a razor-sharp cranial crystal horn.

The catch? **Cosmic entropy is relentless.**

The highway is split into 7 parallel spectral bands. Every single second, each lane continuously bleeds radiant energy. When a lane's energy drops below 32%, it flickers in sheer panic. When it hits 0%, it completely dissolves into the pitch-black astral abyss. 

And if you step on a dissolved lane? Well, unicorn hooves generate exactly zero aerodynamic lift. You plunge headlong into the bottomless void, Isaac Newton weeps, and your run comes to a comical, tumbling halt.

To keep the road solid beneath your hooves, you must **stab oncoming color-coded clouds with your crystal horn**. Impaling a cloud triggers a blinding celestial flash, showers the cosmos in 200 sparkling starburst particles, cranks up your combo multiplier, and instantly restores that lane back to **100% integrity**!

---

## 🥽 WebXR Embodiment: Becoming the Unicorn

> *"This game was crafted primarily for WebXR VR headsets, giving you the authentic, embodied feeling of being a galloping unicorn! You can play on desktop, but you will miss out on the magical sensation of physically being the unicorn."*

While *Stab the Rainbow* runs smoothly on a flat desktop monitor, playing it on a flat screen is like eating birthday cake through a telescope. 

The true soul of the game lies inside an **immersive WebXR VR headset** (Meta Quest 2/3/Pro, Apple Vision Pro, SteamVR). It is a glorious study in physical comedy: to an outside observer (your family, your roommates, or your deeply bewildered cat), you are a grown human wearing a plastic toaster on your face, frantically side-stepping across the living room carpet, aggressively nodding and headbutting invisible space clouds, and leaping into the air to clear missing celestial highway bands.

---

## 🎮 Game Modes & Controls

### 🦄 VR Hard Mode: *"YOU ARE THE UNICORN!"* (The Full Experience)
This is the way the cosmos intended. In Hard Mode, the crystal horn is mounted **directly on your forehead**:

- **Steer Across Lanes:** Take **real physical side-steps** or lean your body laterally across your room! Room-scale movement is tracked in real-time and amplified ($3\times$) so you can comfortably dance across the entire 2.8-meter rainbow.
- **Stab Clouds:** **Furious Headbutts & Sharp Nods!** Thrust your head forward or nod sharply down to impale oncoming clouds. You can also simply ram your cranial horn directly into clouds at full gallop!
- **Jump Over Gaps:** **Real Physical Leaps!** Vertically leap into the air in your living room ($\text{headVelY} > 0.70$) to jump over missing void lanes. (Controller **Grip** works as a couch-friendly backup).
- **Restart Run:** A quick, confident nod of your head on the Game Over screen instantly starts a fresh gallop.
- **Main Menu:** Press **A** or **B** (or **X** / **Y**) on either VR controller at any time to return home.

---

### 🤺 VR Easy Mode: *"Unicorn Rider"*
Prefer a slightly more civil fencing match with the cosmos?

- **Aim the Horn:** The crystal horn is held directly in your **right hand controller**. Point the starlight beam and aim precisely like a celestial rapier.
- **Stab Clouds:** Pull the **Right Controller Trigger** (or select button).
- **Jump Over Gaps:** Squeeze any **VR Controller Grip**.
- **Steer Across Lanes:** Physical side-steps and body leaning still guide your path along the rainbow.
- **Main Menu:** Press **A** or **B** on your controller.

---

### 💻 Desktop Mode: *"The Safe Option"*
For those who must gallop without knocking over the living room lamp:

- **Steer Across Lanes:** Move your **MOUSE** horizontally. The unicorn smoothly tracks your cursor across the 7 lanes.
- **Stab Clouds:** **Left Click** (or tap on touchscreen mobile devices).
- **Jump Over Gaps:** **Right Click**, **Middle Click**, or scroll your **Mouse Wheel**.
- **Shortcuts:** **`F`** (Fullscreen), **`M`** (Mute/Unmute Music), **`N`** (Mute/Unmute SFX), **`H`** or **`ESC`** (Return to Menu).

---

## 🌈 The Rainbow Highway & Scoring

### 1. The 7 Spectral Bands
| # | Lane | Hex Code | Harmonic Frequency |
| :-: | :--- | :---: | :--- |
| **0** | **Ruby Red** | `#ff2a4b` | Root resonance, foundation band ($C\text{ Maj}^7$) |
| **1** | **Solar Orange** | `#ff7b00` | Radiant momentum ($D^9$) |
| **2** | **Cosmic Yellow** | `#ffdd00` | Solar flare brilliance ($E\text{ min}^7$) |
| **3** | **Emerald Green** | `#10e052` | Spectrum balance & heart ($F\text{ Maj}^7$) |
| **4** | **Neon Cyan** | `#00d4ff` | High-energy stellar drive ($G\text{ Maj}^7$) |
| **5** | **Deep Blue** | `#3a55ff` | Astral midnight ($A\text{ min}^9$) |
| **6** | **Astral Violet** | `#b82bfb` | Ultra-high cosmic edge ($B\text{ min}^{7\flat 5}$) |

### 2. Decay, Void & The Ground Reticle
- **Accelerating Entropy:** All lanes decay constantly. As gallop speed ramps up from $18 \to 36\text{ units/s}$, the drain rate steadily accelerates.
- **The Void Hazard:** At **0%**, the lane vanishes into space. Grounded hooves cannot tread on nothingness; you will instantly plunge into the abyss.
- **Airborne Safety:** Void lanes cannot drag you down while airborne. Time your leaps to soar over missing gaps!
- **Dynamic Ground Marker:** A circular starlight reticle hovers precisely 3 cm above the rainbow track, tracking your horizontal lane position. It glows in the color of your current lane, flashes alarming red over void gaps, and expands in mid-air to show your exact landing zone.

### 3. Combo System & Miss Penalties
- **Passive Distance Score:** Points continuously tick up every frame proportional to your speed:
  $$\Delta \text{score} = \text{speed} \times \Delta t \times 3.5$$
- **Base Cloud Stab (100 Points):** Piercing an oncoming cloud awards $100 \times \text{combo}$ and spawns a floating 3D `100%` popup in the lane's hue.
- **Combo Multiplier (Up to 8×):** Each successive cloud pierced adds $+1$ to your multiplier (up to $800\text{ pts}$ per cloud).
- **Miss Penalty:** If an oncoming cloud drifts past unpierced:
  - Your combo streak resets back to $1\times$.
  - That color lane suffers an immediate $-5\%$ energy penalty (spawning a red `'-5%'` alert).
- **High Scores:** High scores are tracked separately in `localStorage` for **VR Easy**, **VR Hard**, and **Desktop** modes.

---

## 🎵 High-Energy Procedural Audio (Web Audio API)

There are **strictly zero MP3, OGG, or WAV audio files** included. The entire soundtrack and sound design are synthesized purely at runtime using the browser's native **Web Audio API**:

- **Dynamic 134+ BPM Synthwave Soundtrack:** An upbeat, driving tempo that accelerates in lockstep with your gallop speed, featuring a rolling sawtooth bassline, sparkling 16th-note arpeggios, and an 8-bar heroic lead melody with analog-style dual-oscillator detune.
- **Synthesized Hoofbeats (Left / Right Stereo Panning):**
  - Alternating left and right hooves create an authentic four-beat gallop rhythm (`[1, 0, 1, 1, 1, 0, 1, 1]`).
  - Each hoof strike is physically modeled with a resonant hollow acoustic cavity knock ("clop/clip"), a high-frequency crystal horseshoe click, a low-end punch, and filtered surface friction noise.
  - **Airborne Silence:** When you leap into the air, the hoofbeats cut out entirely, emphasizing the dramatic weightlessness of flight!
- **Spatial 3D Cloud Echoes:** Clouds rushing past your head trigger a resonant stereo pass-by chime through a cross-feedback delay bus.
- **Crystalline Stab Chimes:** Rapid 5-tone ascending crystal arpeggios tuned to the cloud's specific Lydian chord.
- **The Void Plunge:** When you fall off the highway, the music abruptly halts, punctuated by a comical descending sawtooth wobble as you plummet into the stars.

---

## 📐 100% Native 3D UI Architecture

On standalone mobile VR headsets (such as Meta Quest running Oculus Browser), drawing UI to a dynamic 2D canvas texture each frame (`CanvasTexture` + `texSubImage2D`) causes severe frame drops and **permanently freezes the HUD** due to hardware multiview caching quirks (`OCULUS_multiview`).

To solve this, *Stab the Rainbow* employs a **100% Native 3D UI pipeline**:
- **Static Character Sprite Atlas:** Digits and glyphs are rendered into static textures **only once at boot** and never touch the CPU-GPU bus during gameplay.
- **Live 3D Digits via Quad Meshes:** Live score, combo, and percentage counters are made of native 3D quads that simply swap material references on value change.
- **Geometric Matrix Gauges:** Health meters and warning borders use native 3D geometry transformations (`scale.y` directly on the GPU matrix).
- **Result:** Silky-smooth 90/120 FPS performance with zero rasterization overhead and zero multiview freezing.

*(For the complete technical deep dive, see [docs/VR_ARCHITECTURE.md](docs/VR_ARCHITECTURE.md).)*

---

## 🗜️ How Did This Fit in 13 KB?

To meet the legendary **js13kGames limit (13,312 bytes)**, the entire game—Three.js scene management, procedural terrain, particle systems, physics, WebXR tracking, procedural audio engine, and native 3D HUD—is packed into a single compressed production archive:

| Pipeline Step | Tool | Output Size | What It Does |
| :--- | :--- | :--- | :--- |
| **1. Bundle** | `esbuild` | ~47.4 KB | Single IIFE bundle with tree-shaking |
| **2. Minify JS** | `terser` | ~37.8 KB | Aggressive property mangling & unsafe transforms |
| **3. Minify CSS** | `csso` | ~1.29 KB | Structural stylesheet optimization |
| **4. Inline HTML** | `html-minifier-terser` | ~40.7 KB | Collapses redundant tags & attributes |
| **5. Crush** | `roadroller` | ~17.1 KB | Dynamic context-modeling JS/HTML entropy crusher |
| **6. Max ZIP** | `ect -9 -strip` | **13,251 bytes** | **12.94 KB (61 bytes under the 13 KB limit!)** |

### External WebXR Library Compliance
In accordance with official **js13kGames WebXR category rules**, A-Frame is imported externally from `https://play.js13kgames.com/2026/webxr/aframe.js` (with Three.js exposed). The game engine library itself is not packed inside the zip file, keeping the competition payload strictly under the 13,312-byte limit.

---

## 🚀 Development & Build

### Prerequisites
- Node.js $\ge 20$
- npm

### Commands
```bash
# Start local development server with hot-reloading
npm run dev

# Run TypeScript typechecker (strict mode)
npm run typecheck

# Run production build and generate dist/stab-the-rainbow.zip
npm run build
```

---

## 🦄 Credits & License

- **Author:** Filip Paulů — [paulu.cz](https://paulu.cz/)
- **Engine:** A-Frame / Three.js (WebXR Category)
- **Competition:** [js13kGames 2026](https://js13kgames.com/)
- **License:** [MIT](LICENSE)
