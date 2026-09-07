import { LANE_WIDTH, TRACK_WIDTH } from './types';
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
    // Construct the magnificent translucent crystal unicorn horn
    this.horn = new THREE.Group();

    // Smooth, true cone geometry
    const coneLength = 1.85;
    const coneGeom = new THREE.ConeGeometry(0.11, coneLength, 32, 1);
    // Align so base is at origin, pointing forward along -Z
    coneGeom.rotateX(-Math.PI / 2);
    coneGeom.translate(0, 0, -coneLength / 2);

    // Translucent pearlescent crystal material
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0xfffcf2,
      emissive: 0xffe48e,
      emissiveIntensity: 0.36,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.74,
    });

    const hornMesh = new THREE.Mesh(coneGeom, hornMat);
    this.horn.add(hornMesh);

    // Glowing crystal tip at the apex of the cone
    const tipGeom = new THREE.SphereGeometry(0.045, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.hornTip = new THREE.Mesh(tipGeom, tipMat);
    this.hornTip.position.set(0, 0, -coneLength);
    this.horn.add(this.hornTip);

    // Position horn protruding down into view from forehead (top)
    this.horn.position.set(0, 0.44, -0.28);
    this.horn.rotation.x = -0.24;

    camera.add(this.horn);
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
    this.currentLane = 3;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }

  public update(dt: number, speed: number, isMoving: boolean): void {
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

    // 3. Gallop bobbing when grounded and running
    let gallopY = 0;
    let gallopPitch = 0;
    if (this.isGrounded && isMoving && !this.isFalling) {
      this.gallopTimer += dt * speed * 1.5;
      gallopY = sin(this.gallopTimer) * 0.018;
      gallopPitch = cos(this.gallopTimer) * 0.007;
    }

    // 4. Update root position & bank tilt
    this.root.position.x = this.x;
    this.root.position.y = this.y + gallopY;

    // Banking when turning
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
