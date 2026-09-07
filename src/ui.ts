import {
  LANE_COUNT,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
  COLOR_NAMES,
  GameState,
} from './types';
import { sin, max, min, floor, randChoice } from './math';

const DEATH_QUOTES = [
  'Gravity: 1, Unicorn: 0',
  'You stepped on a missing lane. Newton is weeping.',
  'Rainbow out of order. Please insert 1 cloud.',
  'Flight capabilities not installed on this horn.',
  'Lost forever in the cyan-deprived astral abyss.',
  'The laws of optics have left the chat.',
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

export class UIManager {
  public group: any;
  private camera: any;

  // 3D UI Meshes: Slim HUD ribbon and VR Game Over panel
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

  private initCanvasMesh(): void {
    // 1. Sleek upper HUD ribbon (never occludes track or horn)
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 1024;
    this.hudCanvas.height = 256;
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;

    const hudGeom = new THREE.PlaneGeometry(1.6, 0.40);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.hudMesh = new THREE.Mesh(hudGeom, hudMat);
    this.hudMesh.position.set(0, 0.55, -1.8);
    this.hudMesh.rotation.x = 0.12;
    this.hudMesh.visible = false;
    this.camera.add(this.hudMesh);

    // 2. Centered VR Game Over card
    this.goCanvas = document.createElement('canvas');
    this.goCanvas.width = 1024;
    this.goCanvas.height = 1024;
    this.goCtx = this.goCanvas.getContext('2d')!;

    this.goTexture = new THREE.CanvasTexture(this.goCanvas);
    this.goTexture.minFilter = THREE.LinearFilter;

    const goGeom = new THREE.PlaneGeometry(1.6, 1.4);
    const goMat = new THREE.MeshBasicMaterial({
      map: this.goTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.goMesh = new THREE.Mesh(goGeom, goMat);
    this.goMesh.position.set(0, 0.05, -1.8);
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

  public setGameOverDeathQuote(): void {
    this.lastQuote = randChoice(DEATH_QUOTES);
  }

  public renderUI(
    state: GameState,
    score: number,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    hasWebXR: boolean,
    onStartGame: () => void,
    onEnterVR: () => void,
    onRestart: () => void,
    onHome?: () => void,
    onToggleFullscreen?: () => void,
    isVR: boolean = false
  ): void {
    this.buttons = [];

    if (state === GameState.MENU) {
      // In MENU, 3D UI mesh is completely hidden: HTML DOM Rozcestník is used!
      this.hudMesh.visible = false;
      this.goMesh.visible = false;
      return;
    }

    if (state === GameState.PLAYING) {
      this.hudMesh.visible = true;
      this.goMesh.visible = false;
      this.hudCtx.clearRect(0, 0, 1024, 256);
      this.drawHUD(this.hudCtx, score, laneHealth, urgentLane, time, isVR);
      this.hudTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.FALLING || state === GameState.GAMEOVER) {
      this.hudMesh.visible = false;
      if (isVR) {
        this.goMesh.visible = true;
        this.goCtx.clearRect(0, 0, 1024, 1024);
        this.drawGameOver(this.goCtx, score, onRestart, onHome || onRestart, time, true);
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
    isVR: boolean = false
  ): void {
    // Upper HUD ribbon (only covers top visor of screen, track is 100% visible)
    ctx.fillStyle = 'rgba(10, 8, 25, 0.82)';
    this.roundRect(ctx, 24, 12, 976, 232, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mode Banner
    ctx.textAlign = 'center';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(
      isVR
        ? '🥽 VR: NA TOHLE MUSÍŠ HLAVOU! • TRHNI VPŘED = BODNUTÍ 🦄'
        : '🦄 STAB THE RAINBOW • BĚŽ A ZACHRAŇ DUHU 🌈',
      512,
      46
    );

    // Score
    ctx.textAlign = 'left';
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SKÓRE: ${score}`, 48, 104);

    // Urgent Alert
    if (urgentLane >= 0 && urgentLane < LANE_COUNT) {
      const uName = COLOR_NAMES[urgentLane];
      const uCol = RAINBOW_HEX_STRINGS[urgentLane];
      const blink = sin(time * 16) > 0;

      ctx.textAlign = 'right';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillStyle = blink ? uCol : '#ffffff';
      ctx.fillText(`⚡ ZACHRAŇ ${uName.toUpperCase()}!`, 976, 104);
    }

    // 7 Rainbow Lane Health Gems / Indicators
    const barStartY = 142;
    const barStartX = 48;
    const totalW = 928;
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
    isVR: boolean = false
  ): void {
    // Dark dramatic panel for VR
    ctx.fillStyle = 'rgba(20, 5, 15, 0.92)';
    this.roundRect(ctx, 162, 140, 700, 720, 36);
    ctx.fill();

    ctx.strokeStyle = '#ff2a4b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Game Over Title
    ctx.textAlign = 'center';
    ctx.font = '900 54px system-ui, sans-serif';
    ctx.fillStyle = '#ff2a4b';
    ctx.shadowColor = '#ff2a4b';
    ctx.shadowBlur = 24;
    ctx.fillText('FELL INTO THE VOID', 512, 245);
    ctx.shadowBlur = 0;

    // Death quote
    ctx.font = 'italic 500 24px system-ui, sans-serif';
    ctx.fillStyle = '#ffd2d9';
    ctx.fillText(`"${this.lastQuote || 'Gravity always wins.'}"`, 512, 305);

    // Final Score
    ctx.font = '900 48px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`FINAL SCORE: ${score}`, 512, 395);

    const isNewHigh = score >= this.highScore && score > 0;
    if (isNewHigh) {
      ctx.font = '700 28px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText('🎉 NEW HIGH RECORD! 🎉', 512, 445);
    } else {
      ctx.font = '600 24px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`BEST RECORD: ${this.highScore}`, 512, 445);
    }

    // VR instructions
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillStyle = '#10e052';
    ctx.fillText('Stiskni SPOUŠŤ pro nový běh', 512, 540);

    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('Stiskni ÚCHOP (Grip) pro Hlavní Rozcestník', 512, 600);
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
