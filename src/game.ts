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
    this.scene.background = new THREE.Color(0x060312);
    this.scene.fog = new THREE.FogExp2(0x080418, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      160
    );
    // Camera default head height
    this.camera.position.set(0, 1.6, 0);
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;

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

    // Bind VR Controller triggers
    const c1 = this.renderer.xr.getController(0);
    c1.addEventListener('selectstart', () => this.handleActionTrigger());
    this.scene.add(c1);

    const c2 = this.renderer.xr.getController(1);
    c2.addEventListener('selectstart', () => this.handleActionTrigger());
    this.scene.add(c2);
  }

  public async requestVRSession(): Promise<void> {
    if (!this.hasWebXR) return;
    try {
      initAudio();
      const session = await (navigator as any).xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      this.vrSession = session;
      this.renderer.xr.setSession(session);

      session.addEventListener('end', () => {
        this.vrSession = null;
      });

      this.startGame();
    } catch (err) {
      console.warn('VR session request error:', err);
      this.startGame();
    }
  }

  private initInput(): void {
    const canvas = this.renderer.domElement;

    window.addEventListener('mousemove', (e) => {
      this.pointerNdcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdcY = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.state === GameState.MENU || this.state === GameState.GAMEOVER) {
        this.ui.updateHover(this.pointerNdcX, this.pointerNdcY);
      } else if (this.state === GameState.PLAYING) {
        // Steer player with mouse
        this.player.setTargetX(this.pointerNdcX * 1.05);

        // Tilt camera slightly with mouse on desktop
        if (!this.renderer.xr.isPresenting) {
          this.camera.rotation.y = -this.pointerNdcX * 0.28;
          this.camera.rotation.x = this.pointerNdcY * 0.2;
        }
      }
    });

    window.addEventListener('mousedown', () => {
      initAudio();
      this.handleActionTrigger();
    });

    window.addEventListener('keydown', (e) => {
      this.keysDown[e.code] = true;
      initAudio();

      if (e.code === 'Space') {
        e.preventDefault();
        this.handleActionTrigger();
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
        this.ui.updateHover(this.pointerNdcX, this.pointerNdcY);
      }
      this.handleActionTrigger();
    });
  }

  private handleActionTrigger(): void {
    if (this.state === GameState.MENU) {
      if (this.ui.triggerClick()) {
        return;
      }
      this.startGame();
    } else if (this.state === GameState.PLAYING) {
      this.player.jump();
    } else if (this.state === GameState.GAMEOVER) {
      if (this.ui.triggerClick()) {
        return;
      }
      this.restartGame();
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
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private checkHornCloudCollisions(): void {
    const hornTipPos = this.player.getHornTipPosition();

    for (const c of this.clouds.clouds) {
      if (c.stabbed) continue;

      // Distance from horn tip to cloud center
      const dx = hornTipPos.x - c.x;
      const dy = hornTipPos.y - c.y;
      const dz = hornTipPos.z - c.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      const hitRadius = c.radius + 0.55;
      if (distSq <= hitRadius * hitRadius) {
        // STABBED!
        c.stabbed = true;
        this.cloudsStabbed++;

        // Replenish the corresponding color lane
        this.track.replenishLane(c.colorIdx);

        // Sound & particles
        playStabSound(c.colorIdx);
        this.clouds.spawnBurst(c.x, c.y, c.z, RAINBOW_COLORS[c.colorIdx]);

        // Score bonus
        this.score += 150 * this.combo;
        this.combo = min(8, this.combo + 1);
        break;
      }
    }
  }

  private checkTrackFall(): void {
    if (this.player.isGrounded && !this.player.isFalling) {
      const laneIdx = this.track.getLaneIndexFromX(this.player.x);
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

    // 1. Keyboard steering
    if (this.state === GameState.PLAYING) {
      if (this.keysDown['ArrowLeft'] || this.keysDown['KeyA']) {
        this.player.moveLateral(-dt * 6.5);
      }
      if (this.keysDown['ArrowRight'] || this.keysDown['KeyD']) {
        this.player.moveLateral(dt * 6.5);
      }
    }

    // 2. State-specific logic
    if (this.state === GameState.MENU) {
      // Attract/Demo mode: Gentle auto-gallop and scenic sway
      const demoSpeed = 15;
      const demoAutoX = sin(totalTime * 0.8) * 2.2;
      this.player.setTargetX(demoAutoX / 3.5);
      this.player.update(dt, demoSpeed, true);
      this.track.update(dt, demoSpeed, totalTime);
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
        () => this.restartGame()
      );
    } else if (this.state === GameState.PLAYING) {
      this.runTime += dt;
      // Progressive difficulty acceleration
      this.speed = min(36, 18 + this.runTime * 0.28);
      this.score += floor(this.speed * dt * 2.5);

      this.player.update(dt, this.speed, true);
      this.track.update(dt, this.speed, totalTime);
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
        () => this.restartGame()
      );
    } else if (this.state === GameState.FALLING) {
      this.fallTimer += dt;
      this.player.update(dt, this.speed * 0.4, false);
      this.track.update(dt, this.speed * 0.4, totalTime);
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
        () => this.goToMenu()
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
        () => this.goToMenu()
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
