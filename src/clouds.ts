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

  // Cosmic Dust / Speed Stars
  private starPoints: any;
  private starGeom: any;
  private starPosArr: Float32Array;
  private readonly STAR_COUNT = 150;

  public onMissedCloud?: (colorIdx: number) => void;
  private spawnTimer = 0;

  constructor(scene: any) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.initParticles();
    this.initStars();
  }

  private createCloudMesh(colorHex: number): any {
    const cloudRoot = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.32,
      flatShading: true,
      transparent: true,
      opacity: 0.95,
    });

    const spheres = [
      { r: 0.65, x: 0, y: 0, z: 0 },
      { r: 0.48, x: -0.52, y: -0.05, z: 0.1 },
      { r: 0.52, x: 0.52, y: -0.05, z: -0.1 },
      { r: 0.42, x: 0.15, y: 0.36, z: 0.05 },
      { r: 0.36, x: -0.25, y: 0.28, z: -0.08 },
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

  private initParticles(): void {
    const MAX_BURST = 300;
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

    const mat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.burstPoints = new THREE.Points(this.burstGeom, mat);
    this.scene.add(this.burstPoints);
  }

  private initStars(): void {
    // 2 vertices per streak (head & tail) for vivid hyperspace motion
    this.starPosArr = new Float32Array(this.STAR_COUNT * 6);
    for (let i = 0; i < this.STAR_COUNT; i++) {
      this.resetStar(i, randRange(-65, 5));
    }

    this.starGeom = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.starPosArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.starGeom.setAttribute('position', posAttr);

    const mat = new THREE.LineBasicMaterial({
      color: 0xd8f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starPoints = new THREE.LineSegments(this.starGeom, mat);
    this.starPoints.frustumCulled = false;
    this.scene.add(this.starPoints);
  }

  private resetStar(idx: number, z: number): void {
    const base = idx * 6;
    // Radial distribution around the player's view corridor (center: x=0, y=2.0)
    const angle = random() * Math.PI * 2;
    const dist = randRange(1.8, 14.0);
    const x = cos(angle) * dist;
    const y = 2.0 + sin(angle) * dist * 0.75;
    const streakLen = randRange(1.8, 4.2);

    // Radial expansion: streaks point backward along the 3D divergence vector
    const radialScale = 0.28;
    const dx = (x / max(1.0, dist)) * radialScale;
    const dy = ((y - 2.0) / max(1.0, dist)) * radialScale;

    // Head vertex
    this.starPosArr[base] = x;
    this.starPosArr[base + 1] = y;
    this.starPosArr[base + 2] = z;

    // Tail vertex (behind head along Z, trailing inwards towards vanishing point)
    this.starPosArr[base + 3] = x - dx * streakLen;
    this.starPosArr[base + 4] = y - dy * streakLen;
    this.starPosArr[base + 5] = z - streakLen;
  }

  public spawnBurst(x: number, y: number, z: number, colorHex: number): void {
    const r = ((colorHex >> 16) & 255) / 255;
    const g = ((colorHex >> 8) & 255) / 255;
    const b = (colorHex & 255) / 255;

    const count = 45;
    for (let i = 0; i < count; i++) {
      const speed = randRange(3.0, 9.0);
      const theta = random() * Math.PI * 2;
      const phi = randRange(-Math.PI / 3, Math.PI / 3);

      this.burstParticles.push({
        x,
        y,
        z,
        vx: cos(phi) * sin(theta) * speed,
        vy: sin(phi) * speed + randRange(1, 4),
        vz: cos(phi) * cos(theta) * speed,
        life: 0,
        maxLife: randRange(0.45, 0.95),
        color: colorHex,
        size: randRange(0.14, 0.32),
      });
    }
  }

  public popCloud(c: CloudData & { echoed?: boolean }): void {
    if (c.stabbed) return;
    c.stabbed = true;
    c.popping = true;
    c.popTimer = 0.32;
    c.popDuration = 0.32;
    this.spawnBurst(c.x, c.y, c.z, RAINBOW_COLORS[c.colorIdx]);
  }

  public spawnCloud(preferredColorIdx?: number): void {
    // Spawn across lane positions (-3.3 to +3.3)
    const lane = floor(random() * LANE_COUNT);
    const x = (lane - 3) * LANE_WIDTH + randRange(-0.35, 0.35);

    // Pick color: 65% chance of preferred urgent color if provided, else random
    let colorIdx = floor(random() * LANE_COUNT);
    if (preferredColorIdx !== undefined && preferredColorIdx >= 0 && random() < 0.65) {
      colorIdx = preferredColorIdx;
    }

    const colHex = RAINBOW_COLORS[colorIdx];
    const mesh = this.createCloudMesh(colHex);
    const z = randRange(-85, -75);
    // ~40% high clouds (must jump to reach: 2.5 - 3.25m), 60% ground height (1.3 - 1.75m)
    const isHigh = random() < 0.4;
    const baseY = isHigh ? randRange(2.5, 3.25) : randRange(1.3, 1.75);

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
      radius: 0.85,
      stabbed: false,
      popping: false,
      popTimer: 0,
      popDuration: 0.32,
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
  }

  public update(dt: number, speed: number, time: number, urgentLane?: number, isMenu = false): void {
    // 1. Spawning logic
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnCloud(urgentLane);
      // Spawn interval decreases as speed increases
      this.spawnTimer = randRange(1.3, 2.4) * (20 / max(18, speed));
    }

    // 2. Update clouds
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];

      if (c.popping) {
        c.popTimer -= dt;
        if (c.popTimer <= 0) {
          this.group.remove(c.mesh);
          this.clouds.splice(i, 1);
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
              child.material.emissiveIntensity = 1.0 + (1 - progress / 0.35) * 2.2;
              child.material.opacity = 1.0;
            } else {
              child.material.opacity = fade * 0.9;
              child.material.emissiveIntensity = fade * 0.7;
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
        this.group.remove(c.mesh);
        this.clouds.splice(i, 1);
        continue;
      }

      // Harmonic 3D oscillation
      const offsetX = sin(time * c.freqX + c.phaseX) * 0.45;
      const offsetY = cos(time * c.freqY + c.phaseY) * 0.35;
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
        this.group.remove(c.mesh);
        this.clouds.splice(i, 1);
      }
    }

    // 3. Update Burst Particles
    const posAttr = this.burstGeom.attributes.position;
    const colAttr = this.burstGeom.attributes.color;
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

      if (pIdx < 300) {
        const i3 = pIdx * 3;
        this.burstPosArr[i3] = p.x;
        this.burstPosArr[i3 + 1] = p.y;
        this.burstPosArr[i3 + 2] = p.z;

        const fade = 1 - p.life / p.maxLife;
        const r = ((p.color >> 16) & 255) / 255;
        const g = ((p.color >> 8) & 255) / 255;
        const b = (p.color & 255) / 255;

        this.burstColArr[i3] = r * fade;
        this.burstColArr[i3 + 1] = g * fade;
        this.burstColArr[i3 + 2] = b * fade;
        pIdx++;
      }
    }

    // Clear unused particle slots
    for (let j = pIdx; j < 300; j++) {
      const j3 = j * 3;
      this.burstPosArr[j3] = 0;
      this.burstPosArr[j3 + 1] = -999;
      this.burstPosArr[j3 + 2] = 0;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // 4. Update Cosmic Speed Stars (Hyperspace Streaks)
    const starPos = this.starGeom.attributes.position;
    const starVel = max(18, speed) * dt * 2.8;
    for (let s = 0; s < this.STAR_COUNT; s++) {
      const base = s * 6;
      this.starPosArr[base + 2] += starVel;
      this.starPosArr[base + 5] += starVel;

      // Radial outward flow as star approaches the player
      const x = this.starPosArr[base];
      const y = this.starPosArr[base + 1];
      const outX = (x * 0.12) * dt * (starVel / 6);
      const outY = ((y - 2.0) * 0.12) * dt * (starVel / 6);
      this.starPosArr[base] += outX;
      this.starPosArr[base + 1] += outY;
      this.starPosArr[base + 3] += outX;
      this.starPosArr[base + 4] += outY;

      if (this.starPosArr[base + 2] > 7) {
        this.resetStar(s, randRange(-85, -70));
      }
    }
    starPos.needsUpdate = true;
  }
}
