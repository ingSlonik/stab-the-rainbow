import { LANE_COUNT, LANE_WIDTH, TRACK_WIDTH, VRMode, RAINBOW_COLORS } from './types';
import { sin, cos, max, min, clamp, lerp } from './math';
import { playJumpSound } from './audio';

export class Player {
  public root: any;
  public cameraRig: any;
  public camera: any;
  public horn: any;
  public hornTip: any;
  public unicornHead: any;
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
  private readonly hornBaseZ = -0.16;
  private hornMat: any;

  private hornTipWorldPos: any;
  private gallopTimer = 0;

  // Head tracking calibration for Hard mode
  private isCalibrated = false;
  private calibratedHeadX = 0;
  private calibratedHeadY = 0;
  private prevHeadZ = 0;
  private prevHeadY = 0;

  constructor(scene: any, camera: any) {
    this.camera = camera;
    this.root = new THREE.Group();
    scene.add(this.root);

    // Camera rig ensures player eye height is naturally elevated above rainbow highway
    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 1.45, 0);
    this.root.add(this.cameraRig);
    this.cameraRig.add(camera);

    this.hornTipWorldPos = new THREE.Vector3();
    this.initHorn();
    this.initUnicornCompanion();

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

    // Default desktop placement
    this.horn.position.set(0, 0.24, this.hornBaseZ);
    this.horn.rotation.x = -0.09;
  }

  private initUnicornCompanion(): void {
    // Stylized companion unicorn head and neck for Easy Rider mode
    this.unicornHead = new THREE.Group();

    const coatMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.05,
    });

    // Neck
    const neckGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.55, 12);
    neckGeom.rotateX(0.45);
    const neck = new THREE.Mesh(neckGeom, coatMat);
    neck.position.set(0, -0.22, -0.65);
    this.unicornHead.add(neck);

    // Cranium / Head
    const headGeom = new THREE.BoxGeometry(0.22, 0.24, 0.38);
    const head = new THREE.Mesh(headGeom, coatMat);
    head.position.set(0, 0.06, -0.88);
    head.rotation.x = -0.15;
    this.unicornHead.add(head);

    // Muzzle / Snout
    const muzzleGeom = new THREE.BoxGeometry(0.16, 0.15, 0.22);
    const snoutMat = new THREE.MeshStandardMaterial({
      color: 0xffe8f2,
      roughness: 0.4,
    });
    const muzzle = new THREE.Mesh(muzzleGeom, snoutMat);
    muzzle.position.set(0, 0.01, -1.08);
    muzzle.rotation.x = -0.10;
    this.unicornHead.add(muzzle);

    // Cute pointed ears
    const earGeom = new THREE.ConeGeometry(0.045, 0.16, 8);
    const leftEar = new THREE.Mesh(earGeom, coatMat);
    leftEar.position.set(-0.11, 0.22, -0.82);
    leftEar.rotation.set(-0.2, 0, -0.25);
    this.unicornHead.add(leftEar);

    const rightEar = new THREE.Mesh(earGeom, coatMat);
    rightEar.position.set(0.11, 0.22, -0.82);
    rightEar.rotation.set(-0.2, 0, 0.25);
    this.unicornHead.add(rightEar);

    // Flowing rainbow mane crest
    const maneGroup = new THREE.Group();
    for (let i = 0; i < RAINBOW_COLORS.length; i++) {
      const tuftGeom = new THREE.SphereGeometry(0.055, 8, 8);
      tuftGeom.scale(0.8, 1.4, 0.9);
      const tuftMat = new THREE.MeshStandardMaterial({
        color: RAINBOW_COLORS[i],
        emissive: RAINBOW_COLORS[i],
        emissiveIntensity: 0.35,
        roughness: 0.3,
      });
      const tuft = new THREE.Mesh(tuftGeom, tuftMat);
      const frac = i / (RAINBOW_COLORS.length - 1);
      tuft.position.set(0, 0.18 - frac * 0.42, -0.78 + frac * 0.24);
      maneGroup.add(tuft);
    }
    this.unicornHead.add(maneGroup);

    // Small glowing horn on companion's head
    const compHornGeom = new THREE.ConeGeometry(0.024, 0.35, 12);
    compHornGeom.rotateX(-Math.PI / 2.3);
    const compHornMat = new THREE.MeshStandardMaterial({
      color: 0xfffcf0,
      emissive: 0xffd700,
      emissiveIntensity: 0.5,
      roughness: 0.2,
    });
    const compHorn = new THREE.Mesh(compHornGeom, compHornMat);
    compHorn.position.set(0, 0.21, -0.92);
    this.unicornHead.add(compHorn);

    // Initially hidden (only visible in Easy Rider VR mode)
    this.unicornHead.visible = false;
    this.root.add(this.unicornHead);
  }

  public setVRMode(mode: VRMode, controller?: any): void {
    this.vrMode = mode;
    this.vrController = controller || null;
    this.isCalibrated = false;
    this.prevHeadZ = 0;
    this.prevHeadY = 0;

    // Detach horn from previous parent
    if (this.horn.parent) {
      this.horn.parent.remove(this.horn);
    }

    if (mode === VRMode.RIDER_EASY) {
      // 1. Easy Mode: Horn is held in player's hand via VR controller
      if (controller) {
        controller.add(this.horn);
        // Align horn pointing forward from controller as jousting lance
        this.horn.position.set(0, 0, -0.15);
        this.horn.rotation.set(0, 0, 0);
        this.horn.scale.set(1.0, 1.0, 1.0);
      } else {
        // Fallback to camera if controller not ready
        this.camera.add(this.horn);
        this.horn.position.set(0.18, -0.18, -0.45);
        this.horn.rotation.set(0.1, -0.05, 0);
      }
      this.unicornHead.visible = true;
      this.cameraRig.position.set(0, 1.40, 0);
    } else if (mode === VRMode.UNICORN_HARD) {
      // 2. Hard Mode: You ARE the unicorn! Horn on forehead, clean stereoscopy
      this.camera.add(this.horn);
      this.horn.position.set(0, 0.22, -0.15);
      this.horn.rotation.set(-0.16, 0, 0);
      this.horn.scale.set(0.75, 0.75, 0.75);

      this.unicornHead.visible = false;
      this.cameraRig.position.set(0, 1.45, 0);
    } else {
      // Desktop
      this.camera.add(this.horn);
      this.horn.position.set(0, 0.24, this.hornBaseZ);
      this.horn.rotation.set(-0.09, 0, 0);
      this.horn.scale.set(1.0, 1.0, 1.0);

      this.unicornHead.visible = false;
      this.cameraRig.position.set(0, 1.45, 0);
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
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
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
          thrustOffset = (progress / 0.35) * 0.48;
        } else {
          thrustOffset = (1 - (progress - 0.35) / 0.65) * 0.48;
        }
      }
    }

    if (this.horn) {
      const baseZ = this.vrMode === VRMode.RIDER_EASY ? -0.15 : (this.vrMode === VRMode.UNICORN_HARD ? -0.15 : this.hornBaseZ);
      this.horn.position.z = baseZ - thrustOffset;
      if (this.hornMat) {
        this.hornMat.emissiveIntensity = 0.36 + thrustOffset * 2.2;
      }
    }

    // 1. Body motion controls in Hard Mode (You ARE the unicorn!)
    if (isVR && this.vrMode === VRMode.UNICORN_HARD && this.camera) {
      if (!this.isCalibrated) {
        this.calibratedHeadX = this.camera.position.x;
        this.calibratedHeadY = this.camera.position.y ?? 0;
        this.prevHeadZ = this.camera.position.z;
        this.prevHeadY = this.calibratedHeadY;
        this.isCalibrated = true;
      }

      // Lateral head lean steers across lanes
      const headLeanX = this.camera.position.x - this.calibratedHeadX;
      const targetNormX = clamp(headLeanX * 3.2, -1.0, 1.0);
      this.setTargetX(targetNormX);

      // Head forward thrust ("headbutt") triggers STAB
      const curHeadZ = this.camera.position.z;
      const headVelZ = (curHeadZ - this.prevHeadZ) / max(0.001, dt);
      this.prevHeadZ = curHeadZ;
      if (headVelZ < -0.32 && !this.isFalling) {
        this.stab();
      }

      // Upward head jerk / physical jump triggers JUMP
      const curHeadY = this.camera.position.y;
      const headVelY = (curHeadY - this.prevHeadY) / max(0.001, dt);
      this.prevHeadY = curHeadY;
      if (headVelY > 1.25 && !this.isFalling) {
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

    // Easy mode companion unicorn head bobbing
    if (this.unicornHead && this.unicornHead.visible) {
      const companionBob = sin(this.gallopTimer) * 0.035;
      this.unicornHead.position.y = -0.28 + (this.isGrounded ? companionBob : -0.05);
      this.unicornHead.rotation.x = cos(this.gallopTimer) * 0.025;
    }

    // 5. Update root position & orientation
    this.root.position.x = this.x;
    this.root.position.y = this.y + gallopY;

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
