const THREE = (window as any).THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

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
import { SceneryManager } from './scenery';
import { Player } from './player';
import { UIManager } from './ui';

export class Game {
  public sceneEl: any;
  public scene: any;
  public camera: any;
  public renderer: any;
  public cameraEl: any;
  public rigEl: any;
  public leftControllerEl: any;
  public rightControllerEl: any;

  public track!: TrackManager;
  public clouds!: CloudManager;
  public scenery!: SceneryManager;
  public player!: Player;
  public ui!: UIManager;

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
  private prevHeadZ = 0;
  private thumbstickDebounce = false;
  private isReady = false;

  // Desktop Pointer state
  private pointerNdcX = 0;
  private pointerNdcY = 0;
  private keysDown: { [k: string]: boolean } = {};

  constructor(sceneEl: any) {
    this.sceneEl = sceneEl;
    this.clock = new THREE.Clock();

    this.initDOM();
    this.initInput();

    if (sceneEl.hasLoaded) {
      this.setup();
    } else {
      sceneEl.addEventListener('loaded', () => this.setup());
    }
  }

  private setup(): void {
    if (this.isReady) return;

    this.scene = this.sceneEl.object3D;
    this.renderer = this.sceneEl.renderer;

    this.cameraEl = this.sceneEl.querySelector('#camera') || this.sceneEl.camera?.el;
    this.camera = this.sceneEl.camera || this.cameraEl?.getObject3D('camera');

    this.rigEl = this.sceneEl.querySelector('#rig');
    this.leftControllerEl = this.sceneEl.querySelector('#left-controller');
    this.rightControllerEl = this.sceneEl.querySelector('#right-controller');

    this.track = new TrackManager(this.scene);
    this.clouds = new CloudManager(this.scene);
    this.scenery = new SceneryManager(this.scene);
    this.player = new Player(this.scene, this.camera, this.rigEl, this.rightControllerEl);
    this.ui = new UIManager(this.scene, this.camera);
    this.player.setMenuMode(this.rightControllerEl?.object3D);

    if (this.camera) {
      this.camera.rotation.x = -0.24;
    }

    this.initAFrameWebXR();

    this.isReady = true;
  }

  private async initAFrameWebXR(): Promise<void> {
    if ('xr' in navigator && (navigator as any).xr) {
      try {
        this.hasWebXR = await (navigator as any).xr.isSessionSupported('immersive-vr');
      } catch (_) {
        this.hasWebXR = false;
      }
    }

    this.sceneEl.addEventListener('enter-vr', () => this.onEnterVR());
    this.sceneEl.addEventListener('exit-vr', () => this.onExitVR());

    const bindController = (el: any, isLeft: boolean) => {
      if (!el) return;
      el.addEventListener('triggerdown', () => this.onTriggerDown(isLeft));
      el.addEventListener('selectstart', () => this.onTriggerDown(isLeft));
      el.addEventListener('gripdown', () => this.onGripDown(isLeft));
      el.addEventListener('squeezestart', () => this.onGripDown(isLeft));
      el.addEventListener('thumbstickmoved', (e: any) => this.onThumbstick(e.detail));
      el.addEventListener('axismove', (e: any) => this.onAxisMove(e.detail));
    };

    bindController(this.leftControllerEl, true);
    bindController(this.rightControllerEl, false);
  }

  private onTriggerDown(isLeft: boolean = false): void {
    if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
      if (!this.ui.triggerClick() && this.state === GameState.GAMEOVER) {
        this.restartGame();
      }
    } else if (this.state === GameState.PLAYING) {
      if (isLeft) {
        // Return to menu at any time
        this.goToMenu();
      } else {
        // In Hard mode, button controls are disabled - head motion only!
        if (this.currentVRMode === VRMode.UNICORN_HARD) {
          this.goToMenu();
        } else {
          this.player.stab();
        }
      }
    }
  }

  private onGripDown(isLeft: boolean = false): void {
    if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
      this.goToMenu();
    } else if (this.state === GameState.PLAYING) {
      if (isLeft) {
        // Return to menu at any time
        this.goToMenu();
      } else {
        // In Hard mode, button controls are disabled - head motion only!
        if (this.currentVRMode === VRMode.UNICORN_HARD) {
          this.goToMenu();
        } else {
          this.player.jump();
        }
      }
    }
  }

  private onThumbstick(detail: any): void {
    if (!detail) return;
    const { x, y } = detail;
    if (Math.abs(x) > 0.55 && !this.thumbstickDebounce && this.state === GameState.PLAYING) {
      this.player.shiftLane(x > 0 ? 1 : -1);
      this.thumbstickDebounce = true;
      setTimeout(() => (this.thumbstickDebounce = false), 220);
    }
    // Only in Easy mode does thumbstick jump; in Hard mode, jumping is head motion only
    if (y < -0.65 && this.state === GameState.PLAYING && this.currentVRMode !== VRMode.UNICORN_HARD) {
      this.player.jump();
    }
  }

  private onAxisMove(detail: any): void {
    if (!detail || !detail.axis) return;
    const [x, y] = detail.axis;
    if (Math.abs(x) > 0.55 && !this.thumbstickDebounce && this.state === GameState.PLAYING) {
      this.player.shiftLane(x > 0 ? 1 : -1);
      this.thumbstickDebounce = true;
      setTimeout(() => (this.thumbstickDebounce = false), 220);
    }
    if (y < -0.65 && this.state === GameState.PLAYING && this.currentVRMode !== VRMode.UNICORN_HARD) {
      this.player.jump();
    }
  }

  private onEnterVR(): void {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';

    // Enter 3D VR menu directly in A-Frame
    this.state = GameState.MENU;
    this.player.setMenuMode(this.rightControllerEl?.object3D);
  }

  private onExitVR(): void {
    this.currentVRMode = VRMode.NONE;
    this.player.setVRMode(VRMode.NONE);
    this.goToMenu();
  }

  private initDOM(): void {
    const on = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    on('btn-enter-vr', () => {
      this.requestVRSession(VRMode.RIDER_EASY);
    });
    on('btn-desktop', () => {
      this.startGame(VRMode.RIDER_EASY);
    });

    on('btn-music', () => {
      toggleAudio();
      const b = document.getElementById('btn-music');
      if (b) b.textContent = `🎵 HUDBA: ${getAudioMuted() ? 'VYP' : 'ZAP'}`;
    });
    on('btn-sfx', () => {
      toggleSfx();
      const b = document.getElementById('btn-sfx');
      if (b) b.textContent = `🔊 ZVUKY: ${getSfxMuted() ? 'VYP' : 'ZAP'}`;
    });
    on('btn-fs', () => this.toggleFullscreen());
  }

  public toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  public async requestVRSession(mode: VRMode = VRMode.RIDER_EASY): Promise<void> {
    initAudio();
    this.currentVRMode = mode;
    try {
      if (this.sceneEl.is('vr-mode')) {
        this.onEnterVR();
      } else {
        await this.sceneEl.enterVR();
      }
    } catch (err) {
      console.warn('Enter VR error:', err);
      this.startGame();
    }
  }

  private initInput(): void {
    window.addEventListener('mousemove', (e) => {
      this.pointerNdcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdcY = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.state === GameState.PLAYING) {
        // Direct mouse steering across lanes
        this.player?.setTargetX(this.pointerNdcX * 1.05);

        // Tilt camera slightly with mouse on desktop
        if (!this.sceneEl?.is('vr-mode') && this.camera) {
          this.camera.rotation.y = -this.pointerNdcX * 0.25;
          this.camera.rotation.x = -0.24 + this.pointerNdcY * 0.16;
        }
      }
    });

    window.addEventListener(
      'wheel',
      () => {
        if (this.state === GameState.PLAYING) {
          this.player?.jump();
        }
      },
      { passive: true }
    );

    // Prevent context menu on right click
    const blockContext = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    window.addEventListener('contextmenu', blockContext);
    document.addEventListener('contextmenu', blockContext);

    window.addEventListener('mousedown', (e) => {
      initAudio();
      if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
        this.ui?.triggerClick();
      } else if (this.state === GameState.PLAYING && this.player) {
        if (e.button === 2 || e.button === 1) {
          this.player.jump();
        } else if (e.button === 0) {
          this.player.stab();
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      this.keysDown[e.code] = true;
      initAudio();
      const c = e.code;
      const isPlay = this.state === GameState.PLAYING;

      if (c === 'ArrowLeft' || c === 'KeyA') {
        e.preventDefault();
        if (isPlay) this.player?.shiftLane(-1);
      } else if (c === 'ArrowRight' || c === 'KeyD') {
        e.preventDefault();
        if (isPlay) this.player?.shiftLane(1);
      } else if (c === 'ArrowUp' || c === 'KeyW' || c === 'Space') {
        e.preventDefault();
        if (isPlay) this.player?.jump();
        else if (this.state === GameState.GAMEOVER && c === 'Space') this.restartGame();
        else if (this.state === GameState.MENU && c === 'Space') {
          if (!this.ui?.triggerClick()) this.startGame(VRMode.RIDER_EASY);
        }
      } else if (['ArrowDown', 'KeyS', 'KeyE', 'Enter', 'ShiftLeft', 'ShiftRight'].includes(c)) {
        e.preventDefault();
        if (isPlay) this.player?.stab();
        else if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
          if (!this.ui?.triggerClick()) {
            if (this.state === GameState.GAMEOVER) this.restartGame();
            else this.startGame(VRMode.RIDER_EASY);
          }
        }
      } else if (c === 'KeyF') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (c === 'KeyM') {
        e.preventDefault();
        toggleAudio();
        const b = document.getElementById('btn-music');
        if (b) b.textContent = `🎵 HUDBA: ${getAudioMuted() ? 'VYP' : 'ZAP'}`;
      } else if (c === 'KeyN') {
        e.preventDefault();
        toggleSfx();
        const b = document.getElementById('btn-sfx');
        if (b) b.textContent = `🔊 ZVUKY: ${getSfxMuted() ? 'VYP' : 'ZAP'}`;
      } else if (c === 'KeyH' || c === 'Escape') {
        // Return to menu at any time
        this.goToMenu();
      } else if (c === 'Digit1') {
        if (this.state === GameState.MENU) this.startGame(VRMode.RIDER_EASY);
      } else if (c === 'Digit2') {
        if (this.state === GameState.MENU) this.startGame(VRMode.UNICORN_HARD);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown[e.code] = false;
    });

    // Touch support for mobile
    window.addEventListener('touchstart', () => {
      initAudio();
      if (this.state === GameState.PLAYING) {
        this.player?.stab();
      }
    });
  }

  public goToMenu(): void {
    const modal = document.getElementById('modal');
    if (modal && this.sceneEl?.is('vr-mode')) modal.style.display = 'none';

    this.state = GameState.MENU;
    this.score = 0;
    this.combo = 1;
    this.speed = 18;
    this.runTime = 0;
    this.cloudsStabbed = 0;
    this.track?.reset();
    this.clouds?.reset();
    this.scenery?.reset();
    this.player?.reset();
    this.player?.setMenuMode(this.rightControllerEl?.object3D);

    if (this.camera && !this.sceneEl?.is('vr-mode')) {
      this.camera.rotation.x = -0.24;
    }
  }

  public startGame(mode: VRMode = this.currentVRMode || VRMode.RIDER_EASY): void {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';

    this.currentVRMode = mode;
    this.player?.setVRMode(mode, this.rightControllerEl?.object3D);

    this.state = GameState.PLAYING;
    this.score = 0;
    this.combo = 1;
    this.speed = 18;
    this.runTime = 0;
    this.cloudsStabbed = 0;
    this.track?.reset();
    this.clouds?.reset();
    this.scenery?.reset();
    this.player?.reset();

    if (this.currentVRMode === VRMode.UNICORN_HARD) {
      const startQuip = getRandomStartQuip();
      this.ui?.setQuip(startQuip);
      speakQuip(startQuip, true);
    }
  }

  public restartGame(): void {
    this.startGame(this.currentVRMode || VRMode.RIDER_EASY);
  }

  private checkHornCloudCollisions(): void {
    if (!this.player || !this.clouds || !this.track) return;
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
    if (!this.player || !this.track) return;
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
        this.ui.setGameOverDeathQuote();
        if (this.currentVRMode === VRMode.UNICORN_HARD) {
          speakQuip(this.ui.getLastQuote(), true);
        }
        this.ui.saveHighScore(this.score, this.currentVRMode);
      }
    }
  }

  public loop(time: number, timeDelta: number): void {
    if (!this.isReady) return;
    const dt = min(0.08, timeDelta / 1000);
    const totalTime = time / 1000;

    const isVR = this.sceneEl?.is('vr-mode') || false;

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
      const session = this.sceneEl.xrSession;
      if (session && session.inputSources) {
        for (const source of session.inputSources) {
          if (source.gamepad && source.gamepad.axes) {
            const axes = source.gamepad.axes;
            const stickX = axes.length >= 3 ? axes[2] : (axes.length >= 1 ? axes[0] : 0);
            if (Math.abs(stickX) > 0.55) {
              if (!this.thumbstickDebounce && this.state === GameState.PLAYING) {
                this.player.shiftLane(stickX > 0 ? 1 : -1);
                this.thumbstickDebounce = true;
                setTimeout(() => (this.thumbstickDebounce = false), 220);
              }
            }

            const stickY = axes.length >= 4 ? axes[3] : (axes.length >= 2 ? axes[1] : 0);
            if (stickY < -0.65 && this.state === GameState.PLAYING && this.currentVRMode !== VRMode.UNICORN_HARD) {
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
      this.scenery.update(dt, demoSpeed, totalTime);
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
      this.scenery.update(dt, this.speed, totalTime);

      this.checkHornCloudCollisions();
      this.checkTrackFall();
    } else if (this.state === GameState.FALLING) {
      this.fallTimer += dt;
      this.player.update(dt, this.speed * 0.4, false, isVR);
      this.track.update(dt, this.speed * 0.4, totalTime, this.runTime);
      this.clouds.update(dt, this.speed * 0.4, totalTime);
      this.scenery.update(dt, this.speed * 0.4, totalTime);

      if (this.fallTimer >= 1.2) {
        this.state = GameState.GAMEOVER;
        this.player.setMenuMode(this.rightControllerEl?.object3D);
      }
    }

    // 3D UI raycasting from unicorn horn in VR, or mouse pointer on desktop
    if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
      if (isVR && this.player) {
        const origin = new THREE.Vector3();
        const dir = new THREE.Vector3();
        this.player.getHornRay(origin, dir);
        this.ui.updateHoverRay(origin, dir);
      } else {
        this.ui.updateHoverNdc(this.pointerNdcX, this.pointerNdcY);
      }
    }

    this.ui.renderUI(
      this.state,
      this.score,
      this.track.laneHealth,
      this.state === GameState.PLAYING ? this.track.getUrgentLane() : -1,
      totalTime,
      dt,
      (m) => this.startGame(m),
      () => this.restartGame(),
      () => this.goToMenu(),
      () => {
        const toggled =
          this.currentVRMode === VRMode.UNICORN_HARD
            ? VRMode.RIDER_EASY
            : VRMode.UNICORN_HARD;
        this.startGame(toggled);
      },
      isVR,
      this.currentVRMode
    );
  }
}

// Register A-Frame component
if (typeof AFRAME !== 'undefined') {
  AFRAME.registerComponent('rainbow-game', {
    init: function () {
      (window as any)._g = new Game(this.el);
    },
    tick: function (time: number, timeDelta: number) {
      if ((window as any)._g) {
        (window as any)._g.loop(time, timeDelta);
      }
    }
  });
}

// Auto-boot helper
export const bootGame = () => {
  const sceneEl = document.querySelector('a-scene');
  if (sceneEl && !(window as any)._g) {
    if (!sceneEl.hasAttribute('rainbow-game')) {
      sceneEl.setAttribute('rainbow-game', '');
    }
  }
};
(window as any).bootGame = bootGame;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootGame);
} else {
  bootGame();
}
