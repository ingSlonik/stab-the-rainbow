# VR & WebXR Architecture Guide: Stab the Rainbow

This document outlines the core architecture and development principles for VR / WebXR in *Stab the Rainbow*, specifically targeting Meta Quest (Oculus Browser), Apple Vision Pro, and SteamVR.

---

## 1. The Core Golden Rule: 100% Native 3D UI (Zero 2D Canvas in Frame Loop)

### The Meta Quest / WebXR Problem
On mobile VR devices (specifically Meta Quest running Oculus Browser), rendering is managed through a hardware stereo multiview pipeline (`OCULUS_multiview`). 

If you attempt to use `THREE.CanvasTexture` for in-game HUDs (drawing text or shapes with `CanvasRenderingContext2D` each frame and setting `texture.needsUpdate = true`):
1. The CPU rasterizer (Skia) must draw to an offscreen buffer.
2. The entire 2D bitmap must be pushed across the system memory bus (`texSubImage2D`).
3. Under active WebXR projection layers at 90/120 FPS, the Adreno GPU driver drops or caches these dynamic uploads to prevent thermal throttling and framerate drops.
4. **Symptom:** The 2D HUD freezes permanently on its first rendered frame, showing static numbers while the 3D game continues behind it.

### The Solution: Native 3D Quads + Static Sprite Fonts
All in-game HUD elements must be constructed purely from native Three.js meshes and static materials:

1. **Sprite Font (Atlas) pre-rendered ONCE at boot:**
   - Pre-render small textures for digits (`0..9`), symbols (`%`, `,`, `-`, `x`), and static labels (`SCORE:`, `BEST:`, `COMBO`, color names, status badges).
   - See `initStaticMaterials()` in [`src/ui.ts`](../src/ui.ts).
   - These textures are uploaded to GPU VRAM once during boot. They **never** call `texture.needsUpdate = true` during gameplay.

2. **Live Digits as 3D Quads:**
   - Each digit on the HUD (score, combo, percentage) is a dedicated `THREE.Mesh(new THREE.PlaneGeometry(...))`.
   - When a number changes, **no pixels are drawn**. The quad simply swaps its material reference:
     ```ts
     quadMesh.material = this.charMaterials[char] || this.charMaterials[' '];
     ```
   - This produces zero bus traffic, zero rasterization, and runs smoothly at 90/120 FPS.

3. **Gauges and Health Bars via Matrix Scaling:**
   - Meters and health bars are native 3D geometries with an offset pivot (e.g. `barGeom.translate(0, height / 2, 0)`).
   - In each frame, update their length or height directly on the GPU matrix:
     ```ts
     gaugeMesh.scale.y = Math.max(0.02, Math.min(1.0, health));
     ```

4. **Borders and Dynamic Lines via Native Geometry:**
   - Use `THREE.LineSegments` with `THREE.EdgesGeometry`.
   - Modulate warning pulses and critical alerts by setting `material.color.setHex(...)` directly on the GPU.

---

## 2. Layering & Alpha Sorting in Three.js

When overlaying 3D HUD panels and cards:
- Assign explicit `renderOrder` to avoid Z-fighting and Three.js alpha sorting artifacts:
  - Backplate: `renderOrder = 100`
  - Backplate Outline: `renderOrder = 101`
  - Lane Cards: `renderOrder = 102`
  - Card Outlines & Gauges: `renderOrder = 103`
  - Text Quads & Badges: `renderOrder = 104`
- Set `transparent: true, depthWrite: false, depthTest: true` on HUD materials.
- When transforming terrain or track vertices in code, always call `geom.computeBoundingBox()` and `geom.computeBoundingSphere()` so camera distance sorting does not place the track over the HUD.

---

## 3. VR Controller Ergonomics & Reticle Alignment

- **Quest Touch Grip Angle:** Natural wrist holding angle tilts the controller grip coordinate space ~35° to 40° downward. Visual beams or horns held in hand must add an upward pitch offset (`rotation.x = -0.65` rad) to aim accurately.
- **Dialog Reticles:** The 3D laser ring cursor (`reticle3DMesh`) is parented directly to the dialog panel (`dialogMesh.add(this.reticle3DMesh)`). It is positioned using `dialogMesh.worldToLocal(hitPoint)`. When the dialog closes or translates away, the cursor ring naturally goes with it.

---

## 4. JS13k Constraints Note

While this project originated as a JS13k entry, VR compatibility, 90/120 FPS performance, and stereoscopic reliability take precedence. The 13KB limit may be exceeded as approved by the project owner.
