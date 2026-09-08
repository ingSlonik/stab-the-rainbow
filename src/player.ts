import { LANE_COUNT, LANE_WIDTH, TRACK_WIDTH, GameMode } from './types';
import { sin, cos, max, min, clamp, lerp } from './math';
import { playJumpSound } from './audio';

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class Player {
  public root: any;
  public cameraRig: any;
  public camera: any;
  public horn: any;
  public hornTip: any;
  public vrMode: GameMode = GameMode.DESKTOP;
  public vrController: any = null;

  public currentLane = 3;
  public x = 0;
  public y = 0;
  public targetX = 0;
  public vy = 0;
  public isGrounded = true;
  public isFalling = false;
  public isFallen = false;
  public isStabbing = false;
  public stabTimer = 0;
  private readonly STAB_DURATION = 0.24;
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

    // Magical starlight pointer beam extending from horn tip for VR interaction (unit length 1.0)
    const beamGeom = new THREE.CylinderGeometry(0.008, 0.016, 1.0, 8);
    beamGeom.rotateX(-Math.PI / 2);
    beamGeom.translate(0, 0, -0.5);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.85,
    });
    this.pointerBeam = new THREE.Mesh(beamGeom, beamMat);
    this.pointerBeam.visible = false;
    this.hornTip.add(this.pointerBeam);

    // Default desktop placement: offset to lower right, angled toward center
    this.horn.position.set(0, -0.42, -0.48);
    this.horn.rotation.set(0.38, 0, 0);
  }

  public setVRController(controller: any): void {
    this.vrController = controller;
  }

  public attachHornToHand(controller?: any, showPointer: boolean = false): void {
    const c = controller || this.vrController;
    if (!c) return;
    if (this.horn.parent !== c) {
      if (this.horn.parent) this.horn.parent.remove(this.horn);
      c.add(this.horn);
    }
    this.horn.position.set(0, -0.02, -0.08);
    this.horn.rotation.set(-0.65, 0, 0);
    this.horn.scale.set(1.0, 1.0, 1.0);
    if (this.pointerBeam) this.pointerBeam.visible = showPointer;
  }

  public attachHornToHead(): void {
    if (this.horn.parent !== this.camera) {
      if (this.horn.parent) this.horn.parent.remove(this.horn);
      this.camera.add(this.horn);
    }
    this.horn.position.set(0, 0.22, -0.15);
    this.horn.rotation.set(-0.16, 0, 0);
    this.horn.scale.set(0.75, 0.75, 0.75);
    if (this.pointerBeam) this.pointerBeam.visible = false;
  }

  public attachHornToDesktop(): void {
    if (this.horn.parent !== this.camera) {
      if (this.horn.parent) this.horn.parent.remove(this.horn);
      this.camera.add(this.horn);
    }
    this.horn.position.set(0, -0.42, -0.48);
    this.horn.rotation.set(0.38, 0, 0);
    this.horn.scale.set(1.0, 1.0, 1.0);
    if (this.pointerBeam) this.pointerBeam.visible = false;
  }

  public setMenuMode(isVR: boolean, controller?: any): void {
    if (controller) this.vrController = controller;
    if (isVR && (controller || this.vrController)) {
      this.attachHornToHand(controller || this.vrController, true);
    } else {
      this.attachHornToDesktop();
    }
  }

  public getHornRay(outOrigin: any, outDir: any): boolean {
    if (!this.horn || !this.hornTip) return false;
    if (this.horn.parent) {
      this.horn.parent.updateMatrixWorld(true);
    }
    this.horn.updateMatrixWorld(true);
    this.hornTip.updateMatrixWorld(true);

    const basePos = new THREE.Vector3();
    const tipPos = new THREE.Vector3();
    this.horn.getWorldPosition(basePos);
    this.hornTip.getWorldPosition(tipPos);

    outOrigin.copy(tipPos);
    outDir.subVectors(tipPos, basePos).normalize();
    return true;
  }

  public updatePointerBeam(hitPoint?: any): void {
    if (!this.pointerBeam || !this.pointerBeam.visible) return;
    if (hitPoint && this.hornTip) {
      const tipPos = new THREE.Vector3();
      this.hornTip.getWorldPosition(tipPos);
      const dist = tipPos.distanceTo(hitPoint);
      this.pointerBeam.scale.set(1, 1, Math.max(0.1, dist));
    } else {
      this.pointerBeam.scale.set(1, 1, 3.5);
    }
  }

  public setVRMode(mode: GameMode, controller?: any): void {
    this.vrMode = mode;
    if (controller) this.vrController = controller;
    this.isCalibrated = false;
    this.prevHeadZ = 0;
    this.prevHeadY = 0;
    this.prevHeadPitch = 0;

    if (mode === GameMode.VR_EASY) {
      this.attachHornToHand(undefined, false);
      this.cameraRig.position.set(0, 0.85, 0);
    } else if (mode === GameMode.VR_HARD) {
      this.attachHornToHead();
      this.cameraRig.position.set(0, 0.85, 0);
    } else {
      this.attachHornToDesktop();
      this.cameraRig.position.set(0, 2.05, 0);
    }
    if (this.pointerBeam) this.pointerBeam.visible = false;
  }

  public stab(): boolean {
    if (this.isFalling || this.isFallen) return false;
    this.isStabbing = true;
    this.stabTimer = this.STAB_DURATION;
    return true;
  }

  public jump(): boolean {
    if (this.isGrounded && !this.isFalling && !this.isFallen) {
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
    if (this.isFalling || this.isFallen) return;
    const closest = clamp(Math.round(this.targetX / LANE_WIDTH + 3), 0, LANE_COUNT - 1);
    this.currentLane = clamp(closest + direction, 0, LANE_COUNT - 1);
    this.targetX = (this.currentLane - 3) * LANE_WIDTH;
  }

  public moveLateral(deltaX: number): void {
    if (this.isFalling || this.isFallen) return;
    const maxX = (TRACK_WIDTH / 2) - (LANE_WIDTH * 0.4);
    this.targetX = clamp(this.targetX + deltaX, -maxX, maxX);
  }

  public setTargetX(normX: number): void {
    if (this.isFalling || this.isFallen) return;
    const maxX = (TRACK_WIDTH / 2) - (LANE_WIDTH * 0.4);
    this.targetX = clamp(normX * maxX, -maxX, maxX);
  }

  public startFalling(): void {
    this.isFalling = true;
    this.isFallen = false;
    this.isGrounded = false;
    this.vy = -1.5;
  }

  public stopFalling(): void {
    this.isFalling = false;
    this.isFallen = true;
    this.vy = 0;
  }

  public reset(isVR: boolean = false): void {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.vy = 0;
    this.isGrounded = true;
    this.isFalling = false;
    this.isFallen = false;
    this.isStabbing = false;
    this.stabTimer = 0;
    this.currentLane = 3;
    this.isCalibrated = false;
    this.prevHeadZ = 0;
    this.prevHeadY = 0;
    this.prevHeadPitch = 0;
    const isDesktop = !isVR && this.vrMode === GameMode.DESKTOP;
    this.root.position.set(0, isDesktop ? 2.05 : 0.85, 0);
    this.root.rotation.set(0, 0, 0);
    if (this.hornMat) this.hornMat.emissiveIntensity = 0.36;
    if (this.hornTip) this.hornTip.scale.set(1, 1, 1);
    if (this.pointerBeam) this.pointerBeam.visible = false;
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
      const isHard = this.vrMode === GameMode.VR_HARD;
      const isDesktop = !isVR && this.vrMode === GameMode.DESKTOP;
      const isInHand = this.horn.parent === this.vrController || (isVR && !isHard && this.horn.parent !== this.camera);

      if (isInHand) {
        this.horn.position.set(0, -0.02, -0.08 - thrustOffset);
        this.horn.rotation.set(-0.65, 0, 0);
      } else if (isDesktop) {
        this.horn.position.set(0, -0.42 + thrustOffset * 0.12, -0.48 - thrustOffset * 0.75);
        this.horn.rotation.set(0.38, 0, 0);
      } else if (isHard) {
        this.horn.position.set(0, 0.22, -0.15 - thrustOffset);
        // Obvious visual distinction for jump and stab in Hard mode
        this.horn.rotation.x = !this.isGrounded ? -0.38 : (this.isStabbing ? -0.06 : -0.16);
      }

      if (this.hornMat) {
        this.hornMat.emissiveIntensity = 0.36 + thrustOffset * 4.0;
      }
      if (this.hornTip) {
        const tipScale = this.isStabbing ? 1.8 : 1.0;
        this.hornTip.scale.set(tipScale, tipScale, tipScale);
      }
    }

    // 1. Body motion controls in VR (Physical side-steps steer across the rainbow in both Easy and Hard)
    if (isVR && (this.vrMode === GameMode.VR_HARD || this.vrMode === GameMode.VR_EASY) && this.camera) {
      if (!this.isCalibrated) {
        this.calibratedHeadX = this.camera.position.x;
        this.calibratedHeadY = this.camera.position.y ?? 0;
        this.prevHeadZ = this.camera.position.z;
        this.prevHeadY = this.calibratedHeadY;
        this.prevHeadPitch = this.camera.rotation.x;
        this.isCalibrated = true;
      }

      // Lateral head position / physical side-steps steer across lanes (matching real room scale)
      const headLeanX = this.camera.position.x - this.calibratedHeadX;
      const targetNormX = clamp(headLeanX * 1.05, -1.0, 1.0);
      this.setTargetX(targetNormX);

      // Hard mode: Head forward thrust ("headbutt") or nod triggers STAB, physical vertical leap triggers JUMP
      if (this.vrMode === GameMode.VR_HARD) {
        const curHeadZ = this.camera.position.z;
        const headVelZ = (curHeadZ - this.prevHeadZ) / max(0.001, dt);
        this.prevHeadZ = curHeadZ;

        const curHeadPitch = this.camera.rotation.x;
        const pitchVel = (curHeadPitch - this.prevHeadPitch) / max(0.001, dt);
        this.prevHeadPitch = curHeadPitch;

        if ((headVelZ < -0.26 || pitchVel < -1.3) && !this.isFalling && !this.isStabbing) {
          this.stab();
        }

        const curHeadY = this.camera.position.y;
        const headVelY = (curHeadY - this.prevHeadY) / max(0.001, dt);
        this.prevHeadY = curHeadY;
        if (headVelY > 0.70 && !this.isFalling && this.isGrounded) {
          this.jump();
        }
      }
    }

    // 2. Lateral smooth gliding towards target lane
    this.x = lerp(this.x, this.targetX, min(1, dt * 14));

    // 3. Vertical Jump & Gravity physics
    if (this.isFalling) {
      this.y += this.vy * dt;
      this.vy -= 22 * dt;
    } else if (!this.isGrounded && !this.isFallen) {
      this.y += this.vy * dt;
      this.vy -= 20 * dt;

      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isGrounded = true;
      }
    }

    // 4. Gallop bobbing
    if (this.isGrounded && isMoving && !this.isFalling && !this.isFallen) {
      this.gallopTimer += dt * speed * 1.5;
    }

    let gallopY = 0;
    if (this.isGrounded && isMoving && !this.isFalling && !this.isFallen && !isVR) {
      gallopY = sin(this.gallopTimer) * 0.012;
    }

    // 5. Update root position & orientation
    const isDesktop = this.vrMode === GameMode.DESKTOP;
    const baseH = isDesktop ? 2.05 : 0.85;
    this.root.position.x = this.x;
    this.root.position.y = baseH + this.y + gallopY;

    if (isVR) {
      // In VR, the physical headset dictates orientation. Horizon remains level!
      this.root.rotation.set(0, 0, 0);
    } else {
      // Fall straight down without disorienting tumbling
      this.root.rotation.set(0, 0, 0);
    }
  }
}
