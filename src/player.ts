import { LANE_COUNT, LANE_WIDTH, TRACK_WIDTH, VRMode, RAINBOW_COLORS } from './types';
import { sin, cos, max, min, clamp, lerp } from './math';
import { playJumpSound } from './audio';

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class Player {
  public root: any;
  public cameraRig: any;
  public camera: any;
  public horn: any;
  public hornTip: any;
  public vrMode: VRMode = VRMode.NONE;
  public vrController: any = null;

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
  private readonly desktopHornX = 0.35;
  private readonly desktopHornY = -0.46;
  private readonly desktopHornZ = -0.42;
  private readonly desktopRotX = 0.52;
  private readonly desktopRotY = -0.26;
  private readonly desktopRotZ = -0.20;
  private hornMat: any;

  private hornTipWorldPos: any;
  private gallopTimer = 0;

  // Head tracking calibration for Hard mode
  private isCalibrated = false;
  private calibratedHeadX = 0;
  private calibratedHeadY = 0;
  private prevHeadZ = 0;
  private prevHeadY = 0;

  public pointerBeam: any;
  private prevHeadPitch = 0;

  constructor(scene: any, camera: any, rigEl?: any, rightControllerEl?: any) {
    this.camera = camera;
    if (rigEl && rigEl.object3D) {
      this.root = rigEl.object3D;
      this.cameraRig = this.root;
    } else {
      this.root = new THREE.Group();
      scene.add(this.root);
      this.cameraRig = new THREE.Group();
      this.cameraRig.position.set(0, 2.25, 0);
      this.root.add(this.cameraRig);
      this.cameraRig.add(camera);
    }

    if (rightControllerEl && rightControllerEl.object3D) {
      this.vrController = rightControllerEl.object3D;
    }

    this.hornTipWorldPos = new THREE.Vector3();
    this.initHorn();

    // Default desktop mount on camera
    this.camera.add(this.horn);
  }

  private initHorn(): void {
    this.horn = new THREE.Group();

    // Elegant crystal unicorn horn (0.78m length, comfortable proportion)
    const coneLength = 0.78;
    const coneGeom = new THREE.ConeGeometry(0.032, coneLength, 20, 1);
    coneGeom.rotateX(-Math.PI / 2);
    coneGeom.translate(0, 0, -coneLength / 2);

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

    // Glowing tip at the apex
    const tipGeom = new THREE.SphereGeometry(0.024, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.hornTip = new THREE.Mesh(tipGeom, tipMat);
    this.hornTip.position.set(0, 0, -coneLength);
    this.horn.add(this.hornTip);

    // Magical starlight pointer beam extending from horn tip for VR interaction
    const beamGeom = new THREE.CylinderGeometry(0.003, 0.008, 2.8, 6);
    beamGeom.rotateX(-Math.PI / 2);
    beamGeom.translate(0, 0, -1.4);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.65,
    });
    this.pointerBeam = new THREE.Mesh(beamGeom, beamMat);
    this.hornTip.add(this.pointerBeam);

    // Default desktop placement: offset to lower right, angled toward center
    this.horn.position.set(this.desktopHornX, this.desktopHornY, this.desktopHornZ);
    this.horn.rotation.set(this.desktopRotX, this.desktopRotY, this.desktopRotZ);
  }

  public setMenuMode(controller?: any): void {
    if (this.horn.parent) {
      this.horn.parent.remove(this.horn);
    }
    const c = controller || this.vrController;
    if (c) {
      c.add(this.horn);
      this.horn.position.set(0, 0, -0.15);
      this.horn.rotation.set(0, 0, 0);
      this.horn.scale.set(1.0, 1.0, 1.0);
    } else {
      this.camera.add(this.horn);
      this.horn.position.set(this.desktopHornX, this.desktopHornY, this.desktopHornZ);
      this.horn.rotation.set(this.desktopRotX, this.desktopRotY, this.desktopRotZ);
      this.horn.scale.set(1.0, 1.0, 1.0);
    }
    if (this.pointerBeam) this.pointerBeam.visible = true;
  }

  public getHornRay(outOrigin: any, outDir: any): void {
    if (this.hornTip) {
      this.hornTip.getWorldPosition(outOrigin);
      this.hornTip.getWorldDirection(outDir).negate();
    }
  }

  public setVRMode(mode: VRMode, controller?: any): void {
    this.vrMode = mode;
    this.vrController = controller || this.vrController || null;
    this.isCalibrated = false;
    this.prevHeadZ = 0;
    this.prevHeadY = 0;
    this.prevHeadPitch = 0;

    // Detach horn from previous parent
    if (this.horn.parent) {
      this.horn.parent.remove(this.horn);
    }

    if (mode === VRMode.RIDER_EASY) {
      // 1. Easy Mode: Horn is held in player's hand via VR controller
      const c = controller || this.vrController;
      if (c) {
        c.add(this.horn);
        this.horn.position.set(0, 0, -0.15);
        this.horn.rotation.set(0, 0, 0);
        this.horn.scale.set(1.0, 1.0, 1.0);
      } else {
        this.camera.add(this.horn);
        this.horn.position.set(0.18, -0.18, -0.45);
        this.horn.rotation.set(0.1, -0.05, 0);
      }
      if (this.pointerBeam) this.pointerBeam.visible = false;
      this.cameraRig.position.set(0, 1.40, 0);
    } else if (mode === VRMode.UNICORN_HARD) {
      // 2. Hard Mode: You ARE the unicorn! Horn on forehead
      this.camera.add(this.horn);
      this.horn.position.set(0, 0.22, -0.15);
      this.horn.rotation.set(-0.16, 0, 0);
      this.horn.scale.set(0.75, 0.75, 0.75);
      if (this.pointerBeam) this.pointerBeam.visible = false;

      this.cameraRig.position.set(0, 1.45, 0);
    } else {
      // Desktop
      this.camera.add(this.horn);
      this.horn.position.set(this.desktopHornX, this.desktopHornY, this.desktopHornZ);
      this.horn.rotation.set(this.desktopRotX, this.desktopRotY, this.desktopRotZ);
      this.horn.scale.set(1.0, 1.0, 1.0);
      if (this.pointerBeam) this.pointerBeam.visible = false;

      this.cameraRig.position.set(0, 2.25, 0);
    }
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
    this.isCalibrated = false;
    this.prevHeadZ = 0;
    this.prevHeadY = 0;
    this.prevHeadPitch = 0;
    this.root.position.set(0, this.vrMode === VRMode.NONE ? 2.25 : 1.45, 0);
    this.root.rotation.set(0, 0, 0);
    if (this.hornMat) this.hornMat.emissiveIntensity = 0.36;
    if (this.hornTip) this.hornTip.scale.set(1, 1, 1);
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
          thrustOffset = (progress / 0.35) * 0.58;
        } else {
          thrustOffset = (1 - (progress - 0.35) / 0.65) * 0.58;
        }
      }
    }

    if (this.horn) {
      const isHard = this.vrMode === VRMode.UNICORN_HARD;
      const isDesktop = this.vrMode === VRMode.NONE;
      const baseZ = isDesktop ? this.desktopHornZ : (isHard ? -0.15 : -0.15);
      this.horn.position.z = baseZ - thrustOffset;

      if (isDesktop) {
        this.horn.position.x = this.desktopHornX - thrustOffset * 0.22;
        this.horn.position.y = this.desktopHornY + thrustOffset * 0.35;
        this.horn.position.z = this.desktopHornZ - thrustOffset * 0.65;
      }
      if (this.hornMat) {
        this.hornMat.emissiveIntensity = 0.36 + thrustOffset * 4.0;
      }
      if (this.hornTip) {
        const tipScale = this.isStabbing ? 1.8 : 1.0;
        this.hornTip.scale.set(tipScale, tipScale, tipScale);
      }
      if (isHard) {
        // Obvious visual distinction for jump and stab in Hard mode
        this.horn.rotation.x = !this.isGrounded ? -0.38 : (this.isStabbing ? -0.06 : -0.16);
      }
    }

    // 1. Body motion controls in Hard Mode (You ARE the unicorn!)
    if (isVR && this.vrMode === VRMode.UNICORN_HARD && this.camera) {
      if (!this.isCalibrated) {
        this.calibratedHeadX = this.camera.position.x;
        this.calibratedHeadY = this.camera.position.y ?? 0;
        this.prevHeadZ = this.camera.position.z;
        this.prevHeadY = this.calibratedHeadY;
        this.prevHeadPitch = this.camera.rotation.x;
        this.isCalibrated = true;
      }

      // Lateral head lean steers across lanes
      const headLeanX = this.camera.position.x - this.calibratedHeadX;
      const targetNormX = clamp(headLeanX * 3.2, -1.0, 1.0);
      this.setTargetX(targetNormX);

      // Head forward thrust ("headbutt") or nod triggers STAB
      const curHeadZ = this.camera.position.z;
      const headVelZ = (curHeadZ - this.prevHeadZ) / max(0.001, dt);
      this.prevHeadZ = curHeadZ;

      const curHeadPitch = this.camera.rotation.x;
      const pitchVel = (curHeadPitch - this.prevHeadPitch) / max(0.001, dt);
      this.prevHeadPitch = curHeadPitch;

      if ((headVelZ < -0.26 || pitchVel < -1.3) && !this.isFalling && !this.isStabbing) {
        this.stab();
      }

      // Upward head jerk / physical jump triggers JUMP
      const curHeadY = this.camera.position.y;
      const headVelY = (curHeadY - this.prevHeadY) / max(0.001, dt);
      this.prevHeadY = curHeadY;
      if (headVelY > 0.70 && !this.isFalling && this.isGrounded) {
        this.jump();
      }
    }

    // 2. Lateral smooth gliding towards target lane
    this.x = lerp(this.x, this.targetX, min(1, dt * 14));

    // 3. Vertical Jump & Gravity physics
    if (!this.isGrounded || this.isFalling) {
      this.y += this.vy * dt;
      this.vy -= (this.isFalling ? 24 : 20) * dt;

      if (!this.isFalling && this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isGrounded = true;
      }
    }

    // 4. Gallop bobbing
    if (this.isGrounded && isMoving && !this.isFalling) {
      this.gallopTimer += dt * speed * 1.5;
    }

    let gallopY = 0;
    let gallopPitch = 0;
    if (this.isGrounded && isMoving && !this.isFalling && !isVR) {
      gallopY = sin(this.gallopTimer) * 0.018;
      gallopPitch = cos(this.gallopTimer) * 0.007;
    }



    // 5. Update root position & orientation
    const baseH = this.vrMode === VRMode.NONE ? 2.25 : 1.45;
    this.root.position.x = this.x;
    this.root.position.y = baseH + this.y + gallopY;

    if (isVR) {
      // In VR, the physical headset dictates orientation. Horizon remains level!
      this.root.rotation.set(0, 0, 0);
    } else {
      // Desktop banking when turning
      const turnVel = (this.targetX - this.x);
      this.root.rotation.z = -turnVel * 0.14;
      this.root.rotation.x = gallopPitch;

      // Tumble rotation when falling
      if (this.isFalling) {
        this.root.rotation.x += dt * 3.5;
        this.root.rotation.z += dt * 2.2;
      }
    }
  }
}
