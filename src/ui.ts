import {
  LANE_COUNT,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
  COLOR_NAMES,
  GameState,
} from './types';
import { sin, max, min, floor, randChoice } from './math';
import {
  toggleAudio,
  toggleSfx,
  getAudioMuted,
  getSfxMuted,
} from './audio';

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

  // 3D UI Mesh & Texture
  private uiMesh: any;
  private uiCanvas: HTMLCanvasElement;
  private uiCtx: CanvasRenderingContext2D;
  private uiTexture: any;

  // Interaction & Raycasting
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
      } catch (_) { }
      return true;
    }
    return false;
  }

  public getHighScore(): number {
    return this.highScore;
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
    // Position in front of camera view
    this.uiMesh.position.set(0, 0, -2.4);
    this.camera.add(this.uiMesh);
  }

  public updateHover(pointerNdcX: number, pointerNdcY: number): void {
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);

    const intersects = this.raycaster.intersectObject(this.uiMesh);
    if (intersects.length > 0 && intersects[0].uv) {
      const uv = intersects[0].uv;
      // Convert UV (0..1) to Canvas pixels (0..1024)
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
    onToggleFullscreen?: () => void
  ): void {
    const ctx = this.uiCtx;
    ctx.clearRect(0, 0, 1024, 1024);
    this.buttons = [];

    if (state === GameState.MENU) {
      this.drawMenu(ctx, time, hasWebXR, onStartGame, onEnterVR, onToggleFullscreen);
    } else if (state === GameState.PLAYING) {
      this.drawHUD(ctx, score, laneHealth, urgentLane, time);
    } else if (state === GameState.FALLING || state === GameState.GAMEOVER) {
      this.drawGameOver(ctx, score, onRestart, onHome || onRestart, time);
    }

    this.uiTexture.needsUpdate = true;
  }

  private drawMenu(
    ctx: CanvasRenderingContext2D,
    time: number,
    hasWebXR: boolean,
    onStartGame: () => void,
    onEnterVR: () => void,
    onToggleFullscreen?: () => void
  ): void {
    // Backdrop panel
    ctx.fillStyle = 'rgba(15, 10, 35, 0.88)';
    this.roundRect(ctx, 64, 30, 896, 960, 36);
    ctx.fill();

    // Rainbow border glow
    const grad = ctx.createLinearGradient(64, 30, 960, 990);
    RAINBOW_HEX_STRINGS.forEach((col, i) => {
      grad.addColorStop(i / 6, col);
    });
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Title
    ctx.textAlign = 'center';
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 20;
    ctx.fillText('✨ STAB THE RAINBOW ✨', 512, 110);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffd2f6';
    ctx.fillText('🦄 Ethereal Unicorn Gallop & Cloud Piercer 🌈', 512, 150);

    // VR Spectator Banner
    ctx.fillStyle = 'rgba(0, 212, 255, 0.15)';
    this.roundRect(ctx, 112, 172, 800, 38, 12);
    ctx.fill();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('🥽 PRIMÁRNĚ PRO VR • DESKTOP SLOUŽÍ PRO DIVÁKY VENKU 📺', 512, 197);

    // High Score badge
    ctx.fillStyle = 'rgba(255, 221, 0, 0.18)';
    this.roundRect(ctx, 312, 222, 400, 42, 14);
    ctx.fill();
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffdd00';
    ctx.fillText(`🏆 HIGH SCORE: ${this.highScore}`, 512, 251);

    // How to Play box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    this.roundRect(ctx, 112, 276, 800, 365, 24);
    ctx.fill();

    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('📖 OVLÁDÁNÍ / HOW TO PLAY', 512, 315);

    const instructions = [
      '• ŠIPKY [←] [→] / [A] [D]: Posun o pruh vedle (1 stisk = vedlejší pruh)',
      '• MEZERNÍK / [↑] / [W]: Skok přes propasti i k mrakům',
      '• ŠIPKA [↓] / [ENTER] / [SHIFT] / Levý klik: Bodnutí rohem (STAB)!',
      '• KLÁVESA [F]: Celá obrazovka (Fullscreen)',
      '• VE VR: Otáčením míříte roh, trhnutím vpřed bodnete, páčkou/úkrokem měníte pruh!',
      '• Mraky obnovují pruhy. Pokud šlápnete do prázdna, propadnete se!',
    ];

    ctx.textAlign = 'left';
    ctx.font = '400 20px system-ui, sans-serif';
    ctx.fillStyle = '#e8eeff';
    instructions.forEach((line, idx) => {
      ctx.fillText(line, 135, 360 + idx * 45);
    });

    // Start / Enter VR Buttons
    const btnW = 380;
    const btnH = 72;
    const btnY = 660;

    // Desktop Play Button
    this.drawButton(
      ctx,
      'btn_play',
      hasWebXR ? 112 : 322,
      btnY,
      btnW,
      btnH,
      '▶ PLAY (DESKTOP)',
      '#10e052',
      onStartGame
    );

    // VR Button
    if (hasWebXR) {
      this.drawButton(
        ctx,
        'btn_vr',
        532,
        btnY,
        btnW,
        btnH,
        '🥽 ENTER VR',
        '#00d4ff',
        onEnterVR
      );
    }

    // Audio & Fullscreen Toggles
    const isM = getAudioMuted();
    const isSm = getSfxMuted();

    this.drawButton(
      ctx,
      'btn_music',
      112,
      755,
      240,
      54,
      `🎵 MUSIC: ${isM ? 'OFF' : 'ON'}`,
      isM ? '#777777' : '#b82bfb',
      () => toggleAudio()
    );

    this.drawButton(
      ctx,
      'btn_sfx',
      392,
      755,
      240,
      54,
      `🔊 SFX: ${isSm ? 'OFF' : 'ON'}`,
      isSm ? '#777777' : '#ff7b00',
      () => toggleSfx()
    );

    this.drawButton(
      ctx,
      'btn_fs',
      672,
      755,
      240,
      54,
      '⛶ FULLSCREEN (F)',
      '#00d4ff',
      () => {
        if (onToggleFullscreen) onToggleFullscreen();
      }
    );

    // Credits
    ctx.textAlign = 'center';
    ctx.font = '400 18px system-ui, sans-serif';
    ctx.fillStyle = '#8f9db5';
    ctx.fillText('Made with Three.js r185 ESM for js13kGames 2026 • Created by Filip Paulů', 512, 855);
    ctx.fillText('https://stab-the-rainbow.paulu.cz/', 512, 885);
  }

  private drawHUD(
    ctx: CanvasRenderingContext2D,
    score: number,
    laneHealth: number[],
    urgentLane: number,
    time: number
  ): void {
    // Upper HUD ribbon
    ctx.fillStyle = 'rgba(10, 8, 25, 0.72)';
    this.roundRect(ctx, 162, 30, 700, 150, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spectator view indicator
    ctx.textAlign = 'center';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('📺 SPECTATOR VIEW • BEST IN VR 🥽', 512, 60);

    // Score
    ctx.textAlign = 'left';
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE: ${score}`, 195, 84);

    // Urgent Alert
    if (urgentLane >= 0 && urgentLane < LANE_COUNT) {
      const uName = COLOR_NAMES[urgentLane];
      const uCol = RAINBOW_HEX_STRINGS[urgentLane];
      const blink = sin(time * 16) > 0;

      ctx.textAlign = 'right';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillStyle = blink ? uCol : '#ffffff';
      ctx.fillText(`⚡ SAVE ${uName.toUpperCase()}!`, 830, 80);
    }

    // 7 Rainbow Lane Health Gems / Indicators
    const barStartY = 115;
    const barStartX = 200;
    const totalW = 624;
    const itemW = totalW / LANE_COUNT;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i];
      const x = barStartX + i * itemW;
      const col = RAINBOW_HEX_STRINGS[i];

      // Slot background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      this.roundRect(ctx, x + 4, barStartY, itemW - 8, 32, 8);
      ctx.fill();

      // Health fill
      if (h > 0.04) {
        ctx.fillStyle = col;
        const fillW = (itemW - 8) * h;
        this.roundRect(ctx, x + 4, barStartY, fillW, 32, 8);
        ctx.fill();
      } else {
        // Void warning
        ctx.fillStyle = '#ff2a4b';
        ctx.font = '900 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VOID', x + itemW / 2, barStartY + 23);
      }

      // Border
      ctx.strokeStyle = i === urgentLane ? '#ffffff' : col;
      ctx.lineWidth = i === urgentLane ? 3 : 1.5;
      this.roundRect(ctx, x + 4, barStartY, itemW - 8, 32, 8);
      ctx.stroke();
    }
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    onRestart: () => void,
    onHome: () => void,
    time: number
  ): void {
    // Dark dramatic panel
    ctx.fillStyle = 'rgba(20, 5, 15, 0.92)';
    this.roundRect(ctx, 162, 140, 700, 720, 36);
    ctx.fill();

    ctx.strokeStyle = '#ff2a4b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Game Over Title
    ctx.textAlign = 'center';
    ctx.font = '900 56px system-ui, sans-serif';
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

    // Try Again Button
    this.drawButton(
      ctx,
      'btn_retry',
      272,
      515,
      480,
      72,
      '🔄 TRY AGAIN',
      '#10e052',
      onRestart
    );

    // Return to Home Button
    this.drawButton(
      ctx,
      'btn_home',
      272,
      605,
      480,
      72,
      '🏠 RETURN TO HOME',
      '#00d4ff',
      onHome
    );

    ctx.font = '500 20px system-ui, sans-serif';
    ctx.fillStyle = '#8f9db5';
    ctx.fillText('Press SPACEBAR to restart • Press H or ESC for home', 512, 715);
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    colorHex: string,
    action: () => void
  ): void {
    const isHover = this.hoveredButtonId === id;

    // Register button for raycast interaction
    this.buttons.push({ id, x, y, w, h, text, action });

    // Background
    ctx.fillStyle = isHover ? colorHex : 'rgba(255, 255, 255, 0.12)';
    this.roundRect(ctx, x, y, w, h, 16);
    ctx.fill();

    // Border
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = isHover ? 4 : 2;
    this.roundRect(ctx, x, y, w, h, 16);
    ctx.stroke();

    // Label
    ctx.textAlign = 'center';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillStyle = isHover ? '#0b0816' : '#ffffff';
    ctx.fillText(text, x + w / 2, y + h / 2 + 9);
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
