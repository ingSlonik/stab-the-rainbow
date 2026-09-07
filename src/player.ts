import { LANE_COUNT, LANE_WIDTH, TRACK_WIDTH } from './types';
import { sin, cos, max, min, clamp, lerp } from './math';
import { playJumpSound } from './audio';

export class Player {
  public root: any;
  public cameraRig: any;
  public horn: any;
  public hornTip: any;
  public currentLane = 3;
  public x = 0;
  public y = 0;
  public targetX = 0;
  public vy = 0;
  public isGrounded = true;
  public isFalling = false;
  public isStabbing = false;
  public stabTimer = 0;
  private readonly STAB_DURATION = 0.24;
  private readonly hornBaseZ = -0.22;
  private hornMat: any;

  private hornTipWorldPos: any;
  private gallopTimer = 0;

  constructor(scene: any, camera: any) {
    this.root = new THREE.Group();
    scene.add(this.root);

    this.cameraRig = new THREE.Group();
    this.root.add(this.cameraRig);
    this.cameraRig.add(camera);

    this.hornTipWorldPos = new THREE.Vector3();
    this.initHorn(camera);
  }

  private initHorn(camera: any): void {
    // Construct the slender, elegant translucent crystal unicorn horn
    this.horn = new THREE.Group();

    // Smooth cone geometry: 1.15m long, 3.5cm radius base
    const coneLength = 1.15;
    const coneGeom = new THREE.ConeGeometry(0.035, coneLength, 24, 1);
    // Align base at origin, pointing forward along -Z
    coneGeom.rotateX(-Math.PI / 2);
    coneGeom.translate(0, 0, -coneLength / 2);

    // Translucent pearlescent crystal material
    this.hornMat = new THREE.MeshStandardMaterial({
      color: 0xfffcf5,
      emissive: 0xffe899,
      emissiveIntensity: 0.42,
      roughness: 0.15,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
    });

    const hornMesh = new THREE.Mesh(coneGeom, this.hornMat);
    this.horn.add(hornMesh);

    // Glowing crystal tip at the apex of the cone
    const tipGeom = new THREE.SphereGeometry(0.024, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.hornTip = new THREE.Mesh(tipGeom, tipMat);
    this.hornTip.position.set(0, 0, -coneLength);
    this.horn.add(this.hornTip);

    // Position horn sprouting from forehead, angled forward above eye line so both eyes can see it stereoscopically
    this.horn.position.set(0, 0.24, this.hornBaseZ);
    this.horn.rotation.x = -0.09;

    camera.add(this.horn);
  }

  public stab(): boolean {
    if (this.isFalling) return false;
    this.isStabbing = true;
    this.stabTimer = this.STAB_DURATION;
    return true;
  }

  public jump(): boolean {
    if (this.isGrounded && !this.isFalling) {
      this.vy = 7.8;
      this.isGrounded = false;
      playJumpSound();
      return true;
    }
    return false;
  }

  public getHornTipPosition(): any {
    if (this.hornTip) {
      this.hornTip.getWorldPosition(this.hornTipWorldPos);
    }
    return this.hornTipWorldPos;
  }

  public shiftLane(direction: number): void {
    if (this.isFalling) return;
    const closest = clamp(Math.round(this.targetX / LANE_WIDTH + 3), 0, LANE_COUNT - 1);
    this.currentLane = clamp(closest + direction, 0, LANE_COUNT - 1);
    this.targetX = (this.currentLane - 3) * LANE_WIDTH;
  }

  public moveLateral(deltaX: number): void {
    if (this.isFalling) return;
    const maxX = (TRACK_WIDTH / 2) - (LANE_WIDTH * 0.4);
    this.targetX = clamp(this.targetX + deltaX, -maxX, maxX);
  }

  public setTargetX(normX: number): void {
    if (this.isFalling) return;
    const maxX = (TRACK_WIDTH / 2) - (LANE_WIDTH * 0.4);
    this.targetX = clamp(normX * maxX, -maxX, maxX);
  }

  public startFalling(): void {
    this.isFalling = true;
    this.isGrounded = false;
    this.vy = -1.5;
  }

  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.vy = 0;
    this.isGrounded = true;
    this.isFalling = false;
    this.isStabbing = false;
    this.stabTimer = 0;
    this.currentLane = 3;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    if (this.horn) this.horn.position.z = this.hornBaseZ;
    if (this.hornMat) this.hornMat.emissiveIntensity = 0.36;
  }

  public update(dt: number, speed: number, isMoving: boolean, isVR: boolean = false): void {
    // 0. Horn thrust animation on stab
    let thrustOffset = 0;
    if (this.stabTimer > 0) {
      this.stabTimer -= dt;
      if (this.stabTimer <= 0) {
        this.stabTimer = 0;
        this.isStabbing = false;
      } else {
        const progress = 1 - (this.stabTimer / this.STAB_DURATION);
        if (progress < 0.35) {
          thrustOffset = (progress / 0.35) * 0.55;
        } else {
          thrustOffset = (1 - (progress - 0.35) / 0.65) * 0.55;
        }
      }
    }
    if (this.horn) {
      this.horn.position.z = this.hornBaseZ - thrustOffset;
      if (this.hornMat) {
        this.hornMat.emissiveIntensity = 0.36 + thrustOffset * 1.8;
      }
    }

    // 1. Lateral smooth gliding towards target lane
    this.x = lerp(this.x, this.targetX, min(1, dt * 14));

    // 2. Vertical Jump & Gravity physics
    if (!this.isGrounded || this.isFalling) {
      this.y += this.vy * dt;
      this.vy -= (this.isFalling ? 24 : 20) * dt;

      if (!this.isFalling && this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isGrounded = true;
      }
    }

    // 3. Gallop bobbing when grounded and running (desktop only)
    let gallopY = 0;
    let gallopPitch = 0;
    if (this.isGrounded && isMoving && !this.isFalling && !isVR) {
      this.gallopTimer += dt * speed * 1.5;
      gallopY = sin(this.gallopTimer) * 0.018;
      gallopPitch = cos(this.gallopTimer) * 0.007;
    }

    // 4. Update root position & bank tilt
    this.root.position.x = this.x;
    this.root.position.y = this.y + gallopY;

    if (isVR) {
      // In VR, the physical headset dictates orientation. Keep camera rig level with the horizon!
      this.root.rotation.set(0, 0, 0);
    } else {
      // Desktop banking when turning
      const turnVel = (this.targetX - this.x);
      this.root.rotation.z = -turnVel * 0.14;
      this.root.rotation.x = gallopPitch;

      // 5. Tumble rotation when falling
      if (this.isFalling) {
        this.root.rotation.x += dt * 3.5;
        this.root.rotation.z += dt * 2.2;
      }
    }
  }
}
