// Enforce standard WebXR XRWebGLLayer on Meta Quest (matches https://immersive-web.github.io/webxr-samples/immersive-vr-session.html)
if (typeof window !== 'undefined') {
  try {
    if (typeof (window as any).XRWebGLBinding !== 'undefined') {
      delete (window as any).XRWebGLBinding.prototype.createProjectionLayer;
      try {
        Object.defineProperty((window as any).XRWebGLBinding.prototype, 'createProjectionLayer', {
          value: undefined,
          configurable: true,
        });
      } catch (_) {}
    }
  } catch (_) {}
  try {
    Object.defineProperty(window, 'XRWebGLBinding', {
      value: undefined,
      configurable: true,
    });
  } catch (_) {}
}

import {
  GameState,
  VRMode,
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
  getAudioMuted,
  getSfxMuted,
} from './audio';
import {
  speakQuip,
  getRandomStartQuip,
  getRandomStabQuip,
  getRandomComboQuip,
} from './quips';
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
  public currentVRMode: VRMode = VRMode.NONE;
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
  private prevHeadY = 0;
  private thumbstickDebounce = false;

  // Desktop Pointer state
  private pointerNdcX = 0;
  private pointerNdcY = 0;
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
    this.initDOM();
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
    cvs.width = 16;
    cvs.height = 256;
    const ctx = cvs.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#040011');
    grad.addColorStop(0.35, '#150630');
    grad.addColorStop(0.62, '#2f155c');
    grad.addColorStop(0.82, '#6c2b7e');
    grad.addColorStop(0.94, '#b04a75');
    grad.addColorStop(1.0, '#f28e6b');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 256);

    const skyTex = new THREE.CanvasTexture(cvs);
    const skyGeom = new THREE.SphereGeometry(180, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.skyMesh);

    // Dynamic Parallax Horizon Mountains
    this.hillsGroup = new THREE.Group();

    // Layer 1: Distant dark jagged silhouette peaks
    this.hillsGroup.add(
      this.createMountainRidge(155, -8, 22, 0x180932, 5, 11, 0.4)
    );

    // Layer 2: Mid-distance violet twilight ridges
    this.hillsGroup.add(
      this.createMountainRidge(130, -14, 18, 0x2e114d, 7, 13, 1.8)
    );

    // Layer 3: Closer alpine ridge
    this.hillsGroup.add(
      this.createMountainRidge(105, -20, 15, 0x481b66, 9, 17, 3.2)
    );

    // Layer 4: Soft dreamy magenta foothills
    this.hillsGroup.add(
      this.createMountainRidge(80, -25, 12, 0x6e2874, 11, 19, 4.5)
    );

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
      xrCompatible: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    try {
      this.renderer.xr.setReferenceSpaceType('local');
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
    hornLight.position.set(0, 0, -0.6);
    this.player.horn.add(hornLight);
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

    // Bind VR Controllers: Trigger = stab (playing) or restart (gameover), Grip = jump (playing) or menu (gameover)
    const setupController = (c: any) => {
      c.addEventListener('selectstart', () => {
        if (this.state === GameState.PLAYING) {
          this.player.stab();
        } else if (this.state === GameState.GAMEOVER) {
          this.restartGame();
        }
      });
      c.addEventListener('squeezestart', () => {
        if (this.state === GameState.PLAYING) {
          this.player.jump();
        } else if (this.state === GameState.GAMEOVER) {
          this.goToMenu();
        }
      });
      this.player.cameraRig.add(c);
    };

    setupController(this.renderer.xr.getController(0));
    setupController(this.renderer.xr.getController(1));
  }

  private initDOM(): void {
    const vrEasyBtn = document.getElementById('btn-vr-easy');
    if (vrEasyBtn) {
      vrEasyBtn.addEventListener('click', () => {
        if (this.hasWebXR) {
          this.requestVRSession(VRMode.RIDER_EASY);
        } else {
          alert(
            'WebXR brýle nebyly detekovány. Pro plný VR zážitek otevřete tuto stránku v prohlížeči v Meta Quest.\n\nHra se nyní spustí na desktopu.'
          );
          this.startGame();
        }
      });
    }

    const vrHardBtn = document.getElementById('btn-vr-hard');
    if (vrHardBtn) {
      vrHardBtn.addEventListener('click', () => {
        if (this.hasWebXR) {
          this.requestVRSession(VRMode.UNICORN_HARD);
        } else {
          alert(
            'WebXR brýle nebyly detekovány. Pro plný VR zážitek otevřete tuto stránku v prohlížeči v Meta Quest.\n\nHra se nyní spustí na desktopu.'
          );
          this.startGame();
        }
      });
    }

    const pcBtn = document.getElementById('btn-desktop');
    if (pcBtn) {
      pcBtn.addEventListener('click', () => {
        this.startGame();
      });
    }

    const retryBtn = document.getElementById('btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.restartGame();
      });
    }

    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        this.goToMenu();
      });
    }

    const musicBtn = document.getElementById('btn-music');
    if (musicBtn) {
      musicBtn.addEventListener('click', () => {
        toggleAudio();
        musicBtn.textContent = `🎵 HUDBA: ${getAudioMuted() ? 'VYP' : 'ZAP'}`;
      });
    }

    const sfxBtn = document.getElementById('btn-sfx');
    if (sfxBtn) {
      sfxBtn.addEventListener('click', () => {
        toggleSfx();
        sfxBtn.textContent = `🔊 ZVUKY: ${getSfxMuted() ? 'VYP' : 'ZAP'}`;
      });
    }

    const fsBtn = document.getElementById('btn-fs');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    const highBadge = document.getElementById('high-score');
    if (highBadge) {
      highBadge.textContent = `🏆 NEJLEPŠÍ SKÓRE: ${this.ui.getHighScore()}`;
    }
  }

  public toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  public async requestVRSession(mode: VRMode = VRMode.RIDER_EASY): Promise<void> {
    if (!this.hasWebXR) return;
    try {
      initAudio();
      this.currentVRMode = mode;

      // Standard WebXR immersive-vr session matching https://immersive-web.github.io/webxr-samples/immersive-vr-session.html
      const session = await (navigator as any).xr.requestSession('immersive-vr', {
        optionalFeatures: ['local', 'hand-tracking'],
      });
      this.vrSession = session;

      // Wrap requestReferenceSpace with fallback to 'local' for maximum device compatibility
      const origRequestReferenceSpace = session.requestReferenceSpace.bind(session);
      session.requestReferenceSpace = async (type: string) => {
        try {
          return await origRequestReferenceSpace(type);
        } catch (err) {
          console.warn(`Reference space '${type}' unavailable, falling back to 'local':`, err);
          return await origRequestReferenceSpace('local');
        }
      };

      try {
        this.renderer.xr.setReferenceSpaceType('local');
      } catch (_) {}

      await this.renderer.xr.setSession(session);

      // Reset camera transforms for pristine WebXR headset tracking
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      this.camera.quaternion.set(0, 0, 0, 1);

      // Configure player with chosen VR mode and primary controller
      const primaryController = this.renderer.xr.getController(0);
      this.player.setVRMode(mode, primaryController);

      const modal = document.getElementById('modal');
      if (modal) modal.style.display = 'none';
      const goModal = document.getElementById('go-modal');
      if (goModal) goModal.style.display = 'none';

      // If Hard mode, speak funny start quip
      if (mode === VRMode.UNICORN_HARD) {
        const startQuip = getRandomStartQuip();
        this.ui.setQuip(startQuip);
        speakQuip(startQuip, true);
      }

      session.addEventListener('end', () => {
        this.vrSession = null;
        this.currentVRMode = VRMode.NONE;
        this.player.setVRMode(VRMode.NONE);
        this.camera.position.set(0, 0.15, 0);
        this.camera.rotation.set(-0.10, 0, 0);
        if (this.state === GameState.MENU) {
          const m = document.getElementById('modal');
          if (m) m.style.display = 'flex';
        }
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

      if (this.state === GameState.PLAYING) {
        // Direct mouse steering across lanes
        this.player.setTargetX(this.pointerNdcX * 1.05);

        // Tilt camera slightly with mouse on desktop
        if (!this.renderer.xr.isPresenting) {
          this.camera.rotation.y = -this.pointerNdcX * 0.25;
          this.camera.rotation.x = -0.10 + this.pointerNdcY * 0.20;
        }
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.state === GameState.PLAYING) {
          this.player.jump();
        }
      },
      { passive: true }
    );

    // Prevent context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousedown', (e) => {
      initAudio();
      if (this.state === GameState.PLAYING) {
        if (e.button === 2) {
          // Right mouse button: JUMP
          this.player.jump();
        } else if (e.button === 0) {
          // Left mouse button: STAB
          this.player.stab();
        } else if (e.button === 1) {
          // Middle click: JUMP
          this.player.jump();
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
        } else if (this.state === GameState.GAMEOVER) {
          this.restartGame();
        }
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleAudio();
        const musicBtn = document.getElementById('btn-music');
        if (musicBtn)
          musicBtn.textContent = `🎵 HUDBA: ${getAudioMuted() ? 'VYP' : 'ZAP'}`;
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        toggleSfx();
        const sfxBtn = document.getElementById('btn-sfx');
        if (sfxBtn)
          sfxBtn.textContent = `🔊 ZVUKY: ${getSfxMuted() ? 'VYP' : 'ZAP'}`;
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
      if (this.state === GameState.PLAYING) {
        this.player.stab();
      }
    });
  }

  public goToMenu(): void {
    const goModal = document.getElementById('go-modal');
    if (goModal) goModal.style.display = 'none';
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'flex';

    const highBadge = document.getElementById('high-score');
    if (highBadge) {
      highBadge.textContent = `🏆 NEJLEPŠÍ SKÓRE: ${this.ui.getHighScore()}`;
    }

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
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
    const goModal = document.getElementById('go-modal');
    if (goModal) goModal.style.display = 'none';

    this.state = GameState.PLAYING;
    this.score = 0;
    this.combo = 1;
    this.speed = 18;
    this.runTime = 0;
    this.cloudsStabbed = 0;
    this.track.reset();
    this.clouds.reset();
    this.player.reset();

    if (this.currentVRMode === VRMode.UNICORN_HARD) {
      const startQuip = getRandomStartQuip();
      this.ui.setQuip(startQuip);
      speakQuip(startQuip, true);
    }
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
    const isAirborne = !this.player.isGrounded;

    const clouds = this.clouds.clouds;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      if (c.stabbed || c.popping) continue;

      const dx = hornTipPos.x - c.x;
      const dy = hornTipPos.y - c.y;
      const dz = hornTipPos.z - c.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const hitDist = this.player.isStabbing
        ? (this.currentVRMode === VRMode.RIDER_EASY ? 1.85 : 1.6)
        : 0.88;
      if (dist < hitDist) {
        if (this.player.isStabbing || isAirborne) {
          c.stabbed = true;
          this.clouds.popCloud(c);
          this.track.replenishLane(c.colorIdx);
          this.cloudsStabbed++;
          playStabSound(c.colorIdx);
          this.score += 150 * this.combo;
          this.combo = min(8, this.combo + 1);

          // Hard mode humorous quips on cloud stabbing
          if (this.currentVRMode === VRMode.UNICORN_HARD) {
            if (this.combo >= 3 && Math.random() < 0.6) {
              const q = getRandomComboQuip();
              this.ui.setQuip(q);
              speakQuip(q);
            } else if (Math.random() < 0.4) {
              const q = getRandomStabQuip();
              this.ui.setQuip(q);
              speakQuip(q);
            }
          }
          break;
        }
      }
    }
  }

  private checkTrackFall(): void {
    if (this.player.isGrounded && !this.player.isFalling) {
      const effectiveX = this.player.x;
      const laneIdx = this.track.getLaneIndexFromX(effectiveX);
      this.player.currentLane = laneIdx;

      if (!this.track.isLaneSolid(laneIdx)) {
        // Stepped onto a void lane! FALLING
        this.state = GameState.FALLING;
        this.fallTimer = 0;
        this.player.startFalling();
        playFallSound();
        const isHard = this.currentVRMode === VRMode.UNICORN_HARD;
        this.ui.setGameOverDeathQuote(isHard);
        if (isHard) {
          speakQuip(this.ui.getLastQuote(), true);
        }
        this.ui.saveHighScore(this.score);
      }
    }
  }

  private loop(timestamp: number, frame: any): void {
    const dt = min(0.08, this.clock.getDelta());
    const totalTime = this.clock.getElapsedTime();

    const isVR = this.renderer?.xr?.isPresenting || false;

    // VR Controls
    if (isVR) {
      // 1. Easy mode: VR Controller steering with hand or thumbstick
      if (this.currentVRMode === VRMode.RIDER_EASY && this.player.vrController) {
        const handX = this.player.vrController.position.x;
        if (Math.abs(handX) > 0.18) {
          this.player.moveLateral(handX * dt * 3.5);
        }
      }

      // 2. Thumbstick support for lane shifting
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
                setTimeout(() => (this.thumbstickDebounce = false), 220);
              }
            }

            const stickY = axes.length >= 4 ? axes[3] : 0;
            if (stickY < -0.65 && this.state === GameState.PLAYING) {
              this.player.jump();
            }
          }
        }
      }

      // 3. Hard mode: Head nod in GameOver restarts
      if (this.currentVRMode === VRMode.UNICORN_HARD && this.state === GameState.GAMEOVER) {
        const curHeadZ = this.camera.position.z;
        const headVelZ = (curHeadZ - this.prevHeadZ) / max(0.001, dt);
        this.prevHeadZ = curHeadZ;
        if (headVelZ < -0.38) {
          this.restartGame();
        }
      }
    }

    // Sky and hills follow player world lateral coordinate
    if (this.skyMesh) {
      this.skyMesh.position.set(this.player.x, this.player.y, 0);
    }
    if (this.hillsGroup) {
      this.hillsGroup.position.x = this.player.x;
      this.hillsGroup.position.z = 0;
    }

    // Sync audio engine with state, airborne jumping status, and run speed
    setAudioState(
      this.state,
      this.player.isGrounded,
      this.speed ? this.speed / 18 : 1.0
    );

    // State-specific logic
    if (this.state === GameState.MENU) {
      const demoSpeed = 15;
      const demoAutoX = sin(totalTime * 0.8) * 2.2;
      this.player.setTargetX(demoAutoX / 3.5);
      this.player.update(dt, demoSpeed, true, isVR);
      this.track.update(dt, demoSpeed, totalTime, 60, true);
      this.clouds.update(dt, demoSpeed, totalTime);

      this.ui.renderUI(
        GameState.MENU,
        0,
        this.track.laneHealth,
        -1,
        totalTime,
        dt,
        this.hasWebXR,
        () => this.startGame(),
        (m) => this.requestVRSession(m),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        isVR,
        this.currentVRMode
      );
    } else if (this.state === GameState.PLAYING) {
      this.runTime += dt;
      this.speed = min(36, 18 + this.runTime * 0.28);
      this.score += floor(this.speed * dt * 2.5);

      this.player.update(dt, this.speed, true, isVR);
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
        dt,
        this.hasWebXR,
        () => this.startGame(),
        (m) => this.requestVRSession(m),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        isVR,
        this.currentVRMode
      );
    } else if (this.state === GameState.FALLING) {
      this.fallTimer += dt;
      this.player.update(dt, this.speed * 0.4, false, isVR);
      this.track.update(dt, this.speed * 0.4, totalTime, this.runTime);
      this.clouds.update(dt, this.speed * 0.4, totalTime);

      if (this.fallTimer >= 1.2) {
        this.state = GameState.GAMEOVER;
        if (!isVR) {
          const goModal = document.getElementById('go-modal');
          if (goModal) goModal.style.display = 'flex';
          const goScore = document.getElementById('go-score');
          if (goScore) {
            const isHigh =
              this.score >= this.ui.getHighScore() && this.score > 0;
            goScore.textContent = isHigh
              ? `🎉 NOVÝ REKORD: ${this.score}! 🎉`
              : `SKÓRE: ${this.score}`;
          }
          const goQuote = document.getElementById('go-quote');
          if (goQuote) goQuote.textContent = `"${this.ui.getLastQuote()}"`;
        }
      }

      this.ui.renderUI(
        GameState.FALLING,
        this.score,
        this.track.laneHealth,
        -1,
        totalTime,
        dt,
        this.hasWebXR,
        () => this.startGame(),
        (m) => this.requestVRSession(m),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        isVR,
        this.currentVRMode
      );
    } else if (this.state === GameState.GAMEOVER) {
      this.ui.renderUI(
        GameState.GAMEOVER,
        this.score,
        this.track.laneHealth,
        -1,
        totalTime,
        dt,
        this.hasWebXR,
        () => this.startGame(),
        (m) => this.requestVRSession(m),
        () => this.restartGame(),
        () => this.goToMenu(),
        () => this.toggleFullscreen(),
        isVR,
        this.currentVRMode
      );
    }

    // 3. Render 3D scene
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
