import {
  LANE_COUNT,
  LANE_WIDTH,
  TRACK_WIDTH,
  RAINBOW_COLORS,
} from './types';
import { sin, cos, max, min, floor, random } from './math';

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class TrackManager {
  public group: any;
  public laneHealth: number[];
  public laneFlash: number[];
  private laneMeshes: any[] = [];
  private laneMaterials: any[] = [];
  private trackTexture: any;
  private timeUntilNextTarget = 0;
  private currentUrgentLane = -1;
  private laneRespawnTimer: number[];

  constructor(scene: any) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Attract mode initial healths: lively and varied so numbers are dynamic from the first frame!
    this.laneHealth = [0.92, 0.70, 0.45, 0.88, 0.35, 0.60, 0.82];
    this.laneFlash = new Array(LANE_COUNT).fill(0.0);
    this.laneRespawnTimer = new Array(LANE_COUNT).fill(0.0);

    this.initTexture();
    this.initMeshes();
    this.pickNextUrgentLane();
  }

  private initTexture(): void {
    // Generate a sleek procedural animated texture for the seamless rainbow lanes
    const cvs = document.createElement('canvas');
    cvs.width = 64;
    cvs.height = 128;
    const ctx = cvs.getContext('2d')!;

    // Soft horizontal starlight gradient that seamlessly blends at the seams
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 128);

    // Subtle magical flow lines and glittering cosmic flecks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let y = 0; y < 128; y += 24) {
      ctx.fillRect(4, y, 56, 3);
      ctx.beginPath();
      ctx.arc(32, y + 12, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    this.trackTexture = new THREE.CanvasTexture(cvs);
    this.trackTexture.wrapS = THREE.RepeatWrapping;
    this.trackTexture.wrapT = THREE.RepeatWrapping;
    this.trackTexture.repeat.set(1, 14);
  }

  private initMeshes(): void {
    const trackLength = 110;
    const segmentsY = 60;
    // Seamless contiguous rainbow band with slight overlap to prevent any gaps
    const geom = new THREE.PlaneGeometry(LANE_WIDTH * 1.01, trackLength, 1, segmentsY);
    geom.rotateX(-Math.PI / 2);

    // Gentle forward downward slope and curve
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      // z goes from +55 to -55
      // Shift so z goes from +6 to -104
      const actualZ = z - 49;
      pos.setZ(i, actualZ);
      // Subtle arc
      const y = -sin((-actualZ) * 0.02) * 1.5;
      pos.setY(i, y);
    }
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    for (let i = 0; i < LANE_COUNT; i++) {
      const col = RAINBOW_COLORS[i];
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        map: this.trackTexture,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 10;
      const laneX = (i - 3) * LANE_WIDTH;
      mesh.position.set(laneX, 0, 0);

      this.group.add(mesh);
      this.laneMeshes.push(mesh);
      this.laneMaterials.push(mat);
    }
  }

  private pickNextUrgentLane(): void {
    // Pick a lane to accelerate decay on, creating dynamic gameplay goals
    const candidates = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.laneHealth[i] > 0.4) candidates.push(i);
    }
    if (candidates.length > 0) {
      this.currentUrgentLane = candidates[floor(random() * candidates.length)];
    } else {
      this.currentUrgentLane = floor(random() * LANE_COUNT);
    }
    this.timeUntilNextTarget = 5.0 + random() * 3.0;
  }

  public replenishLane(colorIdx: number): void {
    if (colorIdx >= 0 && colorIdx < LANE_COUNT) {
      this.laneHealth[colorIdx] = min(1.0, this.laneHealth[colorIdx] + 0.35);
      this.laneFlash[colorIdx] = 1.0;
      if (this.currentUrgentLane === colorIdx) {
        this.pickNextUrgentLane();
      }
    }
  }

  public drainLane(colorIdx: number, amount = 0.20): void {
    if (colorIdx >= 0 && colorIdx < LANE_COUNT) {
      this.laneHealth[colorIdx] = max(0, this.laneHealth[colorIdx] - amount);
      this.laneFlash[colorIdx] = 1.0;
    }
  }

  public getUrgentLane(): number {
    return this.currentUrgentLane;
  }

  public getLaneIndexFromX(x: number): number {
    // Convert world X (-3.85 to +3.85) to lane index 0..6
    const norm = (x + TRACK_WIDTH / 2) / TRACK_WIDTH;
    const idx = floor(norm * LANE_COUNT);
    return max(0, min(LANE_COUNT - 1, idx));
  }

  public isLaneSolid(laneIdx: number): boolean {
    return this.laneHealth[laneIdx] > 0.04;
  }

  public reset(): void {
    for (let i = 0; i < LANE_COUNT; i++) {
      this.laneHealth[i] = 1.0;
      this.laneFlash[i] = 0.0;
      this.laneRespawnTimer[i] = 0.0;
    }
    this.pickNextUrgentLane();
  }

  public update(dt: number, speed: number, time: number, runTime = 60, isMenu = false): void {
    // Scroll texture backwards to simulate high-speed running
    if (this.trackTexture) {
      this.trackTexture.offset.y += speed * dt * 0.12;
    }

    // Update target urgency
    this.timeUntilNextTarget -= dt;
    if (this.timeUntilNextTarget <= 0 || (this.currentUrgentLane >= 0 && this.laneHealth[this.currentUrgentLane] <= 0.05)) {
      this.pickNextUrgentLane();
    }

    // Active decay: clear, noticeable progress
    const ramp = min(1.0, 0.55 + (runTime / 20) * 0.45);
    const baseDecay = (0.032 + speed * 0.001) * ramp;
    const urgentMult = 2.4;

    for (let i = 0; i < LANE_COUNT; i++) {
      // In menu mode, cycle health smoothly so attract screen stays dynamic forever
      if (isMenu) {
        if (this.laneHealth[i] <= 0.08) {
          this.laneRespawnTimer[i] += dt;
          if (this.laneRespawnTimer[i] >= 1.2) {
            this.replenishLane(i);
            this.laneRespawnTimer[i] = 0;
            continue;
          }
        } else {
          this.laneRespawnTimer[i] = 0;
        }
      }

      // Urgent lane decays fast so player visibly sees the ticking countdown!
      const rate = i === this.currentUrgentLane ? baseDecay * urgentMult : baseDecay;
      this.laneHealth[i] = max(0, this.laneHealth[i] - rate * dt);

      // Flash decay
      if (this.laneFlash[i] > 0) {
        this.laneFlash[i] = max(0, this.laneFlash[i] - dt * 2.5);
      }

      const h = this.laneHealth[i];
      const mat = this.laneMaterials[i];

      if (h <= 0.04) {
        // Void! Completely invisible
        mat.opacity = 0;
        this.laneMeshes[i].visible = false;
      } else {
        this.laneMeshes[i].visible = true;

        if (h < 0.32) {
          // Warning flicker: oscillates rapidly between 0.1 and 0.85
          const flicker = 0.45 + sin(time * 24 + i * 2) * 0.4;
          mat.opacity = flicker * (h / 0.32);
        } else {
          // Dynamically scale opacity so health decay is visible on the track itself
          mat.opacity = 0.52 + 0.38 * h;
        }

        // Color boost on replenish flash
        if (this.laneFlash[i] > 0) {
          const f = this.laneFlash[i];
          mat.color.setRGB(
            min(1, ((RAINBOW_COLORS[i] >> 16) & 255) / 255 + f * 0.8),
            min(1, ((RAINBOW_COLORS[i] >> 8) & 255) / 255 + f * 0.8),
            min(1, (RAINBOW_COLORS[i] & 255) / 255 + f * 0.8)
          );
        } else {
          mat.color.setHex(RAINBOW_COLORS[i]);
        }
      }
    }
  }
}
