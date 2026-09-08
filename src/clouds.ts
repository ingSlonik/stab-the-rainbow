import {
  LANE_COUNT,
  LANE_WIDTH,
  RAINBOW_COLORS,
  CloudData,
  Particle,
} from './types';
import { sin, cos, max, min, floor, random, randRange } from './math';
import { playCloudEcho } from './audio';

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class CloudManager {
  public group: any;
  public clouds: (CloudData & { echoed?: boolean })[] = [];
  private scene: any;

  // Particle System
  private burstParticles: Particle[] = [];
  private burstPoints: any;
  private burstGeom: any;
  private burstPosArr: Float32Array;
  private burstColArr: Float32Array;

  // Upper Atmosphere 3D Sky Motes / Dashes
  private skyMotes: Array<{
    mesh: any;
    mat: any;
    freq: number;
    phase: number;
    baseY: number;
  }> = [];

  public onMissedCloud?: (colorIdx: number) => void;
  private spawnTimer = 0;

  constructor(scene: any) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.initParticles();
    this.initSkyMotes();
  }

  private createCloudMesh(colorHex: number): any {
    const cloudRoot = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.35,
      flatShading: true,
      transparent: true,
      opacity: 0.95,
    });

    const spheres = [
      { r: 0.25, x: 0, y: 0, z: 0 },
      { r: 0.19, x: -0.18, y: -0.02, z: 0.04 },
      { r: 0.20, x: 0.18, y: -0.02, z: -0.04 },
      { r: 0.16, x: 0.06, y: 0.14, z: 0.02 },
      { r: 0.14, x: -0.10, y: 0.11, z: -0.03 },
    ];

    const baseSphereGeom = new THREE.SphereGeometry(1, 8, 7);

    spheres.forEach((s) => {
      const m = new THREE.Mesh(baseSphereGeom, mat);
      m.scale.set(s.r, s.r * 0.85, s.r);
      m.position.set(s.x, s.y, s.z);
      cloudRoot.add(m);
    });

    return cloudRoot;
  }

  private static readonly MAX_BURST = 1200;

  private initParticles(): void {
    const MAX_BURST = CloudManager.MAX_BURST;
    this.burstPosArr = new Float32Array(MAX_BURST * 3);
    this.burstColArr = new Float32Array(MAX_BURST * 3);

    this.burstGeom = new THREE.BufferGeometry();
    this.burstGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(this.burstPosArr, 3)
    );
    this.burstGeom.setAttribute(
      'color',
      new THREE.BufferAttribute(this.burstColArr, 3)
    );

    const cvs = document.createElement('canvas');
    cvs.width = 32;
    cvs.height = 32;
    const ctx = cvs.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const sparkTex = new THREE.CanvasTexture(cvs);

    const mat = new THREE.PointsMaterial({
      size: 0.10,
      map: sparkTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.burstPoints = new THREE.Points(this.burstGeom, mat);
    this.burstPoints.frustumCulled = false;
    this.burstPoints.renderOrder = 95;
    this.scene.add(this.burstPoints);
  }

  private initSkyMotes(): void {
    const moteCount = 36;
    const dashGeom = new THREE.BoxGeometry(0.08, 0.08, 0.48);
    const dotGeom = new THREE.BoxGeometry(0.13, 0.13, 0.13);
    const colors = [0xd8f2ff, 0xffe899, 0xffc4f2, 0xafe8ff, 0xf0e6ff];

    for (let i = 0; i < moteCount; i++) {
      const isDash = i % 2 === 0;
      const geom = isDash ? dashGeom : dotGeom;
      const col = colors[i % colors.length];
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geom, mat);
      const baseY = randRange(5.5, 11.5);
      mesh.position.set(randRange(-16, 16), baseY, randRange(-95, 15));
      this.group.add(mesh);

      this.skyMotes.push({
        mesh,
        mat,
        freq: randRange(1.8, 3.8),
        phase: random() * Math.PI * 2,
        baseY,
      });
    }
  }

  public spawnBurst(x: number, y: number, z: number, colorHex: number): void {
    const count = 200;
    for (let i = 0; i < count; i++) {
      const speed = randRange(3.5, 12.5);
      const theta = random() * Math.PI * 2;
      const phi = randRange(-Math.PI / 2.5, Math.PI / 2.5);

      // 35% sparkling white/gold stars, 65% vivid rainbow color
      const isSpark = random() < 0.35;
      const col = isSpark ? (random() < 0.5 ? 0xffffff : 0xffea88) : colorHex;

      this.burstParticles.push({
        x,
        y,
        z,
        vx: cos(phi) * sin(theta) * speed,
        vy: sin(phi) * speed + randRange(1.8, 5.5),
        vz: cos(phi) * cos(theta) * speed,
        life: 0,
        maxLife: randRange(0.45, 1.20),
        color: col,
        size: randRange(0.06, 0.12),
      });
    }
  }

  public popCloud(c: CloudData & { echoed?: boolean }): void {
    if (c.popping) return;
    c.stabbed = true;
    c.popping = true;
    c.popTimer = 0.35;
    c.popDuration = 0.35;
    this.spawnBurst(c.x, c.y, c.z, RAINBOW_COLORS[c.colorIdx]);
  }

  public spawnCloud(): void {
    // Spawn across lane positions (-1.20 to +1.20 for 0.40m lanes)
    const lane = floor(random() * LANE_COUNT);
    const x = (lane - 3) * LANE_WIDTH + randRange(-0.08, 0.08);

    // Pick color: uniform random distribution across all 7 rainbow colors
    const colorIdx = floor(random() * LANE_COUNT);

    const colHex = RAINBOW_COLORS[colorIdx];
    const mesh = this.createCloudMesh(colHex);
    const z = randRange(-85, -75);
    // ~40% high clouds (must jump to reach: 2.85 - 3.45m), 60% ground height (1.85 - 2.35m)
    const isHigh = random() < 0.4;
    const baseY = isHigh ? randRange(2.85, 3.45) : randRange(1.85, 2.35);

    mesh.position.set(x, baseY, z);
    this.group.add(mesh);

    this.clouds.push({
      mesh,
      lane,
      colorIdx,
      x,
      y: baseY,
      z,
      baseY,
      freqX: randRange(1.2, 2.4),
      freqY: randRange(1.5, 3.0),
      phaseX: random() * Math.PI * 2,
      phaseY: random() * Math.PI * 2,
      radius: 0.36,
      stabbed: false,
      popping: false,
      popTimer: 0,
      popDuration: 0.35,
      echoed: false,
    });
  }

  public reset(): void {
    this.clouds.forEach((c) => {
      this.group.remove(c.mesh);
    });
    this.clouds = [];
    this.burstParticles = [];
    this.spawnTimer = 0;
    for (let i = 0; i < this.skyMotes.length; i++) {
      this.skyMotes[i].mesh.position.z = randRange(-95, 15);
    }
  }

  private removeCloud(i: number): void {
    this.group.remove(this.clouds[i].mesh);
    this.clouds.splice(i, 1);
  }

  public update(dt: number, speed: number, time: number, isMenu = false): void {
    // 1. Spawning logic
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnCloud();
      // Spawn interval decreases as speed increases
      this.spawnTimer = randRange(1.3, 2.4) * (20 / max(18, speed));
    }

    // 2. Update clouds
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];

      if (c.popping) {
        c.popTimer -= dt;
        if (c.popTimer <= 0) {
          this.removeCloud(i);
          continue;
        }

        const progress = 1 - c.popTimer / c.popDuration;
        const scale = 1 + progress * 0.9;
        c.mesh.scale.set(scale, scale, scale);

        const fade = max(0, 1 - progress);
        c.mesh.traverse((child: any) => {
          if (child.material) {
            if (progress < 0.35) {
              child.material.emissive.setHex(0xffffff);
              child.material.emissiveIntensity = 4.0 + (1 - progress / 0.35) * 5.0;
              child.material.opacity = 1.0;
            } else {
              child.material.opacity = fade * 0.95;
              child.material.emissiveIntensity = fade * 1.5;
            }
          }
        });

        c.y += dt * 2.2;
        c.z += speed * dt * 0.2;
        c.mesh.position.set(c.x, c.y, c.z);
        continue;
      }

      // Move toward player
      c.z += speed * dt;

      // In menu mode, clouds must never pass in front of the 3D menu dialog
      if (isMenu && c.z > -4.5) {
        this.removeCloud(i);
        continue;
      }

      // Harmonic 3D oscillation (subtle lateral sway within 0.29m lane)
      const offsetX = sin(time * c.freqX + c.phaseX) * 0.05;
      const offsetY = cos(time * c.freqY + c.phaseY) * 0.22;
      c.x += offsetX * dt;
      c.y = c.baseY + offsetY;

      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y = sin(time * 0.8 + c.phaseX) * 0.2;
      c.mesh.rotation.z = cos(time * 0.6 + c.phaseY) * 0.1;

      // Spatial pass-by echo ("dozvuk") if cloud rushes past the player
      if (c.z > -4 && c.z < 2 && !c.echoed && !c.stabbed) {
        c.echoed = true;
        playCloudEcho(c.colorIdx, c.x / 4, 0.22);
      }

      // Passed behind player without being stabbed: immediate damage trigger!
      if (c.z > 2.0 && !c.stabbed && !c.missTriggered) {
        c.missTriggered = true;
        if (!isMenu && this.onMissedCloud) {
          this.onMissedCloud(c.colorIdx);
        }
      }

      // Out of view behind player: cleanup mesh
      if (c.z > 6.0) {
        this.removeCloud(i);
      }
    }

    // 3. Update Burst Particles
    const posAttr = this.burstGeom.attributes.position;
    const colAttr = this.burstGeom.attributes.color;
    const maxB = CloudManager.MAX_BURST;
    let pIdx = 0;

    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const p = this.burstParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.burstParticles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 9.8 * dt * 0.4; // gentle gravity

      if (pIdx < maxB) {
        const i3 = pIdx * 3;
        this.burstPosArr[i3] = p.x;
        this.burstPosArr[i3 + 1] = p.y;
        this.burstPosArr[i3 + 2] = p.z;

        const f = (1 - p.life / p.maxLife) / 255;
        this.burstColArr[i3] = ((p.color >> 16) & 255) * f;
        this.burstColArr[i3 + 1] = ((p.color >> 8) & 255) * f;
        this.burstColArr[i3 + 2] = (p.color & 255) * f;
        pIdx++;
      }
    }

    // Clear unused particle slots
    for (let j = pIdx; j < maxB; j++) {
      const j3 = j * 3;
      this.burstPosArr[j3] = 0;
      this.burstPosArr[j3 + 1] = -999;
      this.burstPosArr[j3 + 2] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // 4. Update Upper Atmosphere 3D Sky Motes (moving backwards with clouds, pulsing in opacity)
    for (let i = 0; i < this.skyMotes.length; i++) {
      const m = this.skyMotes[i];
      m.mesh.position.z += speed * dt;

      // Wrap when passing behind the player
      if (m.mesh.position.z > 15) {
        m.mesh.position.z = randRange(-95, -80);
        m.mesh.position.x = randRange(-16, 16);
        m.baseY = randRange(5.5, 11.5);
        m.mesh.position.y = m.baseY;
        m.phase = random() * Math.PI * 2;
      }

      // Gentle starlight pulse & twinkle: shine then fade
      const s = sin(time * m.freq + m.phase);
      const glow = max(0, s);
      m.mat.opacity = 0.05 + 0.82 * (glow * glow);
    }
  }
}
