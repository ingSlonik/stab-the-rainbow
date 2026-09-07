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

  // 3D UI Mesh & Texture (used for in-VR HUD and in-VR Game Over)
  private uiMesh: any;
  private uiCanvas: HTMLCanvasElement;
  private uiCtx: CanvasRenderingContext2D;
  private uiTexture: any;

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
    this.uiCanvas = document.createElement('canvas');
    this.uiCanvas.width = 1024;
    this.uiCanvas.height = 1024;
    this.uiCtx = this.uiCanvas.getContext('2d')!;

    this.uiTexture = new THREE.CanvasTexture(this.uiCanvas);
    this.uiTexture.minFilter = THREE.LinearFilter;
    this.uiTexture.magFilter = THREE.LinearFilter;

    const geom = new THREE.PlaneGeometry(2.4, 2.4);
    const mat = new THREE.MeshBasicMaterial({
      map: this.uiTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.uiMesh = new THREE.Mesh(geom, mat);
    this.uiMesh.renderOrder = 99999;
    this.uiMesh.position.set(0, 0, -2.4);
    this.uiMesh.visible = false;
    this.camera.add(this.uiMesh);
  }

  public updateHover(pointerNdcX: number, pointerNdcY: number): void {
    if (!this.uiMesh.visible) return;
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);

    const intersects = this.raycaster.intersectObject(this.uiMesh);
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
    const ctx = this.uiCtx;
    this.buttons = [];

    if (state === GameState.MENU) {
      // In MENU, 3D UI mesh is completely hidden: HTML DOM Rozcestník is used!
      this.uiMesh.visible = false;
      return;
    }

    if (state === GameState.PLAYING) {
      this.uiMesh.visible = true;
      ctx.clearRect(0, 0, 1024, 1024);
      this.drawHUD(ctx, score, laneHealth, urgentLane, time, isVR);
      this.uiTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.FALLING || state === GameState.GAMEOVER) {
      if (isVR) {
        this.uiMesh.visible = true;
        ctx.clearRect(0, 0, 1024, 1024);
        this.drawGameOver(ctx, score, onRestart, onHome || onRestart, time, true);
        this.uiTexture.needsUpdate = true;
      } else {
        this.uiMesh.visible = false;
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
    // Upper HUD ribbon (only covers top ~15% of screen, track is 100% visible)
    ctx.fillStyle = 'rgba(10, 8, 25, 0.78)';
    this.roundRect(ctx, 162, 20, 700, 150, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mode Banner
    ctx.textAlign = 'center';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(
      isVR
        ? '🥽 VR: NA TOHLE MUSÍŠ HLAVOU! • TRHNI VPŘED = BODNUTÍ 🦄'
        : '🦄 STAB THE RAINBOW • BĚŽ A ZACHRAŇ DUHU 🌈',
      512,
      50
    );

    // Score
    ctx.textAlign = 'left';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SKÓRE: ${score}`, 192, 88);

    // Urgent Alert
    if (urgentLane >= 0 && urgentLane < LANE_COUNT) {
      const uName = COLOR_NAMES[urgentLane];
      const uCol = RAINBOW_HEX_STRINGS[urgentLane];
      const blink = sin(time * 16) > 0;

      ctx.textAlign = 'right';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillStyle = blink ? uCol : '#ffffff';
      ctx.fillText(`⚡ ZACHRAŇ ${uName.toUpperCase()}!`, 830, 86);
    }

    // 7 Rainbow Lane Health Gems / Indicators
    const barStartY = 112;
    const barStartX = 192;
    const totalW = 640;
    const itemW = totalW / LANE_COUNT;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i];
      const x = barStartX + i * itemW;
      const col = RAINBOW_HEX_STRINGS[i];

      // Slot background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      this.roundRect(ctx, x + 3, barStartY, itemW - 6, 32, 8);
      ctx.fill();

      // Health fill
      if (h > 0.04) {
        ctx.fillStyle = col;
        const fillW = (itemW - 6) * h;
        this.roundRect(ctx, x + 3, barStartY, fillW, 32, 8);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VOID', x + itemW / 2, barStartY + 22);
      }

      // Border
      ctx.strokeStyle = i === urgentLane ? '#ffffff' : col;
      ctx.lineWidth = i === urgentLane ? 3 : 1.5;
      this.roundRect(ctx, x + 3, barStartY, itemW - 6, 32, 8);
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
