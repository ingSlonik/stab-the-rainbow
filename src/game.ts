const THREE = (window as any).THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

import {
  GameState,
  GameMode,
  LANE_COUNT,
  RAINBOW_COLORS,
} from './types';
import { sin, cos, max, min, floor, lerp } from './math';
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
  // Commented out for 13KB bundle size optimization:
  // speakQuip,
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
  public currentVRMode: GameMode = GameMode.DESKTOP;
  public score = 0;
  public scoreFloat = 0;
  public combo = 1;
  public speed = 18;
  public runTime = 0;
  public fallTimer = 0;
  public cloudsStabbed = 0;

  private clock: any;
  private hasWebXR = false;
  private prevHeadZ = 0;
  private thumbstickDebounce = false;
  private menuButtonDebounce = false;
  private triggerPressedMap: { [k: string]: boolean } = {};
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

    // Camera and rig entities: #c = camera, #r = rig, #lc = left-controller, #rc = right-controller
    this.cameraEl = this.sceneEl.querySelector('#c') || this.sceneEl.camera?.el;
    this.camera = this.sceneEl.camera || this.cameraEl?.getObject3D('camera');

    this.rigEl = this.sceneEl.querySelector('#r');
    this.leftControllerEl = this.sceneEl.querySelector('#lc');
    this.rightControllerEl = this.sceneEl.querySelector('#rc');

    this.track = new TrackManager(this.scene);
    this.clouds = new CloudManager(this.scene);
    this.scenery = new SceneryManager(this.scene);
    this.player = new Player(this.scene, this.camera, this.rigEl, this.rightControllerEl);
    this.ui = new UIManager(this.scene, this.camera);
    this.clouds.onMissedCloud = (colorIdx: number) => {
      if (this.state === GameState.PLAYING) {
        this.track.drainLane(colorIdx, 0.05);
        this.combo = 1;
        this.ui.spawnWorldPopup('-5%', colorIdx);
      }
    };
    this.player.setMenuMode(this.isImmersiveVR(), this.isImmersiveVR() ? this.rightControllerEl?.object3D : null);

    if (this.camera && !this.isImmersiveVR()) {
      this.camera.rotation.x = -0.18;
    }

    this.initAFrameWebXR();

    this.isReady = true;
  }

  public isImmersiveVR(): boolean {
    return !!(
      (this.sceneEl?.xrSession && this.sceneEl.is('vr-mode')) ||
      (this.renderer?.xr?.isPresenting)
    );
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
      const on = (events: string[], fn: () => void) => events.forEach((e) => el.addEventListener(e, fn));
      on(['triggerdown', 'selectstart'], () => this.onTriggerDown(isLeft));
      on(['gripdown', 'squeezestart'], () => this.onGripDown(isLeft));
      on(['abuttondown', 'xbuttondown', 'bbuttondown', 'ybuttondown'], () => this.onAButtonDown());
      // Commented out per spec: Thumbstick movement disabled, only physical stepping and button stab/jump allowed
      // el.addEventListener('thumbstickmoved', (e: any) => this.onThumbstick(e.detail));
      // el.addEventListener('axismove', (e: any) => this.onAxisMove(e.detail));
    };

    bindController(this.leftControllerEl, true);
    bindController(this.rightControllerEl, false);

    this.rightControllerEl?.addEventListener('controllerconnected', () => {
      if (this.player && this.rightControllerEl?.object3D) {
        this.player.setVRController(this.rightControllerEl.object3D);
        const isVR = this.isImmersiveVR();
        const isMenu = this.state === GameState.MENU || this.state === GameState.GAMEOVER;
        if (isVR && (isMenu || this.currentVRMode === GameMode.VR_EASY)) {
          this.player.attachHornToHand(this.rightControllerEl.object3D, isMenu);
        }
      }
    });
  }

  private onAButtonDown(): void {
    // A button ALWAYS and ONLY returns to main menu
    if (this.state !== GameState.MENU) {
      this.goToMenu();
    }
  }

  private onBButtonDown(): void {
    // B button ALWAYS and ONLY returns to main menu
    this.onAButtonDown();
  }

  private onTriggerDown(_isLeft: boolean = false): void {
    if (this.state === GameState.MENU) {
      if (!this.ui.triggerClick()) {
        const mode = this.ui?.hoveredButtonId === 'btn-hard' ? GameMode.VR_HARD : GameMode.VR_EASY;
        this.startGame(mode);
      }
    } else if (this.state === GameState.GAMEOVER) {
      if (!this.ui.triggerClick()) {
        this.restartGame();
      }
    } else if (this.state === GameState.PLAYING) {
      // Trigger = Stab (pích)
      this.player?.stab();
    }
  }

  private onGripDown(_isLeft: boolean = false): void {
    if (this.state === GameState.MENU) {
      return;
    } else if (this.state === GameState.GAMEOVER) {
      this.goToMenu();
    } else if (this.state === GameState.PLAYING) {
      // Grip = Jump (skok)
      this.player?.jump();
    }
  }

  private onThumbstick(_detail: any): void {
    // 13kb optimalizace: Thumbstick movement disabled (staré ovládání páčkou)
    /*
    if (!_detail) return;
    const { x, y } = _detail;
    if (Math.abs(x) > 0.55 && !this.thumbstickDebounce && this.state === GameState.PLAYING) {
      this.player.shiftLane(x > 0 ? 1 : -1);
      this.thumbstickDebounce = true;
      setTimeout(() => (this.thumbstickDebounce = false), 220);
    }
    if (y < -0.65 && this.state === GameState.PLAYING) {
      this.player.jump();
    }
    */
  }

  private onAxisMove(_detail: any): void {
    // 13kb optimalizace: Axis thumbstick movement disabled (staré ovládání osou páčky)
    /*
    if (!_detail || !_detail.axis) return;
    const [x, y] = _detail.axis;
    if (Math.abs(x) > 0.55 && !this.thumbstickDebounce && this.state === GameState.PLAYING) {
      this.player.shiftLane(x > 0 ? 1 : -1);
      this.thumbstickDebounce = true;
      setTimeout(() => (this.thumbstickDebounce = false), 220);
    }
    if (y < -0.65 && this.state === GameState.PLAYING) {
      this.player.jump();
    }
    */
  }

  private onEnterVR(): void {
    // Strictly verify an active immersive WebXR session exists! Non-immersive fallback must NEVER run VR mode!
    if (!this.isImmersiveVR()) {
      console.warn('Blocked non-immersive VR mode attempt');
      this.sceneEl?.exitVR();
      // w = vr-warning, m = modal
      const warningEl = document.getElementById('w');
      if (warningEl) {
        warningEl.innerHTML = '⚠️ <strong>Immersive VR headset required</strong><br>No active WebXR headset detected. Connect a VR headset or click PLAY ON DESKTOP.';
        warningEl.style.display = 'block';
      }
      const modal = document.getElementById('m');
      if (modal) modal.style.display = 'flex';
      this.onExitVR();
      return;
    }

    // Combined hide for 2D warning banner (w) and start modal (m)
    this.hideModal();

    if (this.camera) {
      this.camera.rotation.set(0, 0, 0);
    }

    // Enter 3D VR menu directly in A-Frame over the rainbow
    this.state = GameState.MENU;
    this.currentVRMode = GameMode.VR_EASY;
    this.player.setVRMode(GameMode.VR_EASY, this.rightControllerEl?.object3D);
    this.player.setMenuMode(true, this.rightControllerEl?.object3D);
    this.clouds?.reset();
  }

  private onExitVR(): void {
    this.currentVRMode = GameMode.DESKTOP;
    this.player.setVRMode(GameMode.DESKTOP);
    this.player.setMenuMode(false);
    if (this.camera) {
      this.camera.rotation.set(-0.18, 0, 0);
    }
    this.goToMenu();
  }

  /*
    DOM Identifiers:
    bv = #bv (#btn-enter-vr)
    vs = #vs (#vr-btn-sub)
    d  = .d (.disabled)
    bd = #bd (#btn-desktop)
    bm = #bm (#btn-music)
    bs = #bs (#btn-sfx)
    bf = #bf (#btn-fs)
    w  = #w (#vr-warning)
    m  = #m (#modal)
  */
  private initDOM(): void {
    const on = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    // Check WebXR support; disable VR button on desktop if no headset detected
    const checkVRSupport = async () => {
      const vrBtn = document.getElementById('bv') as HTMLButtonElement | null;
      const vrSub = document.getElementById('vs');
      let isSupported = false;
      if (typeof navigator !== 'undefined' && 'xr' in navigator && (navigator as any).xr) {
        try {
          isSupported = await (navigator as any).xr.isSessionSupported('immersive-vr');
        } catch (_) {
          isSupported = false;
        }
      }
      this.hasWebXR = isSupported;
      if (!isSupported && vrBtn) {
        vrBtn.disabled = true;
        vrBtn.classList.add('d');
        if (vrSub) vrSub.textContent = 'VR Headset Required (Not Available on Desktop)';
      }
    };
    checkVRSupport();

    on('bv', () => {
      this.requestVRSession();
    });
    on('bd', () => {
      this.startGame(GameMode.DESKTOP);
    });
    /*
    on('bm', () => {
      toggleAudio();
      this.syncAudioDOM();
    });
    on('bs', () => {
      toggleSfx();
      this.syncAudioDOM();
    });
    on('bf', () => this.toggleFullscreen());
    */
  }

  private syncAudioDOM(): void {
    const bm = document.getElementById('bm');
    if (bm) bm.textContent = `🎵 MUSIC: ${getAudioMuted() ? 'OFF' : 'ON'}`;
    const bs = document.getElementById('bs');
    if (bs) bs.textContent = `🔊 SFX: ${getSfxMuted() ? 'OFF' : 'ON'}`;
  }

  // Combined hide for 2D warning banner (w) and start modal (m)
  private hideModal(): void {
    const w = document.getElementById('w');
    if (w) w.style.display = 'none';
    const m = document.getElementById('m');
    if (m) m.style.display = 'none';
  }

  public toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }

  public requestVRSession(): void {
    const warningEl = document.getElementById('w');
    if (warningEl) warningEl.style.display = 'none';

    initAudio();

    if (this.isImmersiveVR()) {
      this.onEnterVR();
      return;
    }

    // Strict validation: WebXR immersive-vr must be supported and a headset present
    const hasXR = typeof navigator !== 'undefined' && 'xr' in navigator && !!(navigator as any).xr;
    const isHeadsetConnected = !!(this.sceneEl?.checkHeadsetConnected?.() || this.sceneEl?.isMobile);

    if (!hasXR || (!this.hasWebXR && !isHeadsetConnected)) {
      if (warningEl) {
        warningEl.innerHTML = '⚠️ <strong>Immersive VR headset required</strong><br>WebXR immersive-vr is not supported or no headset detected. Please use a VR headset (e.g. Meta Quest) or click PLAY ON DESKTOP.';
        warningEl.style.display = 'block';
      }
      return;
    }

    const failVR = (msg: string, err: any) => {
      console.warn(msg, err);
      if (warningEl) {
        warningEl.innerHTML = '⚠️ <strong>Failed to start VR session</strong><br>' + (err?.message || 'Ensure your VR headset is active.');
        warningEl.style.display = 'block';
      }
      this.sceneEl?.exitVR();
      this.onExitVR();
    };

    try {
      const p = this.sceneEl.enterVR();
      if (p && typeof p.catch === 'function') {
        p.catch((err: any) => failVR('Enter VR error:', err));
      }
    } catch (err: any) {
      failVR('Enter VR synchronous error:', err);
    }
  }

  private initInput(): void {
    window.addEventListener('mousemove', (e) => {
      this.pointerNdcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdcY = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.state === GameState.PLAYING) {
        // Direct mouse steering across lanes
        this.player?.setTargetX(this.pointerNdcX * 1.05);

        // Keep camera rock-solid on desktop so horn is statically anchored
        if (!this.isImmersiveVR() && this.camera) {
          this.camera.rotation.y = 0;
          this.camera.rotation.x = -0.18;
          this.camera.rotation.z = 0;
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

      // 13kb optimalizace: Staré ovládání klávesnicí na desktopu (desktop je striktně pouze na myš)
      /*
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
          if (!this.ui?.triggerClick()) this.startGame(this.currentVRMode || GameMode.DESKTOP);
        }
      } else if (['ArrowDown', 'KeyS', 'KeyE', 'Enter', 'ShiftLeft', 'ShiftRight'].includes(c)) {
        e.preventDefault();
        if (isPlay) this.player?.stab();
        else if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
          if (!this.ui?.triggerClick()) {
            if (this.state === GameState.GAMEOVER) this.restartGame();
            else this.startGame(this.currentVRMode || GameMode.DESKTOP);
          }
        }
      } else if (c === 'Digit1') {
        if (this.state === GameState.MENU && this.isImmersiveVR()) this.startGame(GameMode.VR_EASY);
      } else if (c === 'Digit2') {
        if (this.state === GameState.MENU && this.isImmersiveVR()) this.startGame(GameMode.VR_HARD);
      } else if (c === 'Digit3') {
        if (this.state === GameState.MENU) this.startGame(GameMode.DESKTOP);
      }
      */

      // System shortcuts preserved
      if (c === 'KeyF') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (c === 'KeyM') {
        e.preventDefault();
        toggleAudio();
        this.syncAudioDOM();
      } else if (c === 'KeyN') {
        e.preventDefault();
        toggleSfx();
        this.syncAudioDOM();
      } else if (c === 'KeyH' || c === 'Escape') {
        // Return to menu at any time
        this.goToMenu();
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

  private resetRunStats(): void {
    this.score = this.scoreFloat = this.runTime = this.cloudsStabbed = 0;
    this.combo = 1;
    this.speed = 18;
    this.track?.reset();
    this.clouds?.reset();
    this.scenery?.reset();
  }

  public goToMenu(): void {
    const isVR = this.isImmersiveVR();
    // m = #modal
    const modal = document.getElementById('m');
    if (modal) {
      modal.style.display = isVR ? 'none' : 'flex';
    }

    this.state = GameState.MENU;
    this.resetRunStats();
    this.player?.reset(isVR);
    this.player?.setMenuMode(isVR, isVR ? this.rightControllerEl?.object3D : null);

    if (this.camera && !isVR) {
      this.camera.rotation.x = -0.18;
      this.camera.rotation.y = 0;
      this.camera.rotation.z = 0;
    }
  }

  public startGame(mode: GameMode = this.currentVRMode ?? GameMode.DESKTOP): void {
    const isVR = this.isImmersiveVR();
    // Invariant: Non-immersive environment can NEVER run in VR mode
    if (!isVR && mode !== GameMode.DESKTOP) {
      mode = GameMode.DESKTOP;
    }

    this.hideModal();

    this.currentVRMode = mode;
    this.player?.setVRMode(mode, this.rightControllerEl?.object3D);

    this.state = GameState.PLAYING;
    this.resetRunStats();
    this.player?.reset();

    // Immediately hide 3D menu dialog
    this.ui?.hideDialog();

    // Prevent immediate accidental return to menu from the start button press
    this.menuButtonDebounce = true;
    setTimeout(() => {
      this.menuButtonDebounce = false;
    }, 800);

    const isHard = this.currentVRMode === GameMode.VR_HARD;
    if (isHard) {
      const startQuip = getRandomStartQuip();
      this.ui?.setQuip(startQuip);
      // Commented out for 13KB bundle size optimization:
      // speakQuip(startQuip, true);
    }
  }

  public restartGame(): void {
    this.startGame(this.currentVRMode || GameMode.DESKTOP);
  }

  private checkHornCloudCollisions(): void {
    if (!this.player || !this.clouds || !this.track) return;
    const hornTipPos = this.player.getHornTipPosition();
    const isAirborne = !this.player.isGrounded;
    const isStabbing = this.player.isStabbing;
    const isHard = this.currentVRMode === GameMode.VR_HARD;

    // Scaled vertical & lateral bounds for the 0.40m lane width:
    const maxHalfY = isHard ? 0.52 : 0.44;
    const maxHalfX = isHard ? 0.35 : 0.30;

    const clouds = this.clouds.clouds;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      if (c.stabbed || c.popping) continue;

      const dx = hornTipPos.x - c.x;
      const dy = hornTipPos.y - c.y;
      const dz = hornTipPos.z - c.z;

      // 1. Vertical height test: Must actually be inside the cloud's vertical span (no hitting clouds from far below!)
      if (Math.abs(dy) > maxHalfY) continue;

      // 2. Lateral alignment test: Must be within the cloud's lane
      if (Math.abs(dx) > maxHalfX) continue;

      // 3. Track depth reach test:
      // Positive dz = cloud ahead of horn tip; negative dz = cloud touching or passing horn tip
      const minZ = -0.85;
      const maxZ = isHard ? 1.35 : (isStabbing ? 1.35 : 0.65);

      if (dz >= minZ && dz <= maxZ) {
        // In Hard mode, ramming into a cloud automatically pierces and pops it without manual stabbing
        if (isHard || isStabbing || (isAirborne && Math.abs(dz) <= 0.55)) {
          c.stabbed = true;
          this.clouds.popCloud(c);
          this.track.replenishLane(c.colorIdx);
          this.cloudsStabbed++;
          playStabSound(c.colorIdx);
          this.scoreFloat += 100 * this.combo;
          this.score = floor(this.scoreFloat);
          this.combo = min(8, this.combo + 1);

          // Visual popup (100%) in 3D world in lane color
          this.ui.spawnWorldPopup('100%', c.colorIdx);

          // Hard mode humorous quips on cloud stabbing
          if (isHard) {
            const q = this.combo >= 3 && Math.random() < 0.6
              ? getRandomComboQuip()
              : (Math.random() < 0.4 ? getRandomStabQuip() : null);
            if (q) {
              this.ui.setQuip(q);
              // Commented out for 13KB bundle size optimization:
              // speakQuip(q);
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
      const effectiveX = this.player.getPlayerWorldX();
      const laneIdx = this.track.getLaneIndexFromX(effectiveX);
      this.player.currentLane = laneIdx;

      if (!this.track.isLaneSolid(laneIdx)) {
        // Stepped onto a void lane! FALLING
        this.state = GameState.FALLING;
        this.fallTimer = 0;
        this.player.startFalling();
        playFallSound();
        this.ui.setGameOverDeathQuote();
        const isHard = this.currentVRMode === GameMode.VR_HARD;
        if (isHard) {
          // Commented out for 13KB bundle size optimization:
          // speakQuip(this.ui.getLastQuote(), true);
        }
        this.ui.saveHighScore(this.score, this.currentVRMode);
      }
    }
  }

  private getVRPointerRay(outOrigin: any, outDir: any): boolean {
    if (this.player && this.player.getHornRay(outOrigin, outDir)) {
      return true;
    }

    for (const ctrl of [this.rightControllerEl, this.leftControllerEl]) {
      if (ctrl && ctrl.object3D) {
        ctrl.object3D.updateMatrixWorld(true);
        ctrl.object3D.getWorldPosition(outOrigin);
        const quat = new THREE.Quaternion();
        ctrl.object3D.getWorldQuaternion(quat);
        const offsetQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.65);
        quat.multiply(offsetQ);
        outDir.set(0, 0, -1).applyQuaternion(quat).normalize();
        return true;
      }
    }

    return false;
  }

  public loop(time: number, timeDelta: number): void {
    if (!this.isReady) return;
    const dt = min(0.08, timeDelta / 1000);
    const totalTime = time / 1000;

    const isVR = this.isImmersiveVR();

    // Invariant: VR modes (EASY/HARD) must NEVER run without active WebXR immersion
    if (!isVR && this.currentVRMode !== GameMode.DESKTOP) {
      this.currentVRMode = GameMode.DESKTOP;
      this.player.setVRMode(GameMode.DESKTOP);
      this.player.setMenuMode(false);
      if (this.camera) {
        this.camera.rotation.set(-0.18, 0, 0);
      }
    }

    // VR Controls
    if (isVR) {
      const isEasy = this.currentVRMode === GameMode.VR_EASY;
      const isHard = this.currentVRMode === GameMode.VR_HARD;

      // 13kb optimalizace: Staré ovládání pozicí ovladače ruky (zatáčení se provádí fyzickým úkrokem)
      /*
      if (isEasy && this.player.vrController) {
        const handX = this.player.vrController.position.x;
        if (Math.abs(handX) > 0.18) {
          this.player.moveLateral(handX * dt * 3.5);
        }
      }
      */

      // 2. Controller trigger (stab), grip (jump), and A/B buttons (home) via Gamepad API
      const session = this.sceneEl.xrSession;
      if (session && session.inputSources) {
        for (const source of session.inputSources) {
          if (source.gamepad) {
            const btns = source.gamepad.buttons;
            const hand = source.handedness || 'right';
            const isLeft = hand === 'left';
            const checkBtn = (idx: number, suffix: string, fn: () => void) => {
              const b = btns?.[idx];
              if (!b) return;
              const isPressed = b.pressed || b.value > 0.5;
              const key = hand + suffix;
              if (isPressed && !this.triggerPressedMap[key]) {
                this.triggerPressedMap[key] = true;
                fn();
              } else if (!isPressed && this.triggerPressedMap[key]) {
                this.triggerPressedMap[key] = false;
              }
            };

            // Trigger check (Button 0) -> Stab (pích)
            checkBtn(0, '_trig', () => this.onTriggerDown(isLeft));

            // Squeeze / Grip button (Button 1) -> Jump (skok)
            checkBtn(1, '_grip', () => this.onGripDown(isLeft));

            // A & B Buttons (and X & Y) -> Return to Home (exit game) during play, or select in menu
            if (btns) {
              const btnA = btns[4];
              const btnB = btns[5];
              const isAPressed = !!(btnA && btnA.pressed === true);
              const isBPressed = !!(btnB && btnB.pressed === true);

              if ((isAPressed || isBPressed) && !this.menuButtonDebounce) {
                this.menuButtonDebounce = true;
                if (this.state !== GameState.MENU) {
                  // A and B buttons ALWAYS and ONLY return to Main Menu
                  this.goToMenu();
                }
                setTimeout(() => (this.menuButtonDebounce = false), 250);
              }
            }

            // 13kb optimalizace: Staré ovládání osami gamepadu (fyzické krokování nahrazuje thumbstick)
            /*
            if (source.gamepad.axes) {
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
              if (stickY < -0.65 && this.state === GameState.PLAYING) {
                this.player.jump();
              }
            }
            */
          }
        }
      }

      // 3. Hard mode: Head nod in GameOver restarts
      if (isHard && this.state === GameState.GAMEOVER) {
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
      this.player.setTargetX(0);
      this.player.update(dt, demoSpeed, true, isVR, false, true);
      this.track.update(dt, demoSpeed, totalTime, 60, true);
      this.clouds.update(dt, demoSpeed, totalTime, true);
      this.scenery.update(dt, demoSpeed, totalTime);
    } else if (this.state === GameState.PLAYING) {
      this.runTime += dt;
      this.speed = min(36, 18 + this.runTime * 0.28);
      this.scoreFloat += this.speed * dt * 3.5;
      this.score = floor(this.scoreFloat);

      const effectiveX = this.player.getPlayerWorldX();
      const currentLane = this.track.getLaneIndexFromX(effectiveX);
      this.player.currentLane = currentLane;
      const isSolid = this.track.isLaneSolid(currentLane);

      this.player.update(dt, this.speed, true, isVR, true, isSolid);
      this.track.update(dt, this.speed, totalTime, this.runTime);
      this.clouds.update(dt, this.speed, totalTime, false);
      this.scenery.update(dt, this.speed, totalTime);

      this.checkHornCloudCollisions();
      this.checkTrackFall();
    } else if (this.state === GameState.FALLING) {
      this.fallTimer += dt;

      // Soft decelerate vertical falling as we reach the resting point
      if (this.fallTimer > 0.65) {
        this.player.vy = lerp(this.player.vy, 0, min(1, dt * 8));
      }

      this.player.update(dt, this.speed * 0.35, false, isVR, false, false);
      this.track.update(dt, this.speed * 0.35, totalTime, this.runTime);
      this.clouds.update(dt, this.speed * 0.35, totalTime, true);
      this.scenery.update(dt, this.speed * 0.35, totalTime);

      if (this.fallTimer >= 1.05) {
        this.player.stopFalling();
        this.state = GameState.GAMEOVER;
        this.ui.setGameOverPosition(this.player.getPlayerWorldX(), this.player.root.position.y, isVR);
        this.player.setMenuMode(isVR, isVR ? this.rightControllerEl?.object3D : null);
      }
    } else if (this.state === GameState.GAMEOVER) {
      this.player.update(dt, 0, false, isVR, false, false);
      this.clouds.update(dt, 10, totalTime, true);
      this.scenery.update(dt, 10, totalTime);
    }

    // 3D UI raycasting from VR controller/horn or head gaze in VR, or mouse pointer on desktop
    if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
      if (isVR) {
        const origin = new THREE.Vector3();
        const dir = new THREE.Vector3();
        let hitResult: any = null;

        // 1. Try horn / controller ray first
        if (this.getVRPointerRay(origin, dir)) {
          hitResult = this.ui.updateHoverRay(origin, dir);
        }

        // 2. Head gaze fallback: if controller ray missed or wasn't pointing at board, use head gaze
        if ((!hitResult || !hitResult.hit) && this.camera) {
          const headOrigin = new THREE.Vector3();
          const headDir = new THREE.Vector3();
          this.camera.updateMatrixWorld(true);
          this.camera.getWorldPosition(headOrigin);
          this.camera.getWorldDirection(headDir);
          const gazeResult = this.ui.updateHoverRay(headOrigin, headDir);
          if (gazeResult.hit) {
            hitResult = gazeResult;
          }
        }

        if (this.player) {
          this.player.updatePointerBeam(hitResult?.point);
        }
      } else {
        this.ui.updateHoverNdc(this.pointerNdcX, this.pointerNdcY);
      }
    }

    this.ui.renderUI(
      this.state,
      this.score,
      this.combo,
      this.track.laneHealth,
      totalTime,
      dt,
      (m) => this.startGame(m),
      () => this.restartGame(),
      () => this.goToMenu(),
      () => {
        const isHard = this.currentVRMode === GameMode.VR_HARD;
        const toggled = isHard ? GameMode.VR_EASY : GameMode.VR_HARD;
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
