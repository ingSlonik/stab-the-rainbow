// Fix for Meta Quest WebXR stereoscopy: force standard XRWebGLLayer over experimental createProjectionLayer
try {
  if (typeof window !== 'undefined') {
    if ((window as any).XRWebGLBinding?.prototype) {
      delete (window as any).XRWebGLBinding.prototype.createProjectionLayer;
    }
    (window as any).XRWebGLBinding = undefined;
  }
} catch (_) {}

import {
  GameState,
  LANE_COUNT,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
} from './types';
import { sin, cos, max, min, floor } from './math';
import {
  initAudio,
  playStabSound,
  playFallSound,
  setAudioState,
  toggleAudio,
  toggleSfx,
} from './audio';
import { TrackManager } from './track';
import { CloudManager } from './clouds';
import { Player } from './player';
import { UIManager } from './ui';

export class Game {
  public scene: any;
  public camera: any;
  public renderer: any;

  public track: TrackManager;
  public clouds: CloudManager;
  public player: Player;
  public ui: UIManager;

  public state: GameState = GameState.MENU;
  public score = 0;
  public combo = 1;
  public speed = 18;
  public runTime = 0;
  public fallTimer = 0;
  public cloudsStabbed = 0;

  private clock: any;
  private hasWebXR = false;
  private vrSession: any = null;
  private skyMesh: any;
  private hillsGroup: any;
  private prevHeadZ = 0;
  private prevHeadY = 1.6;
  private thumbstickDebounce = false;
  private vrDomButton: HTMLButtonElement | null = null;
  private fsDomButton: HTMLButtonElement | null = null;

  // Desktop Pointer state
  private pointerNdcX = 0;
  private pointerNdcY = 0;
  private isPointerLocked = false;
  private keysDown: { [k: string]: boolean } = {};

  constructor() {
    this.clock = new THREE.Clock();

    this.initScene();
    this.initRenderer();

    this.track = new TrackManager(this.scene);
    this.clouds = new CloudManager(this.scene);
    this.player = new Player(this.scene, this.camera);
    this.ui = new UIManager(this.scene, this.camera);

    this.initLighting();
    this.initWebXR();
    this.initInput();

    window.addEventListener('resize', () => this.onResize());

    // Start main animation loop
    this.renderer.setAnimationLoop((time: number, frame: any) =>
      this.loop(time, frame)
    );
  }

  private initScene(): void {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    // Camera default head height & natural downward bird's-eye glance from the clouds
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.x = -0.10;

    this.initSky();
  }

  private createMountainRidge(
    radius: number,
    baseY: number,
    peakHeight: number,
    colorHex: number,
    freq1: number,
    freq2: number,
    phase: number
  ): any {
    const segments = 96;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array((segments + 1) * 2 * 3);
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const angle = u * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      const wave =
        Math.sin(angle * freq1 + phase) * 0.52 +
        Math.sin(angle * freq2 + phase * 1.6) * 0.36 +
        Math.cos(angle * 12 + phase) * 0.12;
      const topY = baseY + wave * peakHeight;
      const botY = baseY - 65;

      const idx = i * 2;
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = topY;
      pos[idx * 3 + 2] = z;

      pos[(idx + 1) * 3] = x;
      pos[(idx + 1) * 3 + 1] = botY;
      pos[(idx + 1) * 3 + 2] = z;

      if (i < segments) {
        indices.push(idx, idx + 1, idx + 2);
        indices.push(idx + 2, idx + 1, idx + 3);
      }
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      fog: false,
    });
    return new THREE.Mesh(geom, mat);
  }

  private initSky(): void {
    const cvs = document.createElement('canvas');
    cvs.width = 512;
    cvs.height = 512;
    const ctx = cvs.getContext('2d')!;

    // 1. Smooth atmospheric sky dome gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0.0, '#010006'); // Cosmic dark void
    skyGrad.addColorStop(0.12, '#04081c'); // Deep night
    skyGrad.addColorStop(0.24, '#091c48'); // Midnight blue
    skyGrad.addColorStop(0.38, '#1450aa'); // Rich royal blue
    skyGrad.addColorStop(0.48, '#267fe8'); // Vibrant azure sky
    skyGrad.addColorStop(0.58, '#6ec4ff'); // Bright daylight sky
    skyGrad.addColorStop(0.68, '#cce8ff'); // Horizon glow
    skyGrad.addColorStop(0.78, '#ffe4c2'); // Warm twilight glow
    skyGrad.addColorStop(1.0, '#10221a'); // Lower haze
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 512, 512);

    // 2. Cosmic stars at the top
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      const sx = (i * 79 + 29) % 512;
      const sy = ((i * 47 + 13) % 120) + 3;
      const sr = i % 4 === 0 ? 1.8 : i % 2 === 0 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Faint cosmic nebula
    const neb = ctx.createRadialGradient(256, 40, 10, 256, 40, 150);
    neb.addColorStop(0, 'rgba(170, 70, 255, 0.22)');
    neb.addColorStop(0.5, 'rgba(60, 130, 255, 0.12)');
    neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, 512, 140);

    const skyTex = new THREE.CanvasTexture(cvs);
    skyTex.wrapS = THREE.RepeatWrapping;

    const skyGeom = new THREE.SphereGeometry(140, 32, 18);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);

    // 4. Razor-sharp 3D Mountain and Rolling Hill Ridges (viewed from above in the clouds)
    this.hillsGroup = new THREE.Group();

    // Layer 1: Distant majestic mountain peaks
    this.hillsGroup.add(
      this.createMountainRidge(130, -14, 16, 0x224c74, 4, 9, 0)
    );

    // Layer 2: Mid-distance lush green mountain ridges
    this.hillsGroup.add(
      this.createMountainRidge(105, -22, 13, 0x164228, 5, 8, 1.5)
    );

    // Layer 3: Foreground rolling hill slopes
    this.hillsGroup.add(
      this.createMountainRidge(80, -28, 10, 0x0f2c1a, 6, 11, 2.7)
    );

    // Layer 4: Deep valley floor disk
    const floorGeom = new THREE.CircleGeometry(135, 32);
    floorGeom.rotateX(-Math.PI / 2);
    floorGeom.translate(0, -36, 0);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x07150d,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.hillsGroup.add(new THREE.Mesh(floorGeom, floorMat));

    // Layer 5: Cloud Sea floating below the rainbow highway
    const seaGeom = new THREE.RingGeometry(15, 130, 32);
    seaGeom.rotateX(-Math.PI / 2);
    seaGeom.translate(0, -15, 0);
    const seaMat = new THREE.MeshBasicMaterial({
      color: 0xd6eeff,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false,
    });
    this.hillsGroup.add(new THREE.Mesh(seaGeom, seaMat));

    this.scene.add(this.hillsGroup);

    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x3e719c, 0.007);
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    try {
      this.renderer.xr.setReferenceSpaceType('local-floor');
    } catch (_) {}

    document.body.appendChild(this.renderer.domElement);
  }

  private initLighting(): void {
    const ambLight = new THREE.AmbientLight(0xd2dcff, 0.75);
    this.scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
    dirLight.position.set(5, 12, 6);
    this.scene.add(dirLight);

    // Magical point light that illuminates the road from the horn
    const hornLight = new THREE.PointLight(0xfff2b0, 1.4, 15);
    hornLight.position.set(0, 0, -1.2);
    this.camera.add(hornLight);
  }

  private async initWebXR(): Promise<void> {
    if ('xr' in navigator && (navigator as any).xr) {
      try {
        this.hasWebXR = await (navigator as any).xr.isSessionSupported(
          'immersive-vr'
        );
      } catch (_) {
        this.hasWebXR = false;
      }
    }

    // VR DOM Button for 100% reliable entry from Quest Browser 2D window
    if (this.hasWebXR) {
      const vrBtn = document.createElement('button');
      vrBtn.id = 'vr-btn';
      vrBtn.className = 'hud-btn';
      vrBtn.innerHTML = '🥽 ENTER VR';
      vrBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.requestVRSession();
      });
      document.body.appendChild(vrBtn);
      this.vrDomButton = vrBtn;
    }

    // Fullscreen DOM Button
    const fsBtn = document.createElement('button');
    fsBtn.id = 'fs-btn';
    fsBtn.className = 'hud-btn';
    fsBtn.innerHTML = '⛶ FULLSCREEN (F)';
    fsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });
    document.body.appendChild(fsBtn);
    this.fsDomButton = fsBtn;

    // Bind VR Controllers: Trigger = stab, Grip = jump
    const setupController = (c: any) => {
      c.addEventListener('selectstart', () => {
        if (this.state === GameState.PLAYING) {
          this.player.stab();
        } else {
          this.handleActionTrigger();
        }
      });
      c.addEventListener('squeezestart', () => {
        if (this.state === GameState.PLAYING) {
          this.player.jump();
        }
      });
      this.scene.add(c);
    };

    setupController(this.renderer.xr.getController(0));
    setupController(this.renderer.xr.getController(1));
  }

  public toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  public async requestVRSession(): Promise<void> {
    if (!this.hasWebXR) return;
    try {
      initAudio();
      const session = await (navigator as any).xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      this.vrSession = session;
      await this.renderer.xr.setSession(session);

      if (this.vrDomButton) this.vrDomButton.style.display = 'none';
      if (this.fsDomButton) this.fsDomButton.style.display = 'none';

      session.addEventListener('end', () => {
        this.vrSession = null;
        if (this.vrDomButton) this.vrDomButton.style.display = 'block';
        if (this.fsDomButton) this.fsDomButton.style.display = 'block';
      });

      this.startGame();
    } catch (err) {
      console.warn('VR session request error:', err);
    }
  }

  private initInput(): void {
    window.addEventListener('mousemove', (e) => {
      this.pointerNdcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdcY = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
        this.ui.updateHover(this.pointerNdcX, this.pointerNdcY);
      } else if (this.state === GameState.PLAYING) {
        // Steer with mouse only if active mouse movement detected
        if (Math.abs(e.movementX) > 1 || Math.abs(e.movementY) > 1) {
          this.player.setTargetX(this.pointerNdcX * 1.05);
        }

        // Tilt camera slightly with mouse on desktop (angled downwards to see mountains below)
        if (!this.renderer.xr.isPresenting) {
          this.camera.rotation.y = -this.pointerNdcX * 0.28;
          this.camera.rotation.x = -0.10 + this.pointerNdcY * 0.22;
        }
      }
    });

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousedown', (e) => {
      initAudio();
      this.pointerNdcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdcY = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
        this.ui.updateHover(this.pointerNdcX, this.pointerNdcY);
      }

      if (e.button === 2) {
        // Right mouse button: JUMP
        if (this.state === GameState.PLAYING) {
          this.player.jump();
        }
      } else if (e.button === 0) {
        // Left mouse button: STAB in playing, or click UI in menu/gameover
        if (this.state === GameState.PLAYING) {
          this.player.stab();
        } else {
          this.handleActionTrigger();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      this.keysDown[e.code] = true;
      initAudio();

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        if (this.state === GameState.PLAYING) {
          this.player.shiftLane(-1);
        }
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        if (this.state === GameState.PLAYING) {
          this.player.shiftLane(1);
        }
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (this.state === GameState.PLAYING) {
          this.player.jump();
        }
      } else if (
        e.code === 'ArrowDown' ||
        e.code === 'KeyS' ||
        e.code === 'KeyE' ||
        e.code === 'Enter' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        e.preventDefault();
        if (this.state === GameState.PLAYING) {
          this.player.stab();
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (this.state === GameState.PLAYING) {
          this.player.jump();
        } else if (this.state === GameState.MENU) {
          this.startGame();
        } else if (this.state === GameState.GAMEOVER) {
          this.restartGame();
        }
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleAudio();
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        toggleSfx();
      } else if (e.code === 'KeyH' || e.code === 'Escape') {
        if (this.state === GameState.GAMEOVER) {
          this.goToMenu();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown[e.code] = false;
    });

    // Touch support for mobile
    window.addEventListener('touchstart', (e) => {
      initAudio();
      if (e.touches.length > 0) {
        const t = e.touches[0];
        this.pointerNdcX = (t.clientX / window.innerWidth) * 2 - 1;
        this.pointerNdcY = -(t.clientY / window.innerHeight) * 2 + 1;
        if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
          this.ui.updateHover(this.pointerNdcX, this.pointerNdcY);
        }
      }
      if (this.state === GameState.PLAYING) {
        this.player.stab();
      } else {
        this.handleActionTrigger();
      }
    });
  }

  private handleActionTrigger(): void {
    if (this.state === GameState.MENU) {
      if (!this.ui.triggerClick()) {
        this.startGame();
      }
    } else if (this.state === GameState.PLAYING) {
      this.player.jump();
    } else if (this.state === GameState.GAMEOVER) {
      if (!this.ui.triggerClick()) {
        this.restartGame();
      }
    }
  }

  public goToMenu(): void {
    this.state = GameState.MENU;
    this.score = 0;
    this.combo = 1;
    this.speed = 18;
    this.runTime = 0;
    this.cloudsStabbed = 0;
    this.track.reset();
    this.clouds.reset();
    this.player.reset();
  }

  public startGame(): void {
    this.state = GameState.PLAYING;
    this.score = 0;
    this.combo = 1;
    this.speed = 18;
    this.runTime = 0;
    this.cloudsStabbed = 0;
    this.track.reset();
    this.clouds.reset();
    this.player.reset();
  }

  public restartGame(): void {
    this.startGame();
  }

  private onResize(): void {
    if (this.renderer?.xr?.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private checkHornCloudCollisions(): void {
    const hornTipPos = this.player.getHornTipPosition();

    for (const c of this.clouds.clouds) {
      if (c.stabbed || c.popping) continue;

      // Distance from horn tip to cloud center
      const dx = hornTipPos.x - c.x;
      const dy = hornTipPos.y - c.y;
      const dz = hornTipPos.z - c.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      // True physical contact with cloud boundary
      const hitRadius = c.radius + 0.1;
      if (distSq <= hitRadius * hitRadius) {
        // Without active horn stab, the cloud simply passes by and does not count
        if (this.player.isStabbing) {
          this.clouds.popCloud(c);
          this.cloudsStabbed++;

          // Replenish the corresponding color lane
          this.track.replenishLane(c.colorIdx);

          // Sound & score
          playStabSound(c.colorIdx);
          this.score += 150 * this.combo;
          this.combo = min(8, this.combo + 1);
          break;
        }
      }
    }
  }

  private checkTrackFall(): void {
    if (this.player.isGrounded && !this.player.isFalling) {
      const effectiveX =
        this.player.x +
        (this.renderer.xr.isPresenting ? this.camera.position.x : 0);
      const laneIdx = this.track.getLaneIndexFromX(effectiveX);
      this.player.currentLane = laneIdx;

      if (!this.track.isLaneSolid(laneIdx)) {
        // Stepped onto a void lane! FALLING
        this.state = GameState.FALLING;
        this.fallTimer = 0;
        this.player.startFalling();
        playFallSound();
        this.ui.setGameOverDeathQuote();
        this.ui.saveHighScore(this.score);
      }
    }
  }

  private loop(timestamp: number, frame: any): void {
    const dt = min(0.08, this.clock.getDelta());
    const totalTime = this.clock.getElapsedTime();

    // 0. VR 6DOF Head Motion & Controller Input
    if (this.renderer.xr.isPresenting) {
      // Head forward thrust = STAB!
      const curHeadZ = this.camera.position.z;
      const headVelZ = (curHeadZ - this.prevHeadZ) / max(0.001, dt);
      this.prevHeadZ = curHeadZ;
      if (headVelZ < -0.40 && this.state === GameState.PLAYING) {
        this.player.stab();
      }

      // Head upward motion = physical JUMP!
      const curHeadY = this.camera.position.y;
      const headVelY = (curHeadY - this.prevHeadY) / max(0.001, dt);
      this.prevHeadY = curHeadY;
      if (headVelY > 1.4 && this.state === GameState.PLAYING) {
        this.player.jump();
      }

      // VR Controller Thumbstick support for lane shifting
      const session = this.renderer.xr.getSession();
      if (session) {
        for (const source of session.inputSources) {
          if (source.gamepad && source.gamepad.axes) {
            const axes = source.gamepad.axes;
            const stickX = axes.length >= 3 ? axes[2] : 0;
            if (Math.abs(stickX) > 0.55) {
              if (!this.thumbstickDebounce && this.state === GameState.PLAYING) {
                this.player.shiftLane(stickX > 0 ? 1 : -1);
                this.thumbstickDebounce = true;
              }
            } else if (Math.abs(stickX) < 0.2) {
              this.thumbstickDebounce = false;
            }

            const stickY = axes.length >= 4 ? axes[3] : 0;
            if (stickY < -0.65 && this.state === GameState.PLAYING) {
              this.player.jump();
            }
          }
        }
      }
    }

    // Sky and hills follow camera position so player is always centered in the world
    if (this.skyMesh) {
      this.skyMesh.position.copy(this.camera.position);
    }
    if (this.hillsGroup) {
      this.hillsGroup.position.x = this.camera.position.x;
      this.hillsGroup.position.z = this.camera.position.z;
    }

    // Sync audio engine with state, airborne jumping status, and run speed
    setAudioState(this.state, this.player.isGrounded, this.speed ? this.speed / 18 : 1.0);

    // State-specific logic
    if (this.state === GameState.MENU) {
      // Attract/Demo mode: Gentle auto-gallop and scenic sway
      const demoSpeed = 15;
      const demoAutoX = sin(totalTime * 0.8) * 2.2;
      this.player.setTargetX(demoAutoX / 3.5);
      this.player.update(dt, demoSpeed, true);
      this.track.update(dt, demoSpeed, totalTime, 60, true);
      this.clouds.update(dt, demoSpeed, totalTime);

      this.ui.renderUI(
        GameState.MENU,
        0,
        this.track.laneHealth,
        -1,
        totalTime,
        this.hasWebXR,
        () => this.startGame(),
        () => this.requestVRSession(),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        this.renderer?.xr?.isPresenting || false
      );
    } else if (this.state === GameState.PLAYING) {
      this.runTime += dt;
      // Progressive difficulty acceleration
      this.speed = min(36, 18 + this.runTime * 0.28);
      this.score += floor(this.speed * dt * 2.5);

      this.player.update(dt, this.speed, true);
      this.track.update(dt, this.speed, totalTime, this.runTime);
      this.clouds.update(
        dt,
        this.speed,
        totalTime,
        this.track.getUrgentLane()
      );

      this.checkHornCloudCollisions();
      this.checkTrackFall();

      this.ui.renderUI(
        GameState.PLAYING,
        this.score,
        this.track.laneHealth,
        this.track.getUrgentLane(),
        totalTime,
        this.hasWebXR,
        () => this.startGame(),
        () => this.requestVRSession(),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        this.renderer?.xr?.isPresenting || false
      );
    } else if (this.state === GameState.FALLING) {
      this.fallTimer += dt;
      this.player.update(dt, this.speed * 0.4, false);
      this.track.update(dt, this.speed * 0.4, totalTime, this.runTime);
      this.clouds.update(dt, this.speed * 0.4, totalTime);

      if (this.fallTimer >= 1.2) {
        this.state = GameState.GAMEOVER;
      }

      this.ui.renderUI(
        GameState.FALLING,
        this.score,
        this.track.laneHealth,
        -1,
        totalTime,
        this.hasWebXR,
        () => this.startGame(),
        () => this.requestVRSession(),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        this.renderer?.xr?.isPresenting || false
      );
    } else if (this.state === GameState.GAMEOVER) {
      this.ui.renderUI(
        GameState.GAMEOVER,
        this.score,
        this.track.laneHealth,
        -1,
        totalTime,
        this.hasWebXR,
        () => this.startGame(),
        () => this.requestVRSession(),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        this.renderer?.xr?.isPresenting || false
      );
    }

    // 3. Render Three.js scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Auto-boot
export const bootGame = () => {
  if (!(window as any)._g && window.THREE) {
    (window as any)._g = new Game();
  }
};
(window as any).bootGame = bootGame;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootGame);
} else {
  bootGame();
}
