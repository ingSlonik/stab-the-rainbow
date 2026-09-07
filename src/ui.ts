import {
  LANE_COUNT,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
  COLOR_NAMES_CZ,
  GameState,
  VRMode,
} from './types';
import { sin, max, min, floor } from './math';
import { getRandomDeathQuip } from './quips';

export interface UIButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

export class UIManager {
  public group: any;
  private camera: any;

  // 3D UI Meshes: Upper HUD ribbon and 3D Dialog panel (Menu & Game Over)
  private hudMesh: any;
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D;
  private hudTexture: any;

  private dialogMesh: any;
  private dialogCanvas: HTMLCanvasElement;
  private dialogCtx: CanvasRenderingContext2D;
  private dialogTexture: any;

  // Interaction & Raycasting (for VR pointer/controller clicks)
  private raycaster: any;
  private mouseVec: any;
  private buttons: UIButton[] = [];
  private hoveredButtonId: string | null = null;
  private pointerX = -100;
  private pointerY = -100;

  private highScoreEasy = 0;
  private highScoreHard = 0;
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

    this.loadHighScores();
    this.initCanvasMesh();
  }

  private loadHighScores(): void {
    try {
      this.highScoreEasy =
        parseInt(localStorage.getItem('str_h_easy') || localStorage.getItem('str_high') || '0', 10) || 0;
      this.highScoreHard = parseInt(localStorage.getItem('str_h_hard') || '0', 10) || 0;
    } catch (_) {
      this.highScoreEasy = 0;
      this.highScoreHard = 0;
    }
  }

  public saveHighScore(score: number, vrMode: VRMode): boolean {
    const isHard = vrMode === VRMode.UNICORN_HARD;
    if (isHard) {
      if (score > this.highScoreHard) {
        this.highScoreHard = score;
        try {
          localStorage.setItem('str_h_hard', score.toString());
        } catch (_) {}
        return true;
      }
    } else {
      if (score > this.highScoreEasy) {
        this.highScoreEasy = score;
        try {
          localStorage.setItem('str_h_easy', score.toString());
          localStorage.setItem('str_high', score.toString());
        } catch (_) {}
        return true;
      }
    }
    return false;
  }

  public getHighScore(vrMode: VRMode): number {
    return vrMode === VRMode.UNICORN_HARD ? this.highScoreHard : this.highScoreEasy;
  }

  public getLastQuote(): string {
    return this.lastQuote || 'Gravitace byla tentokrát rychlejší.';
  }

  public setQuip(text: string): void {
    this.currentQuip = text;
    this.quipTimer = 4.0;
  }

  private initCanvasMesh(): void {
    // 1. Lower HUD dashboard ribbon: positioned at bottom so it doesn't block the view
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 1024;
    this.hudCanvas.height = 320;
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;

    const hudGeom = new THREE.PlaneGeometry(1.85, 0.56);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.hudMesh = new THREE.Mesh(hudGeom, hudMat);
    this.hudMesh.position.set(0, -0.62, -2.0);
    this.hudMesh.rotation.x = -0.26;
    this.hudMesh.renderOrder = 9999;
    this.hudMesh.visible = false;
    this.camera.add(this.hudMesh);

    // 2. Centered 3D Dialog panel (Menu & Game Over): always on top
    this.dialogCanvas = document.createElement('canvas');
    this.dialogCanvas.width = 1024;
    this.dialogCanvas.height = 1024;
    this.dialogCtx = this.dialogCanvas.getContext('2d')!;

    this.dialogTexture = new THREE.CanvasTexture(this.dialogCanvas);
    this.dialogTexture.minFilter = THREE.LinearFilter;

    const dialogGeom = new THREE.PlaneGeometry(1.68, 1.5);
    const dialogMat = new THREE.MeshBasicMaterial({
      map: this.dialogTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.dialogMesh = new THREE.Mesh(dialogGeom, dialogMat);
    this.dialogMesh.position.set(0, 0.08, -2.1);
    this.dialogMesh.renderOrder = 9999;
    this.dialogMesh.visible = true;
    this.camera.add(this.dialogMesh);
  }

  public updateHoverRay(origin: any, direction: any): void {
    if (!this.dialogMesh.visible) return;
    this.raycaster.set(origin, direction);
    const intersects = this.raycaster.intersectObject(this.dialogMesh);
    this.processIntersects(intersects);
  }

  public updateHoverNdc(pointerNdcX: number, pointerNdcY: number): void {
    if (!this.dialogMesh.visible) return;
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.dialogMesh);
    this.processIntersects(intersects);
  }

  private processIntersects(intersects: any[]): void {
    if (intersects.length > 0 && intersects[0].uv) {
      const uv = intersects[0].uv;
      const cx = uv.x * 1024;
      const cy = (1 - uv.y) * 1024;
      this.pointerX = cx;
      this.pointerY = cy;

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
      this.pointerX = -100;
      this.pointerY = -100;
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
    this.lastQuote = getRandomDeathQuip();
  }

  public renderUI(
    state: GameState,
    score: number,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    dt: number,
    onStartGame: (mode: VRMode) => void,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
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
      this.dialogMesh.visible = true;
      this.dialogCtx.clearRect(0, 0, 1024, 1024);
      this.drawMenu(this.dialogCtx, onStartGame, time, isVR, vrMode);
      this.drawPointerReticle(this.dialogCtx);
      this.dialogTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.PLAYING) {
      this.hudMesh.visible = true;
      this.dialogMesh.visible = false;
      this.hudCtx.clearRect(0, 0, 1024, 320);
      this.drawHUD(this.hudCtx, score, laneHealth, urgentLane, time, isVR, vrMode);
      this.hudTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.FALLING || state === GameState.GAMEOVER) {
      this.hudMesh.visible = false;
      this.dialogMesh.visible = true;
      this.dialogCtx.clearRect(0, 0, 1024, 1024);
      this.drawGameOver(this.dialogCtx, score, onRestart, onHome, onToggleMode, time, isVR, vrMode);
      this.drawPointerReticle(this.dialogCtx);
      this.dialogTexture.needsUpdate = true;
      return;
    }
  }

  private drawPointerReticle(ctx: CanvasRenderingContext2D): void {
    if (this.pointerX >= 0 && this.pointerY >= 0) {
      ctx.beginPath();
      ctx.arc(this.pointerX, this.pointerY, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffdd00';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    subtitle: string,
    color: string,
    action: () => void
  ): void {
    this.buttons.push({ id, x, y, w, h, action });
    const isHover = this.hoveredButtonId === id;

    ctx.fillStyle = isHover ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.07)';
    this.roundRect(ctx, x, y, w, h, 20);
    ctx.fill();

    ctx.strokeStyle = isHover ? '#ffffff' : color;
    ctx.lineWidth = isHover ? 4 : 2;
    ctx.stroke();

    ctx.fillStyle = isHover ? '#ffffff' : color;
    ctx.font = '800 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w / 2, y + (subtitle ? 42 : h / 2 + 10));

    if (subtitle) {
      ctx.fillStyle = isHover ? '#ffffff' : '#c8d6e5';
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.fillText(subtitle, x + w / 2, y + 76);
    }
  }

  private drawMenu(
    ctx: CanvasRenderingContext2D,
    onStartGame: (mode: VRMode) => void,
    time: number,
    isVR: boolean,
    currentMode: VRMode
  ): void {
    // Elegant dialog card
    ctx.fillStyle = 'rgba(12, 8, 28, 0.94)';
    this.roundRect(ctx, 80, 70, 864, 884, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.7)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Title
    ctx.textAlign = 'center';
    ctx.font = '900 52px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 20;
    ctx.fillText('STAB THE RAINBOW', 512, 160);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('BĚŽ A ZACHRAŇ DUHU', 512, 206);

    // High Scores - Easy & Hard separated
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `REKORD:  EASY: ${this.highScoreEasy}   •   HARD: ${this.highScoreHard}`,
      512,
      258
    );

    // Separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(140, 286);
    ctx.lineTo(884, 286);
    ctx.stroke();

    // Mode Selection Buttons
    this.drawButton(
      ctx,
      'btn-easy',
      120,
      320,
      784,
      130,
      'JEZDEC NA JEDNOROŽCI (EASY)',
      'Roh v ruce • Ovladač: směr • Spoušť = bodnutí • Grip = skok',
      '#00d4ff',
      () => onStartGame(VRMode.RIDER_EASY)
    );

    this.drawButton(
      ctx,
      'btn-hard',
      120,
      480,
      784,
      130,
      'TY JSI JEDNOROŽEC! (HARD)',
      'Roh na čele • Hlava: náklon řídí • trhnutí bodá • výskok skáče',
      '#ffdd00',
      () => onStartGame(VRMode.UNICORN_HARD)
    );

    // Instructions
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = '#c0cedf';
    ctx.fillText('🎯 Namiř rohem a stiskni spoušť pro výběr', 512, 670);

    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = '#8e9eb5';
    ctx.fillText('Návrat do menu kdykoliv: Grip (L) / ESC', 512, 715);
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
    time: number,
    isVR: boolean,
    vrMode: VRMode
  ): void {
    const isHard = vrMode === VRMode.UNICORN_HARD;
    const modeName = isHard ? 'HARD' : 'EASY';
    const otherModeName = isHard ? 'EASY' : 'HARD';
    const highScore = isHard ? this.highScoreHard : this.highScoreEasy;
    const isNewHigh = score >= highScore && score > 0;

    // Dark elegant panel
    ctx.fillStyle = 'rgba(16, 8, 24, 0.95)';
    this.roundRect(ctx, 100, 70, 824, 884, 32);
    ctx.fill();

    ctx.strokeStyle = '#ff7b00';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title (soft, no skull emoji)
    ctx.textAlign = 'center';
    ctx.font = '900 50px system-ui, sans-serif';
    ctx.fillStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 20;
    ctx.fillText('PÁD DO PROPASTI', 512, 160);
    ctx.shadowBlur = 0;

    // Death quote
    ctx.font = 'italic 600 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffd2d9';
    ctx.fillText(`"${this.lastQuote || 'Gravitace byla tentokrát rychlejší.'}"`, 512, 218);

    // Final Score
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SKÓRE (${modeName}): ${score}`, 512, 290);

    if (isNewHigh) {
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText('NOVÝ REKORD!', 512, 335);
    } else {
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`NEJLEPŠÍ SKÓRE (${modeName}): ${highScore}`, 512, 335);
    }

    // Action Buttons
    this.drawButton(
      ctx,
      'btn-retry',
      140,
      390,
      744,
      100,
      `HRÁT ZNOVU (${modeName})`,
      '',
      '#10e052',
      () => onRestart()
    );

    this.drawButton(
      ctx,
      'btn-home',
      140,
      515,
      744,
      100,
      'HLAVNÍ OBRAZOVKA (MENU)',
      '',
      '#00d4ff',
      () => onHome()
    );

    this.drawButton(
      ctx,
      'btn-toggle',
      140,
      640,
      744,
      100,
      `PŘEPNOUT NA ${otherModeName}`,
      '',
      '#ffdd00',
      () => onToggleMode()
    );
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
    ctx.fillStyle = 'rgba(10, 8, 25, 0.88)';
    this.roundRect(ctx, 16, 8, 992, 304, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const isHard = vrMode === VRMode.UNICORN_HARD;

    // Mode Banner
    ctx.textAlign = 'center';
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillStyle = isHard ? '#ffdd00' : '#00d4ff';

    let bannerText = isHard
      ? 'TY JSI JEDNOROŽEC • NÁKLON HLAVY = SMĚR • TRHNUTÍ = BODNUTÍ • VÝSKOK = SKOK'
      : 'JEZDEC NA JEDNOROŽCI • ROH V RUCE • SPOUŠŤ = BODNUTÍ • GRIP = SKOK';
    ctx.fillText(bannerText, 512, 38);

    // Score and High Score
    ctx.textAlign = 'left';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SKÓRE: ${score}`, 40, 84);

    const curHigh = this.getHighScore(vrMode);
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffdd00';
    ctx.fillText(`REKORD (${isHard ? 'HARD' : 'EASY'}): ${curHigh}`, 40, 114);

    // Urgent Alert
    if (urgentLane >= 0 && urgentLane < LANE_COUNT) {
      const uName = COLOR_NAMES_CZ[urgentLane];
      const uCol = RAINBOW_HEX_STRINGS[urgentLane];
      const blink = sin(time * 16) > 0;

      ctx.textAlign = 'right';
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.fillStyle = blink ? uCol : '#ffffff';
      ctx.fillText(`⚡ ZACHRAŇ: ${uName.toUpperCase()}!`, 984, 84);
    }

    // Dynamic Quip (if any)
    if (this.currentQuip) {
      ctx.fillStyle = 'rgba(255, 221, 0, 0.16)';
      this.roundRect(ctx, 40, 126, 944, 38, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 221, 0, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = 'italic 700 18px system-ui, sans-serif';
      ctx.fillStyle = '#fffae0';
      ctx.fillText(`"${this.currentQuip}"`, 512, 151);
    }

    // 7 Rainbow Lane Health Indicators - Clearly showing color decay
    const barStartY = 176;
    const barStartX = 40;
    const totalW = 944;
    const itemW = totalW / LANE_COUNT;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i];
      const x = barStartX + i * itemW;
      const col = RAINBOW_HEX_STRINGS[i];
      const isUrgent = i === urgentLane;
      const isCritical = h < 0.32;

      // Slot background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      this.roundRect(ctx, x + 4, barStartY, itemW - 8, 54, 10);
      ctx.fill();

      // Health fill
      if (h > 0.04) {
        ctx.fillStyle = col;
        const fillW = (itemW - 8) * h;
        this.roundRect(ctx, x + 4, barStartY, fillW, 54, 10);
        ctx.fill();

        // Color label & health percentage
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${COLOR_NAMES_CZ[i].slice(0, 3).toUpperCase()} ${Math.round(h * 100)}%`,
          x + itemW / 2,
          barStartY + 33
        );
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.font = '900 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PRÁZDNO', x + itemW / 2, barStartY + 33);
      }

      // Border: flash white if urgent or critical
      const blink = sin(time * 20) > 0;
      ctx.strokeStyle = isUrgent
        ? blink
          ? '#ffffff'
          : col
        : isCritical
        ? blink
          ? '#ffffff'
          : '#ff2a4b'
        : col;
      ctx.lineWidth = isUrgent || isCritical ? 3.5 : 1.5;
      this.roundRect(ctx, x + 4, barStartY, itemW - 8, 54, 10);
      ctx.stroke();
    }

    // Always-accessible menu hint
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = '#a0b0c8';
    ctx.textAlign = 'center';
    ctx.fillText(isVR ? 'NÁVRAT DO MENU KDYKOLIV: GRIP (L)' : 'NÁVRAT DO MENU: KLÁVESA ESC / H', 512, 260);
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
