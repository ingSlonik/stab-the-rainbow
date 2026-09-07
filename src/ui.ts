import {
  LANE_COUNT,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
  COLOR_NAMES,
  GameState,
  VRMode,
} from './types';
import { sin, max, min, floor, randChoice } from './math';
import { getRandomDeathQuip } from './quips';

const DEATH_QUOTES = [
  'Gravity: 1, Unicorn: 0',
  'Rainbow out of order. Please insert 1 cloud.',
  'Lost forever in the cyan-deprived astral abyss.',
];

export interface UIButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  action: () => void;
}

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class UIManager {
  public group: any;
  private camera: any;

  // 3D UI Meshes: Upper HUD ribbon and VR Game Over panel
  private hudMesh: any;
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D;
  private hudTexture: any;

  private goMesh: any;
  private goCanvas: HTMLCanvasElement;
  private goCtx: CanvasRenderingContext2D;
  private goTexture: any;

  // Interaction & Raycasting (for VR pointer/controller clicks)
  private raycaster: any;
  private mouseVec: any;
  private buttons: UIButton[] = [];
  private hoveredButtonId: string | null = null;

  private highScore = 0;
  private lastQuote = '';

  // Dynamic funny quips for Hard mode
  private currentQuip = '';
  private quipTimer = 0;

  constructor(scene: any, camera: any) {
    this.camera = camera;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.raycaster = new THREE.Raycaster();
    this.mouseVec = new THREE.Vector2(0, 0);

    this.loadHighScore();
    this.initCanvasMesh();
  }

  private loadHighScore(): void {
    try {
      this.highScore = parseInt(localStorage.getItem('str_high') || '0', 10) || 0;
    } catch (_) {
      this.highScore = 0;
    }
  }

  public saveHighScore(score: number): boolean {
    if (score > this.highScore) {
      this.highScore = score;
      try {
        localStorage.setItem('str_high', score.toString());
      } catch (_) {}
      return true;
    }
    return false;
  }

  public getHighScore(): number {
    return this.highScore;
  }

  public getLastQuote(): string {
    return this.lastQuote || 'Gravity always wins.';
  }

  public setQuip(text: string): void {
    this.currentQuip = text;
    this.quipTimer = 4.0;
  }

  private initCanvasMesh(): void {
    // 1. Upper HUD ribbon: positioned at comfortable stereoscopic distance (2.3m) with depthTest enabled
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 1024;
    this.hudCanvas.height = 320;
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;

    const hudGeom = new THREE.PlaneGeometry(1.9, 0.58);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    this.hudMesh = new THREE.Mesh(hudGeom, hudMat);
    this.hudMesh.position.set(0, 0.65, -2.3);
    this.hudMesh.rotation.x = 0.14;
    this.hudMesh.visible = false;
    this.camera.add(this.hudMesh);

    // 2. Centered VR Game Over card
    this.goCanvas = document.createElement('canvas');
    this.goCanvas.width = 1024;
    this.goCanvas.height = 1024;
    this.goCtx = this.goCanvas.getContext('2d')!;

    this.goTexture = new THREE.CanvasTexture(this.goCanvas);
    this.goTexture.minFilter = THREE.LinearFilter;

    const goGeom = new THREE.PlaneGeometry(1.65, 1.45);
    const goMat = new THREE.MeshBasicMaterial({
      map: this.goTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    this.goMesh = new THREE.Mesh(goGeom, goMat);
    this.goMesh.position.set(0, 0.12, -2.1);
    this.goMesh.visible = false;
    this.camera.add(this.goMesh);
  }

  public updateHover(pointerNdcX: number, pointerNdcY: number): void {
    if (!this.goMesh.visible) return;
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);

    const intersects = this.raycaster.intersectObject(this.goMesh);
    if (intersects.length > 0 && intersects[0].uv) {
      const uv = intersects[0].uv;
      const cx = uv.x * 1024;
      const cy = (1 - uv.y) * 1024;

      let found = null;
      for (const btn of this.buttons) {
        if (
          cx >= btn.x &&
          cx <= btn.x + btn.w &&
          cy >= btn.y &&
          cy <= btn.y + btn.h
        ) {
          found = btn.id;
          break;
        }
      }
      this.hoveredButtonId = found;
    } else {
      this.hoveredButtonId = null;
    }
  }

  public triggerClick(): boolean {
    if (this.hoveredButtonId) {
      const btn = this.buttons.find((b) => b.id === this.hoveredButtonId);
      if (btn) {
        btn.action();
        return true;
      }
    }
    return false;
  }

  public setGameOverDeathQuote(isHardVR = false): void {
    if (isHardVR) {
      this.lastQuote = getRandomDeathQuip();
    } else {
      this.lastQuote = randChoice(DEATH_QUOTES);
    }
  }

  public renderUI(
    state: GameState,
    score: number,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    dt: number,
    hasWebXR: boolean,
    onStartGame: () => void,
    onEnterVR: (mode: VRMode) => void,
    onRestart: () => void,
    onHome?: () => void,
    onToggleFullscreen?: () => void,
    isVR: boolean = false,
    vrMode: VRMode = VRMode.NONE
  ): void {
    this.buttons = [];

    if (this.quipTimer > 0) {
      this.quipTimer -= dt;
      if (this.quipTimer <= 0) {
        this.currentQuip = '';
      }
    }

    if (state === GameState.MENU) {
      this.hudMesh.visible = false;
      this.goMesh.visible = false;
      return;
    }

    if (state === GameState.PLAYING) {
      this.hudMesh.visible = true;
      this.goMesh.visible = false;
      this.hudCtx.clearRect(0, 0, 1024, 320);
      this.drawHUD(this.hudCtx, score, laneHealth, urgentLane, time, isVR, vrMode);
      this.hudTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.FALLING || state === GameState.GAMEOVER) {
      this.hudMesh.visible = false;
      if (isVR) {
        this.goMesh.visible = true;
        this.goCtx.clearRect(0, 0, 1024, 1024);
        this.drawGameOver(this.goCtx, score, onRestart, onHome || onRestart, time, true, vrMode);
        this.goTexture.needsUpdate = true;
      } else {
        this.goMesh.visible = false;
      }
      return;
    }
  }

  private drawHUD(
    ctx: CanvasRenderingContext2D,
    score: number,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    isVR: boolean = false,
    vrMode: VRMode = VRMode.NONE
  ): void {
    // Upper HUD ribbon
    ctx.fillStyle = 'rgba(10, 8, 25, 0.85)';
    this.roundRect(ctx, 16, 10, 992, 300, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Mode Banner
    ctx.textAlign = 'center';
    ctx.font = '800 21px system-ui, sans-serif';
    ctx.fillStyle = vrMode === VRMode.UNICORN_HARD ? '#ffdd00' : '#00d4ff';

    let bannerText = '🦄 STAB THE RAINBOW • BĚŽ A ZACHRAŇ DUHU 🌈';
    if (isVR) {
      if (vrMode === VRMode.UNICORN_HARD) {
        bannerText = '⚡ TY JSI JEDNOROŽEC! • NÁKLON = SMĚR • TRHNUTÍ = BODNUTÍ • VÝSKOK = SKOK 🦄';
      } else {
        bannerText = '🦄 JEZDEC NA JEDNOROŽCI • ROH V RUCE • SPOUŠŤ = BODNUTÍ • GRIP = SKOK 🥽';
      }
    }
    ctx.fillText(bannerText, 512, 42);

    // Score
    ctx.textAlign = 'left';
    ctx.font = '900 42px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SKÓRE: ${score}`, 40, 98);

    // Urgent Alert
    if (urgentLane >= 0 && urgentLane < LANE_COUNT) {
      const uName = COLOR_NAMES[urgentLane];
      const uCol = RAINBOW_HEX_STRINGS[urgentLane];
      const blink = sin(time * 16) > 0;

      ctx.textAlign = 'right';
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillStyle = blink ? uCol : '#ffffff';
      ctx.fillText(`⚡ ZACHRAŇ ${uName.toUpperCase()}!`, 984, 98);
    }

    // Dynamic Funny Quip Banner (if active in Hard Mode or milestone)
    if (this.currentQuip) {
      ctx.fillStyle = 'rgba(255, 221, 0, 0.16)';
      this.roundRect(ctx, 40, 114, 944, 44, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 221, 0, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = 'italic 700 20px system-ui, sans-serif';
      ctx.fillStyle = '#fffae0';
      ctx.fillText(`💬 "${this.currentQuip}"`, 512, 143);
    }

    // 7 Rainbow Lane Health Gems / Indicators
    const barStartY = 176;
    const barStartX = 40;
    const totalW = 944;
    const itemW = totalW / LANE_COUNT;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i];
      const x = barStartX + i * itemW;
      const col = RAINBOW_HEX_STRINGS[i];

      // Slot background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      this.roundRect(ctx, x + 4, barStartY, itemW - 8, 48, 10);
      ctx.fill();

      // Health fill
      if (h > 0.04) {
        ctx.fillStyle = col;
        const fillW = (itemW - 8) * h;
        this.roundRect(ctx, x + 4, barStartY, fillW, 48, 10);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.font = '900 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VOID', x + itemW / 2, barStartY + 31);
      }

      // Border
      ctx.strokeStyle = i === urgentLane ? '#ffffff' : col;
      ctx.lineWidth = i === urgentLane ? 3 : 1.5;
      this.roundRect(ctx, x + 4, barStartY, itemW - 8, 48, 10);
      ctx.stroke();
    }
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    onRestart: () => void,
    onHome: () => void,
    time: number,
    isVR: boolean = false,
    vrMode: VRMode = VRMode.NONE
  ): void {
    // Dark dramatic panel for VR
    ctx.fillStyle = 'rgba(20, 5, 18, 0.94)';
    this.roundRect(ctx, 140, 110, 744, 760, 36);
    ctx.fill();

    ctx.strokeStyle = '#ff2a4b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Game Over Title
    ctx.textAlign = 'center';
    ctx.font = '900 52px system-ui, sans-serif';
    ctx.fillStyle = '#ff2a4b';
    ctx.shadowColor = '#ff2a4b';
    ctx.shadowBlur = 24;
    ctx.fillText('💀 PÁD DO PROPASTI 💀', 512, 215);
    ctx.shadowBlur = 0;

    // Death quote
    ctx.font = 'italic 600 23px system-ui, sans-serif';
    ctx.fillStyle = '#ffd2d9';
    ctx.fillText(`"${this.lastQuote || 'Gravitace: 1, Jednorožec: 0'}"`, 512, 280);

    // Final Score
    ctx.font = '900 48px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SKÓRE: ${score}`, 512, 370);

    const isNewHigh = score >= this.highScore && score > 0;
    if (isNewHigh) {
      ctx.font = '800 28px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText('🎉 NOVÝ REKORD! 🎉', 512, 420);
    } else {
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`NEJLEPŠÍ SKÓRE: ${this.highScore}`, 512, 420);
    }

    // Mode-specific VR instructions
    if (vrMode === VRMode.UNICORN_HARD) {
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.fillStyle = '#10e052';
      ctx.fillText('Kývni prudce hlavou pro nový běh! 🦄', 512, 530);

      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#00d4ff';
      ctx.fillText('(Nebo stiskni spoušť na ovladači)', 512, 580);
    } else {
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.fillStyle = '#10e052';
      ctx.fillText('Stiskni SPOUŠŤ (Trigger) pro nový běh', 512, 530);

      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#00d4ff';
      ctx.fillText('Stiskni ÚCHOP (Grip) pro Hlavní Rozcestník', 512, 590);
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
