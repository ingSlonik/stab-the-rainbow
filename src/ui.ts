import {
  LANE_COUNT,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
  COLOR_NAMES_EN,
  GameState,
  VRMode,
  GameMode,
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

  // 1. Sleek score HUD attached to camera (static relative to eye)
  private hudMesh: any;
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D;
  private hudTexture: any;

  // 2. Rainbow track health percentages written directly on rainbow track below player
  private trackPercentMesh: any;
  private trackPercentCanvas: HTMLCanvasElement;
  private trackPercentCtx: CanvasRenderingContext2D;
  private trackPercentTexture: any;

  // 3. 3D Dialog panel (Menu & Game Over)
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

  private highScoreDesktop = 0;
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
      this.highScoreDesktop = parseInt(localStorage.getItem('str_h_desktop') || '0', 10) || 0;
      this.highScoreEasy =
        parseInt(localStorage.getItem('str_h_easy') || '0', 10) || 0;
      this.highScoreHard = parseInt(localStorage.getItem('str_h_hard') || '0', 10) || 0;
    } catch (_) {
      this.highScoreDesktop = 0;
      this.highScoreEasy = 0;
      this.highScoreHard = 0;
    }
  }

  public saveHighScore(score: number, mode: VRMode | GameMode): boolean {
    const isHard = mode === (VRMode.UNICORN_HARD as any) || mode === GameMode.VR_HARD;
    const isEasy = mode === (VRMode.RIDER_EASY as any) || mode === GameMode.VR_EASY;

    if (isHard) {
      if (score > this.highScoreHard) {
        this.highScoreHard = score;
        try {
          localStorage.setItem('str_h_hard', score.toString());
        } catch (_) { }
        return true;
      }
    } else if (isEasy) {
      if (score > this.highScoreEasy) {
        this.highScoreEasy = score;
        try {
          localStorage.setItem('str_h_easy', score.toString());
        } catch (_) { }
        return true;
      }
    } else {
      if (score > this.highScoreDesktop) {
        this.highScoreDesktop = score;
        try {
          localStorage.setItem('str_h_desktop', score.toString());
        } catch (_) { }
        return true;
      }
    }
    return false;
  }

  public getHighScore(mode: VRMode | GameMode): number {
    if (mode === (VRMode.UNICORN_HARD as any) || mode === GameMode.VR_HARD) return this.highScoreHard;
    if (mode === (VRMode.RIDER_EASY as any) || mode === GameMode.VR_EASY) return this.highScoreEasy;
    return this.highScoreDesktop;
  }

  public getLastQuote(): string {
    return this.lastQuote || 'Gravity was faster this time.';
  }

  public setQuip(text: string): void {
    this.currentQuip = text;
    this.quipTimer = 4.0;
  }

  public setGameOverPosition(playerX: number, playerY: number, isVR: boolean = false): void {
    if (!this.dialogMesh) return;
    if (isVR) {
      this.dialogMesh.position.set(playerX, playerY + 0.35, -2.8);
      this.dialogMesh.rotation.x = -0.05;
    } else {
      this.dialogMesh.position.set(0, playerY - 0.20, -3.2);
      this.dialogMesh.rotation.x = -0.08;
    }
  }

  public setMenuPosition(isVR: boolean = false): void {
    if (!this.dialogMesh) return;
    if (isVR) {
      this.dialogMesh.position.set(0, 1.65, -2.8);
      this.dialogMesh.rotation.x = -0.05;
    } else {
      this.dialogMesh.position.set(0, 1.75, -3.2);
      this.dialogMesh.rotation.x = -0.08;
    }
  }

  private initCanvasMesh(): void {
    // 1. Sleek lower-view HUD: attached to camera so it is static in the lower viewport in VR and Desktop
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = 1024;
    this.hudCanvas.height = 256;
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.minFilter = THREE.LinearFilter;

    const hudGeom = new THREE.PlaneGeometry(1.30, 0.325);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.hudMesh = new THREE.Mesh(hudGeom, hudMat);
    this.hudMesh.position.set(0, -0.44, -1.55);
    this.hudMesh.rotation.set(-0.22, 0, 0);
    this.hudMesh.renderOrder = 9999;
    this.hudMesh.visible = false;
    this.camera.add(this.hudMesh);

    // 2. Rainbow track health percentages: written directly on the rainbow track below the player!
    this.trackPercentCanvas = document.createElement('canvas');
    this.trackPercentCanvas.width = 1024;
    this.trackPercentCanvas.height = 160;
    this.trackPercentCtx = this.trackPercentCanvas.getContext('2d')!;

    this.trackPercentTexture = new THREE.CanvasTexture(this.trackPercentCanvas);
    this.trackPercentTexture.minFilter = THREE.LinearFilter;

    const trackGeom = new THREE.PlaneGeometry(7.7, 1.25);
    const trackMat = new THREE.MeshBasicMaterial({
      map: this.trackPercentTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.trackPercentMesh = new THREE.Mesh(trackGeom, trackMat);
    this.trackPercentMesh.position.set(0, 0.08, -3.6);
    this.trackPercentMesh.rotation.x = -Math.PI / 2 + 0.18;
    this.trackPercentMesh.visible = false;
    this.group.add(this.trackPercentMesh);

    // 3. Centered 3D Dialog panel (Menu & Game Over) in 3D world space (comfortable VR reading distance)
    this.dialogCanvas = document.createElement('canvas');
    this.dialogCanvas.width = 1024;
    this.dialogCanvas.height = 1024;
    this.dialogCtx = this.dialogCanvas.getContext('2d')!;

    this.dialogTexture = new THREE.CanvasTexture(this.dialogCanvas);
    this.dialogTexture.minFilter = THREE.LinearFilter;

    const dialogGeom = new THREE.PlaneGeometry(2.4, 2.4);
    const dialogMat = new THREE.MeshBasicMaterial({
      map: this.dialogTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });

    this.dialogMesh = new THREE.Mesh(dialogGeom, dialogMat);
    this.dialogMesh.position.set(0, 1.65, -2.8);
    this.dialogMesh.rotation.x = -0.05;
    this.dialogMesh.renderOrder = 2000;
    this.dialogMesh.visible = true;
    this.group.add(this.dialogMesh);
  }

  public updateHoverRay(origin: any, direction: any): { hit: boolean; point?: any } {
    if (!this.dialogMesh || !this.dialogMesh.visible) {
      this.hoveredButtonId = null;
      this.pointerX = -100;
      this.pointerY = -100;
      return { hit: false };
    }
    this.dialogMesh.updateMatrixWorld(true);
    this.raycaster.set(origin, direction);
    const intersects = this.raycaster.intersectObject(this.dialogMesh);
    return this.processIntersects(intersects);
  }

  public updateHoverNdc(pointerNdcX: number, pointerNdcY: number): { hit: boolean; point?: any } {
    if (!this.dialogMesh || !this.dialogMesh.visible) {
      this.hoveredButtonId = null;
      this.pointerX = -100;
      this.pointerY = -100;
      return { hit: false };
    }
    this.dialogMesh.updateMatrixWorld(true);
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.dialogMesh);
    return this.processIntersects(intersects);
  }

  private processIntersects(intersects: any[]): { hit: boolean; point?: any } {
    if (intersects.length > 0 && intersects[0].uv) {
      const hit = intersects[0];
      const uv = hit.uv;
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
      return { hit: true, point: hit.point };
    } else {
      this.hoveredButtonId = null;
      this.pointerX = -100;
      this.pointerY = -100;
      return { hit: false };
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
    combo: number,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    dt: number,
    onStartGame: (mode: VRMode | GameMode) => void,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
    isVR: boolean = false,
    vrMode: VRMode | GameMode = GameMode.DESKTOP
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
      if (this.trackPercentMesh) this.trackPercentMesh.visible = false;
      this.dialogMesh.visible = true;
      this.setMenuPosition(isVR);
      this.dialogCtx.clearRect(0, 0, 1024, 1024);
      this.drawMenu(this.dialogCtx, onStartGame, time, isVR, vrMode);
      this.drawPointerReticle(this.dialogCtx);
      this.dialogTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.PLAYING) {
      this.hudMesh.visible = true;
      if (this.trackPercentMesh) this.trackPercentMesh.visible = true;
      this.dialogMesh.visible = false;
      this.drawHUD(this.hudCtx, score, combo, laneHealth, urgentLane, time, vrMode);
      this.hudTexture.needsUpdate = true;

      this.drawTrackPercentages(this.trackPercentCtx, laneHealth, urgentLane, time);
      this.trackPercentTexture.needsUpdate = true;
      return;
    }

    if (state === GameState.FALLING) {
      this.hudMesh.visible = false;
      if (this.trackPercentMesh) this.trackPercentMesh.visible = false;
      this.dialogMesh.visible = false;
      return;
    }

    if (state === GameState.GAMEOVER) {
      this.hudMesh.visible = false;
      if (this.trackPercentMesh) this.trackPercentMesh.visible = false;
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
      const isHovering = !!this.hoveredButtonId;
      const ringRadius = isHovering ? 22 : 15;
      const dotRadius = isHovering ? 7 : 5;

      ctx.save();
      // Outer glowing pulse ring
      ctx.beginPath();
      ctx.arc(this.pointerX, this.pointerY, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isHovering ? '#ffffff' : '#00d4ff';
      ctx.lineWidth = isHovering ? 4 : 2.5;
      ctx.shadowColor = isHovering ? '#00d4ff' : '#ffffff';
      ctx.shadowBlur = 16;
      ctx.stroke();

      // Inner solid dot
      ctx.beginPath();
      ctx.arc(this.pointerX, this.pointerY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = isHovering ? '#ffdd00' : '#ffffff';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
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
    onStartGame: (mode: VRMode | GameMode) => void,
    time: number,
    isVR: boolean,
    currentMode: VRMode | GameMode
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
    ctx.fillText('CHOOSE DIFFICULTY ABOVE THE RAINBOW', 512, 206);

    // High Scores - Easy & Hard separated
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `HIGH SCORES:   EASY: ${this.highScoreEasy}   •   HARD: ${this.highScoreHard}`,
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
      'UNICORN RIDER (EASY)',
      'Horn in hand • Controller steers • Trigger = stab • Grip / Stick = jump',
      '#00d4ff',
      () => onStartGame(GameMode.VR_EASY)
    );

    this.drawButton(
      ctx,
      'btn-hard',
      120,
      480,
      784,
      130,
      'YOU ARE THE UNICORN! (HARD)',
      'Horn on forehead • Head lean steers • Head thrust stabs • Jump jumps',
      '#ffdd00',
      () => onStartGame(GameMode.VR_HARD)
    );

    // Instructions
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = '#c0cedf';
    ctx.fillText('🎯 Point with controller beam and press Trigger to select', 512, 670);

    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = '#8e9eb5';
    ctx.fillText('Return to menu anytime: Left Grip / ESC', 512, 715);
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
    time: number,
    isVR: boolean,
    vrMode: VRMode | GameMode
  ): void {
    const isHard = vrMode === (VRMode.UNICORN_HARD as any) || (vrMode as any) === GameMode.VR_HARD;
    const isEasy = vrMode === (VRMode.RIDER_EASY as any) || (vrMode as any) === GameMode.VR_EASY;
    const modeName = isHard ? 'VR HARD' : (isEasy ? 'VR EASY' : 'DESKTOP');
    const otherModeName = isHard ? 'VR EASY' : 'VR HARD';
    const highScore = this.getHighScore(vrMode);
    const isNewHigh = score >= highScore && score > 0;

    // Dark elegant panel
    ctx.fillStyle = 'rgba(16, 8, 24, 0.95)';
    this.roundRect(ctx, 100, 70, 824, 884, 32);
    ctx.fill();

    ctx.strokeStyle = '#ff7b00';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Title
    ctx.textAlign = 'center';
    ctx.font = '900 50px system-ui, sans-serif';
    ctx.fillStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 20;
    ctx.fillText('FELL INTO THE ABYSS', 512, 160);
    ctx.shadowBlur = 0;

    // Death quote
    ctx.font = 'italic 600 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffd2d9';
    ctx.fillText(`"${this.lastQuote || 'Gravity was faster this time.'}"`, 512, 218);

    // Final Score
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE (${modeName}): ${score.toLocaleString()}`, 512, 290);

    if (isNewHigh) {
      ctx.font = '800 26px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText('NEW HIGH SCORE!', 512, 335);
    } else {
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`BEST SCORE (${modeName}): ${highScore.toLocaleString()}`, 512, 335);
    }

    // Action Buttons
    this.drawButton(
      ctx,
      'btn-retry',
      140,
      390,
      744,
      100,
      `PLAY AGAIN (${modeName})`,
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
      'MAIN MENU',
      '',
      '#00d4ff',
      () => onHome()
    );

    if (isVR) {
      this.drawButton(
        ctx,
        'btn-toggle',
        140,
        640,
        744,
        100,
        `SWITCH TO ${otherModeName}`,
        '',
        '#ffdd00',
        () => onToggleMode()
      );
    }
  }

  private drawHUD(
    ctx: CanvasRenderingContext2D,
    score: number,
    combo: number,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    vrMode: VRMode | GameMode
  ): void {
    ctx.clearRect(0, 0, 1024, 256);

    // Sleek dark container background
    ctx.fillStyle = 'rgba(8, 5, 20, 0.88)';
    this.roundRect(ctx, 12, 10, 1000, 236, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // TOP ROW: Score, Combo, Mode
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 36px system-ui, sans-serif';

    // Glowing Score
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 12;
    ctx.fillText(`SCORE: ${score.toLocaleString()}`, 36, 44);
    ctx.shadowBlur = 0;

    // Combo
    if (combo > 1) {
      ctx.textAlign = 'center';
      ctx.font = '900 32px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 10;
      ctx.fillText(`COMBO x${combo}!`, 512, 44);
      ctx.shadowBlur = 0;
    }

    // Mode badge
    const isHard = vrMode === (VRMode.UNICORN_HARD as any) || (vrMode as any) === GameMode.VR_HARD;
    const isEasy = vrMode === (VRMode.RIDER_EASY as any) || (vrMode as any) === GameMode.VR_EASY;
    const modeLabel = isHard ? 'VR HARD' : (isEasy ? 'VR EASY' : 'DESKTOP');
    ctx.textAlign = 'right';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillStyle = '#a0b8d8';
    ctx.fillText(modeLabel, 988, 44);
    ctx.restore();

    // Separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 74);
    ctx.lineTo(992, 74);
    ctx.stroke();

    // BOTTOM ROW: 7 Rainbow Track Health Percentages
    const laneW = 960 / LANE_COUNT;
    const startX = 32;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i] ?? 1.0;
      const x = startX + i * laneW;
      const col = RAINBOW_HEX_STRINGS[i];
      const isUrgent = i === urgentLane;
      const isCritical = h < 0.32;

      // Lane Card
      ctx.fillStyle = 'rgba(18, 12, 36, 0.85)';
      this.roundRect(ctx, x + 4, 86, laneW - 8, 146, 14);
      ctx.fill();

      // Health Fill
      if (h > 0.04) {
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.45;
        const fillH = 138 * h;
        this.roundRect(ctx, x + 6, 86 + 142 - fillH, laneW - 12, fillH, 10);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Card Border
      const blink = sin(time * 18) > 0;
      ctx.strokeStyle = isUrgent
        ? (blink ? '#ffffff' : col)
        : isCritical
          ? (blink ? '#ffffff' : '#ff2a4b')
          : col;
      ctx.lineWidth = isUrgent || isCritical ? 3.5 : 1.5;
      this.roundRect(ctx, x + 4, 86, laneW - 8, 146, 14);
      ctx.stroke();

      // Color Label
      ctx.fillStyle = col;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(COLOR_NAMES_EN[i].toUpperCase(), x + laneW / 2, 114);

      // Percentage / EMPTY
      if (h > 0.04) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 34px system-ui, sans-serif';
        ctx.fillText(`${Math.round(h * 100)}%`, x + laneW / 2, 172);
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.fillText('EMPTY', x + laneW / 2, 168);
      }
    }
  }

  private drawTrackPercentages(
    ctx: CanvasRenderingContext2D,
    laneHealth: number[],
    urgentLane: number,
    time: number
  ): void {
    ctx.clearRect(0, 0, 1024, 160);

    const laneW = 1024 / LANE_COUNT;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i] ?? 1.0;
      const x = i * laneW;
      const col = RAINBOW_HEX_STRINGS[i];
      const isUrgent = i === urgentLane;
      const isCritical = h < 0.32;

      // Dark card on the rainbow lane
      ctx.fillStyle = 'rgba(10, 8, 25, 0.82)';
      this.roundRect(ctx, x + 5, 8, laneW - 10, 144, 16);
      ctx.fill();

      // Health fill background inside card
      if (h > 0.04) {
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.38;
        const fillH = 136 * h;
        this.roundRect(ctx, x + 9, 8 + 140 - fillH, laneW - 18, fillH, 12);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Border: flash white if urgent or critical
      const blink = sin(time * 18) > 0;
      ctx.strokeStyle = isUrgent
        ? (blink ? '#ffffff' : col)
        : isCritical
          ? (blink ? '#ffffff' : '#ff2a4b')
          : col;
      ctx.lineWidth = isUrgent || isCritical ? 4.5 : 2.0;
      this.roundRect(ctx, x + 5, 8, laneW - 10, 144, 16);
      ctx.stroke();

      // Color name
      ctx.fillStyle = col;
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(COLOR_NAMES_EN[i].toUpperCase(), x + laneW / 2, 42);

      // Percentage or EMPTY label
      if (h > 0.04) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 48px system-ui, sans-serif';
        ctx.fillText(`${Math.round(h * 100)}%`, x + laneW / 2, 104);
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.font = '900 28px system-ui, sans-serif';
        ctx.fillText('EMPTY', x + laneW / 2, 100);
      }
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
