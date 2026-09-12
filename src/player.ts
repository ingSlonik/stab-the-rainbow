import { sin, max, min, clamp, lerp, HALF_PI } from './math';
import { playJumpSound } from './audio';

import { LANE_COUNT, LANE_WIDTH, TRACK_WIDTH, GameMode, RAINBOW_COLORS } from './types';

const THREE = (window as any).THREE; // || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class Player {
  public root: any;
  public cameraRig: any;
  public camera: any;
  public horn: any;
  public hornTip: any;
  public vrMode: GameMode = GameMode.DESKTOP;
  public vrController: any = null;

  public groundMarker: any;
  private groundMarkerMat: any;

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
  // Reusable vectors for raycasting and world calculations (zero runtime garbage)
  private tempV1: any;
  private tempV2: any;
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
    this.tempV1 = new THREE.Vector3();
    this.tempV2 = new THREE.Vector3();
    this.initHorn();
    this.initGroundMarker(scene);

    // Default desktop mount on camera
    this.camera.add(this.horn);
  }

  private initGroundMarker(scene: any): void {
    this.groundMarker = new THREE.Group();
    this.groundMarker.rotation.x = -0.03;

    const getMat = (color: number) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    })

    this.groundMarkerMat = getMat(0x10e052);
    const whiteMat = getMat(0xffffff);

    const addMesh = (geom: any, mat: any) => {
      geom.rotateX(-HALF_PI);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 60;
      this.groundMarker.add(mesh);
    };

    // 1. Outer glowing starlight ring (renderOrder 60)
    addMesh(new THREE.RingGeometry(0.18, 0.24, 42), this.groundMarkerMat);
    addMesh(new THREE.RingGeometry(0.08, 0.12, 42), whiteMat);
    // 2. Central disc fill
    addMesh(new THREE.CircleGeometry(0.06, 16), this.groundMarkerMat);

    /* 13KB bundle optimization: Inner concentric ring and line chevron commented out
    const arrowGeom = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.09, 0.002, -0.04,
      0.00, 0.002, -0.16,
      0.09, 0.002, -0.04,
    ]);
    arrowGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const arrowMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
      linewidth: 3,
    });
    const arrowLine = new THREE.Line(arrowGeom, arrowMat);
    arrowLine.renderOrder = 61;
    this.groundMarker.add(arrowLine);
    */

    // 5. Lateral boundary brackets (+/- LANE_WIDTH / 2) showing precise lane occupancy
    /*const bracketGeom = new THREE.BufferGeometry();
    const halfW = LANE_WIDTH * 0.49; // ~0.196m
    const bracketVerts = new Float32Array([
      -halfW, 0.002, -0.12,
      -halfW, 0.002,  0.12,
       halfW, 0.002, -0.12,
       halfW, 0.002,  0.12,
    ]);
    bracketGeom.setAttribute('position', new THREE.BufferAttribute(bracketVerts, 3));
    const bracketLines = new THREE.LineSegments(bracketGeom, arrowMat);
    bracketLines.renderOrder = 61;
    this.groundMarker.add(bracketLines);
    */

    this.groundMarker.visible = true;
    scene.add(this.groundMarker);
  }

  private initHorn(): void {
    this.horn = new THREE.Group();

    // Elegant crystal unicorn horn (0.78m length, comfortable proportion)
    const coneLength = 0.78;
    const coneGeom = new THREE.ConeGeometry(0.032, coneLength, 20, 1);
    coneGeom.rotateX(-HALF_PI);
    coneGeom.translate(0, 0, -coneLength / 2);

    this.hornMat = new THREE.MeshStandardMaterial({
      color: 0xfffcf5,
      emissive: 0xffe899,
      emissiveIntensity: 0.42,
      roughness: 0.15,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
      depthTest: true,
      depthWrite: true,
    });

    const hornMesh = new THREE.Mesh(coneGeom, this.hornMat);
    hornMesh.renderOrder = 70;
    this.horn.add(hornMesh);

    // Glowing tip at the apex
    const tipGeom = new THREE.SphereGeometry(0.024, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: true,
      depthWrite: true,
    });
    this.hornTip = new THREE.Mesh(tipGeom, tipMat);
    this.hornTip.position.set(0, 0, -coneLength);
    this.hornTip.renderOrder = 71;
    this.horn.add(this.hornTip);

    // Magical starlight pointer beam extending from horn tip for VR interaction (unit length 1.0)
    const beamGeom = new THREE.ConeGeometry(0.016, 1.0, 8);
    beamGeom.rotateX(-HALF_PI);
    beamGeom.translate(0, 0, -0.5);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.85,
    });
    this.pointerBeam = new THREE.Mesh(beamGeom, beamMat);
    this.pointerBeam.renderOrder = 72;
    this.pointerBeam.visible = false;
    this.hornTip.add(this.pointerBeam);

    // Default desktop placement: offset to lower right, angled toward center
    this.horn.position.set(0, -0.42, -0.48);
    this.horn.rotation.set(0.38, 0, 0);
  }

  public setVRController(controller: any): void {
    this.vrController = controller;
  }

  private mountHorn(parent: any, py: number, pz: number, rx: number, scale = 1.0, showPointer = false): void {
    if (!parent) return;
    if (this.horn.parent !== parent) {
      if (this.horn.parent) this.horn.parent.remove(this.horn);
      parent.add(this.horn);
    }
    this.horn.position.set(0, py, pz);
    this.horn.rotation.set(rx, 0, 0);
    this.horn.scale.set(scale, scale, scale);
    if (this.pointerBeam) this.pointerBeam.visible = showPointer;
  }

  public attachHornToHand(controller?: any, showPointer: boolean = false): void {
    this.mountHorn(controller || this.vrController, -0.02, -0.08, -0.65, 1.0, showPointer);
  }

  public attachHornToHead(): void {
    this.mountHorn(this.camera, 0.22, -0.15, -0.16, 0.75, false);
  }

  public attachHornToDesktop(): void {
    this.mountHorn(this.camera, -0.42, -0.48, 0.38, 1.0, false);
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

    // Sdružené znovupoužití vektorů namísto per-frame alokací pro raycasting
    this.horn.getWorldPosition(this.tempV1);
    this.hornTip.getWorldPosition(this.tempV2);

    outOrigin.copy(this.tempV2);
    outDir.subVectors(this.tempV2, this.tempV1).normalize();
    return true;
  }

  public updatePointerBeam(hitPoint?: any): void {
    if (!this.pointerBeam || !this.pointerBeam.visible) return;
    if (hitPoint && this.hornTip) {
      this.hornTip.getWorldPosition(this.tempV1);
      const dist = this.tempV1.distanceTo(hitPoint);
      this.pointerBeam.scale.set(1, 1, max(0.1, dist));
    } else {
      this.pointerBeam.scale.set(1, 1, 3.5);
    }
  }

  public setVRMode(mode: GameMode, controller?: any): void {
    this.vrMode = mode;
    if (controller) this.vrController = controller;
    this.isCalibrated = false;
    this.prevHeadZ = this.prevHeadY = this.prevHeadPitch = 0;

    // Sjednocené nastavení výšky camera rigu: 2.05m pro desktop, 0.85m pro VR režimy
    this.cameraRig.position.set(0, mode === GameMode.DESKTOP ? 2.05 : 0.85, 0);

    if (mode === GameMode.VR_EASY) {
      this.attachHornToHand(undefined, false);
    } else if (mode === GameMode.VR_HARD) {
      this.attachHornToHead();
    } else {
      this.attachHornToDesktop();
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
      if (this.root) {
        this.root.updateMatrixWorld(true);
      } else if (this.camera?.parent) {
        this.camera.parent.updateMatrixWorld(true);
      }
      if (this.camera) {
        this.camera.updateMatrixWorld(true);
      }
      if (this.horn) {
        this.horn.updateMatrixWorld(true);
      }
      this.hornTip.updateMatrixWorld(true);
      this.hornTip.getWorldPosition(this.hornTipWorldPos);
    }
    return this.hornTipWorldPos;
  }

  public getPlayerWorldX(): number {
    if (this.vrMode === GameMode.VR_HARD) {
      return this.getHornTipPosition().x;
    } else if (this.vrMode === GameMode.VR_EASY) {
      if (this.camera) {
        if (this.camera.parent) this.camera.parent.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        // Sdružené znovupoužití vektoru pro snímání pozice hlavy v reálném čase
        this.camera.getWorldPosition(this.tempV1);
        return this.tempV1.x;
      }
      return this.getHornTipPosition().x;
    }
    return this.x;
  }

  // 13KB optimization: Legacy methods shiftLane and moveLateral replaced by physical stepping & mouse steering
  /*
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
  */

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
    // Sdružené řetězené nulování stavů a parametrů hráče
    this.x = this.y = this.targetX = this.vy = this.stabTimer = 0;
    this.prevHeadZ = this.prevHeadY = this.prevHeadPitch = 0;
    this.isGrounded = true;
    this.isFalling = this.isFallen = this.isStabbing = this.isCalibrated = false;
    this.currentLane = 3;

    const isDesktop = !isVR && this.vrMode === GameMode.DESKTOP;
    this.root.position.set(0, isDesktop ? 2.05 : 0.85, 0);
    this.root.rotation.set(0, 0, 0);
    if (this.hornMat) this.hornMat.emissiveIntensity = 0.36;
    if (this.hornTip) this.hornTip.scale.set(1, 1, 1);
    if (this.pointerBeam) this.pointerBeam.visible = false;
  }

  public update(
    dt: number,
    speed: number,
    isMoving: boolean,
    isVR: boolean = false,
    isPlaying: boolean = true,
    isLaneSolid: boolean = true
  ): void {
    // 0. Horn thrust animation on stab (sdružený výpočet fází nápřahu a návratu)
    let thrustOffset = 0;
    if (this.stabTimer > 0) {
      this.stabTimer -= dt;
      if (this.stabTimer <= 0) {
        this.stabTimer = 0;
        this.isStabbing = false;
      } else {
        const progress = 1 - this.stabTimer / this.STAB_DURATION;
        thrustOffset = (progress < 0.35 ? progress / 0.35 : (1 - progress) / 0.65) * 0.58;
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
      const m = this.camera.matrixWorld.elements;
      const curHeadX = m[12];
      const curHeadY = m[13] - this.y;
      const curHeadZ = m[14];

      if (!this.isCalibrated) {
        this.calibratedHeadX = curHeadX;
        this.calibratedHeadY = curHeadY;
        this.prevHeadZ = curHeadZ;
        this.prevHeadY = curHeadY;
        this.prevHeadPitch = -m[9];
        this.isCalibrated = true;
      }

      // Lateral head position / physical side-steps steer across lanes (amplified for comfortable room scale)
      const headLeanX = curHeadX - this.calibratedHeadX;
      const targetNormX = clamp(headLeanX * 3.0, -1.0, 1.0);
      this.setTargetX(targetNormX);

      // Physical vertical leap triggers JUMP across both Easy and Hard VR modes
      const headVelY = (curHeadY - this.prevHeadY) / max(0.001, dt);
      this.prevHeadY = curHeadY;
      if (headVelY > 1.20 && !this.isFalling && this.isGrounded) {
        this.jump();
      }

      // Hard mode: Head forward thrust ("headbutt") or nod triggers STAB
      if (this.vrMode === GameMode.VR_HARD) {
        const headVelZ = (curHeadZ - this.prevHeadZ) / max(0.001, dt);
        this.prevHeadZ = curHeadZ;

        const curHeadPitch = -m[9];
        const pitchVel = (curHeadPitch - this.prevHeadPitch) / max(0.001, dt);
        this.prevHeadPitch = curHeadPitch;

        if ((headVelZ < -0.70 || pitchVel < -2.2) && !this.isFalling && !this.isStabbing) {
          this.stab();
        }
      }
    }

    // 2. Lateral positioning
    if (isVR) {
      this.x = this.getPlayerWorldX();
    } else {
      this.x = lerp(this.x, this.targetX, min(1, dt * 14));
    }
    this.currentLane = clamp(Math.round(this.x / LANE_WIDTH + 3), 0, LANE_COUNT - 1);

    // 3. Vertical Jump & Gravity physics (sdružená integrace vertikální rychlosti pádu i skoku)
    if (this.isFalling || (!this.isGrounded && !this.isFallen)) {
      this.y += this.vy * dt;
      this.vy -= (this.isFalling ? 22 : 20) * dt;

      if (!this.isFalling && this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isGrounded = true;
      }
    }

    // 4. Gallop bobbing
    const isGalloping = this.isGrounded && isMoving && !this.isFalling && !this.isFallen;
    if (isGalloping) {
      this.gallopTimer += dt * speed * 1.5;
    }
    const gallopY = isGalloping && !isVR ? sin(this.gallopTimer) * 0.012 : 0;

    // 5. Update root position & orientation
    const isDesktop = this.vrMode === GameMode.DESKTOP;
    const baseH = isDesktop ? 2.05 : 0.85;

    // In VR: camera rig stays centered at x=0 so physical room-scale movement maps directly to the track
    this.root.position.x = isVR ? 0 : this.x;
    this.root.position.y = baseH + this.y + gallopY;
    this.root.rotation.set(0, 0, 0);

    // 6. Update Ground Position Marker
    if (this.groundMarker) {
      if (!isPlaying || this.isFalling || this.isFallen) {
        this.groundMarker.visible = false;
      } else {
        this.groundMarker.visible = true;
        const markerZ = -1.40;
        const trackY = 0.60 - sin((-markerZ) * 0.02) * 1.5;
        // Optically elevated to hover cleanly 3cm above the rainbow surface
        const hoverY = trackY + 0.03;
        this.groundMarker.position.set(this.x, hoverY, markerZ);

        // Color matches current lane, or flashing red if lane is void (0%)
        const col = isLaneSolid ? RAINBOW_COLORS[this.currentLane] : 0xff2a4b;
        if (this.groundMarkerMat) {
          this.groundMarkerMat.color.setHex(col);
          const jumpOpacity = this.isGrounded ? 0.88 : max(0.40, 0.88 - this.y * 0.08);
          this.groundMarkerMat.opacity = jumpOpacity;
        }

        // Landing target scale mod on jump
        const jumpScale = this.isGrounded ? 1.0 : (1.0 + min(0.35, this.y * 0.08));
        this.groundMarker.scale.set(jumpScale, 1.0, jumpScale);
      }
    }
  }
}
