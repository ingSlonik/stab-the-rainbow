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
  private reticle3DMesh: any;

  // 4. 3D Dynamic Lane Health Gauges on rainbow road (zero canvas overhead, 90/120Hz native WebGL)
  private laneGaugeGroup: any;
  private laneGaugeMeshes: any[] = [];

  // Interaction & Raycasting (for VR pointer/controller clicks)
  private raycaster: any;
  private mouseVec: any;
  private buttons: UIButton[] = [];
  public hoveredButtonId: string | null = null;
  public pointerX = -100;
  public pointerY = -100;

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
    // Helper to create active DOM-attached canvas elements (prevents Chromium / WebXR from freezing unattached canvas buffers)
    const createActiveCanvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const cvs = document.createElement('canvas');
      cvs.width = w;
      cvs.height = h;
      cvs.style.cssText =
        'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1000;';
      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(cvs);
      }
      const ctx = cvs.getContext('2d')!;
      return [cvs, ctx];
    };

    // 1. Sleek lower-view HUD: attached to camera so it is static in the lower viewport in VR and Desktop
    [this.hudCanvas, this.hudCtx] = createActiveCanvas(1024, 256);
    this.hudTexture = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTexture.generateMipmaps = false;
    this.hudTexture.magFilter = THREE.LinearFilter;
    this.hudTexture.minFilter = THREE.LinearFilter;

    const hudGeom = new THREE.PlaneGeometry(2.4, 0.60);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.hudMesh = new THREE.Mesh(hudGeom, hudMat);
    this.hudMesh.position.set(0, 2.45, -3.2);
    this.hudMesh.rotation.set(0.12, 0, 0);
    this.hudMesh.renderOrder = 9999;
    this.hudMesh.visible = false;
    this.group.add(this.hudMesh);

    // 2. Rainbow track health percentages: written directly on the rainbow track in front of the player!
    [this.trackPercentCanvas, this.trackPercentCtx] = createActiveCanvas(1024, 256);
    this.trackPercentTexture = new THREE.CanvasTexture(this.trackPercentCanvas);
    this.trackPercentTexture.generateMipmaps = false;
    this.trackPercentTexture.magFilter = THREE.LinearFilter;
    this.trackPercentTexture.minFilter = THREE.LinearFilter;

    const trackGeom = new THREE.PlaneGeometry(6.65, 1.45);
    const trackMat = new THREE.MeshBasicMaterial({
      map: this.trackPercentTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });

    this.trackPercentMesh = new THREE.Mesh(trackGeom, trackMat);
    this.trackPercentMesh.position.set(0, 0.20, -4.8);
    this.trackPercentMesh.rotation.set(-Math.PI / 2 + 0.40, 0, 0);
    this.trackPercentMesh.renderOrder = 100;
    this.trackPercentMesh.visible = true;
    this.group.add(this.trackPercentMesh);

    // 3. Centered 3D Dialog panel (Menu & Game Over) in 3D world space (comfortable VR reading distance)
    [this.dialogCanvas, this.dialogCtx] = createActiveCanvas(1024, 1024);
    this.dialogTexture = new THREE.CanvasTexture(this.dialogCanvas);
    this.dialogTexture.generateMipmaps = false;
    this.dialogTexture.magFilter = THREE.LinearFilter;
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

    // 4. Glowing 3D Laser Reticle Ring on dialog board (child of dialogMesh so it moves with it)
    const reticleGeom = new THREE.RingGeometry(0.045, 0.065, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.reticle3DMesh = new THREE.Mesh(reticleGeom, reticleMat);
    this.reticle3DMesh.renderOrder = 3000;
    this.reticle3DMesh.visible = false;
    this.dialogMesh.add(this.reticle3DMesh);

    // 5. 3D Dynamic Lane Health Indicator Gauges along the rainbow track surface (native WebGL 90Hz)
    this.laneGaugeGroup = new THREE.Group();
    this.group.add(this.laneGaugeGroup);

    for (let i = 0; i < LANE_COUNT; i++) {
      const barGeom = new THREE.BoxGeometry(0.88, 0.05, 1.3);
      barGeom.translate(0, 0.025, 0.65); // Pivot at front edge for backward scaling
      const barMat = new THREE.MeshBasicMaterial({
        color: RAINBOW_COLORS[i],
        transparent: true,
        opacity: 0.88,
        depthTest: true,
        depthWrite: false,
      });
      const barMesh = new THREE.Mesh(barGeom, barMat);
      barMesh.position.set(1.1 * (i - 3), 0.04, -4.7);
      barMesh.renderOrder = 120;
      this.laneGaugeGroup.add(barMesh);
      this.laneGaugeMeshes.push(barMesh);
    }
  }

  public updateHoverRay(origin: any, direction: any): { hit: boolean; point?: any } {
    if (!this.dialogMesh || !this.dialogMesh.visible) {
      this.hoveredButtonId = null;
      this.pointerX = -100;
      this.pointerY = -100;
      if (this.reticle3DMesh) this.reticle3DMesh.visible = false;
      return { hit: false };
    }
    this.dialogMesh.updateMatrixWorld(true);
    this.raycaster.set(origin, direction);
    const intersects = this.raycaster.intersectObject(this.dialogMesh);
    const res = this.processIntersects(intersects);
    if (this.reticle3DMesh) {
      if (res.hit && res.point) {
        const local = new THREE.Vector3();
        this.dialogMesh.worldToLocal(local.copy(res.point));
        this.reticle3DMesh.position.set(local.x, local.y, 0.02);
        this.reticle3DMesh.rotation.set(0, 0, 0);
        const isHover = !!this.hoveredButtonId;
        this.reticle3DMesh.scale.set(isHover ? 1.3 : 1.0, isHover ? 1.3 : 1.0, 1.0);
        this.reticle3DMesh.material.color.setHex(isHover ? 0xffdd00 : 0x00ffff);
        this.reticle3DMesh.visible = true;
      } else {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
    }
    return res;
  }

  public updateHoverNdc(pointerNdcX: number, pointerNdcY: number): { hit: boolean; point?: any } {
    if (!this.dialogMesh || !this.dialogMesh.visible) {
      this.hoveredButtonId = null;
      this.pointerX = -100;
      this.pointerY = -100;
      if (this.reticle3DMesh) {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
      return { hit: false };
    }
    this.dialogMesh.updateMatrixWorld(true);
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.dialogMesh);
    const res = this.processIntersects(intersects);
    if (this.reticle3DMesh) {
      if (res.hit && res.point) {
        const local = new THREE.Vector3();
        this.dialogMesh.worldToLocal(local.copy(res.point));
        this.reticle3DMesh.position.set(local.x, local.y, 0.02);
        this.reticle3DMesh.rotation.set(0, 0, 0);
        const isHover = !!this.hoveredButtonId;
        this.reticle3DMesh.scale.set(isHover ? 1.3 : 1.0, isHover ? 1.3 : 1.0, 1.0);
        this.reticle3DMesh.material.color.setHex(isHover ? 0xffdd00 : 0x00ffff);
        this.reticle3DMesh.visible = true;
      } else {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
    }
    return res;
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
        const pad = 18; // Generous hit padding for easy VR laser selection
        if (
          cx >= btn.x - pad &&
          cx <= btn.x + btn.w + pad &&
          cy >= btn.y - pad &&
          cy <= btn.y + btn.h + pad
        ) {
          found = btn.id;
          break;
        }
      }

      // If pointing anywhere on the menu dialog card, intelligently snap to closest difficulty
      if (!found && this.dialogMesh && this.dialogMesh.visible) {
        if (cx >= 80 && cx <= 944) {
          if (cy >= 180 && cy < 500) {
            found = 'btn-easy';
          } else if (cy >= 500 && cy <= 820) {
            found = 'btn-hard';
          }
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
    // High-confidence fallback if laser hits anywhere on the 3D board:
    if (this.pointerX >= 60 && this.pointerX <= 964) {
      const targetId = this.pointerY < 500 ? 'btn-easy' : 'btn-hard';
      const btn = this.buttons.find((b) => b.id === targetId) || this.buttons[0];
      if (btn) {
        btn.action();
        return true;
      }
    }
    return false;
  }

  public hideDialog(): void {
    if (this.dialogMesh) {
      this.dialogMesh.visible = false;
      this.dialogMesh.position.set(0, -999, 0);
    }
    if (this.reticle3DMesh) {
      this.reticle3DMesh.visible = false;
      this.reticle3DMesh.position.set(0, -999, 0);
    }
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

    // Always keep track percentages updated and visible on the rainbow road
    if (this.trackPercentMesh) {
      this.trackPercentMesh.visible = true;
      this.trackPercentMesh.position.set(0, 0.20, -4.8);
      this.trackPercentMesh.rotation.set(-Math.PI / 2 + 0.40, 0, 0);
      try {
        this.drawTrackPercentages(
          this.trackPercentCtx,
          laneHealth,
          urgentLane,
          time,
          score,
          combo,
          this.getHighScore(vrMode),
          isVR,
          vrMode
        );
      } catch (_) {}
      this.trackPercentTexture.needsUpdate = true;
      if (this.trackPercentMesh.material && this.trackPercentMesh.material.map) {
        this.trackPercentMesh.material.map.needsUpdate = true;
      }
    }

    // Always update 3D Lane Health Gauge bars on the rainbow road (real-time WebGL scaling)
    if (this.laneGaugeMeshes.length > 0) {
      for (let i = 0; i < LANE_COUNT; i++) {
        const h = laneHealth[i] ?? 1.0;
        const isUrgent = i === urgentLane;
        const isCritical = h < 0.32;
        const gauge = this.laneGaugeMeshes[i];
        if (gauge) {
          gauge.visible = h > 0.03;
          gauge.scale.set(1, 1, max(0.04, h));
          const blink = sin(time * 18) > 0;
          if (isUrgent) {
            gauge.material.color.setHex(blink ? 0xffffff : RAINBOW_COLORS[i]);
          } else if (isCritical) {
            gauge.material.color.setHex(blink ? 0xffffff : 0xff2a4b);
          } else {
            gauge.material.color.setHex(RAINBOW_COLORS[i]);
          }
        }
      }
    }

    if (state === GameState.MENU) {
      this.hudMesh.visible = false;
      this.hudMesh.position.set(0, -999, 0);
      this.dialogMesh.visible = true;
      this.setMenuPosition(isVR);
      this.dialogCtx.clearRect(0, 0, 1024, 1024);
      this.drawMenu(this.dialogCtx, onStartGame, time, isVR, vrMode);
      this.drawPointerReticle(this.dialogCtx);
      this.dialogTexture.needsUpdate = true;
      if (this.dialogMesh.material && this.dialogMesh.material.map) {
        this.dialogMesh.material.map.needsUpdate = true;
      }
      return;
    }

    if (state === GameState.PLAYING) {
      this.hudMesh.visible = false;
      this.hudMesh.position.set(0, -999, 0);
      this.dialogMesh.visible = false;
      this.dialogMesh.position.set(0, -999, 0);
      if (this.reticle3DMesh) {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
      return;
    }

    if (state === GameState.FALLING) {
      this.hudMesh.visible = false;
      this.hudMesh.position.set(0, -999, 0);
      this.dialogMesh.visible = false;
      this.dialogMesh.position.set(0, -999, 0);
      if (this.reticle3DMesh) {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
      return;
    }

    if (state === GameState.GAMEOVER) {
      this.hudMesh.visible = false;
      this.hudMesh.position.set(0, -999, 0);
      this.dialogMesh.visible = true;
      this.dialogCtx.clearRect(0, 0, 1024, 1024);
      this.drawGameOver(this.dialogCtx, score, onRestart, onHome, onToggleMode, time, isVR, vrMode);
      this.drawPointerReticle(this.dialogCtx);
      this.dialogTexture.needsUpdate = true;
      if (this.dialogMesh.material && this.dialogMesh.material.map) {
        this.dialogMesh.material.map.needsUpdate = true;
      }
      return;
    }
  }

  private drawPointerReticle(ctx: CanvasRenderingContext2D): void {
    if (this.pointerX >= 0 && this.pointerY >= 0) {
      const isHovering = !!this.hoveredButtonId;
      const ringRadius = isHovering ? 24 : 15;
      const dotRadius = isHovering ? 8 : 5;

      ctx.save();
      // Outer glowing pulse ring
      ctx.beginPath();
      ctx.arc(this.pointerX, this.pointerY, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isHovering ? '#ffffff' : '#00d4ff';
      ctx.lineWidth = isHovering ? 4.5 : 2.5;
      ctx.shadowColor = isHovering ? '#00d4ff' : '#ffffff';
      ctx.shadowBlur = 18;
      ctx.stroke();

      // Inner solid dot
      ctx.beginPath();
      ctx.arc(this.pointerX, this.pointerY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = isHovering ? '#ffdd00' : '#ffffff';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 12;
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

    if (isHover) {
      // Vivid glowing gradient fill
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      const colLower = color.toLowerCase();
      if (colLower.includes('ffdd00') || colLower.includes('yellow') || colLower.includes('ff7b00')) {
        grad.addColorStop(0, 'rgba(255, 221, 0, 0.48)');
        grad.addColorStop(1, 'rgba(255, 120, 0, 0.28)');
      } else if (colLower.includes('00d4ff') || colLower.includes('cyan')) {
        grad.addColorStop(0, 'rgba(0, 212, 255, 0.48)');
        grad.addColorStop(1, 'rgba(0, 120, 255, 0.28)');
      } else if (colLower.includes('10e052') || colLower.includes('green')) {
        grad.addColorStop(0, 'rgba(16, 224, 82, 0.48)');
        grad.addColorStop(1, 'rgba(0, 160, 60, 0.28)');
      } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        grad.addColorStop(1, 'rgba(200, 220, 255, 0.22)');
      }

      ctx.fillStyle = grad;
      this.roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 22);
      ctx.fill();

      // Glowing multi-layer border
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5.5;
      this.roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 22);
      ctx.stroke();
      ctx.restore();

      // Highlighted title
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const titleY = subtitle ? y + h * 0.40 : y + h * 0.5 + 10;
      ctx.fillText(`✨  ${title}  ✨`, x + w / 2, titleY);
      ctx.restore();

      if (subtitle) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 19px system-ui, sans-serif';
        ctx.fillText(subtitle, x + w / 2, y + h * 0.72);
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      this.roundRect(ctx, x, y, w, h, 20);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = '800 29px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const titleY = subtitle ? y + h * 0.40 : y + h * 0.5 + 10;
      ctx.fillText(title, x + w / 2, titleY);

      if (subtitle) {
        ctx.fillStyle = '#c8d6e5';
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.fillText(subtitle, x + w / 2, y + h * 0.72);
      }
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

    // Mode Selection Buttons - Large, accessible touch targets
    this.drawButton(
      ctx,
      'btn-easy',
      100,
      300,
      824,
      175,
      'UNICORN RIDER (EASY)',
      'Horn in hand • Controller steers • Ram / Trigger pops • Buttons jump',
      '#00d4ff',
      () => onStartGame(GameMode.VR_EASY)
    );

    this.drawButton(
      ctx,
      'btn-hard',
      100,
      505,
      824,
      175,
      'YOU ARE THE UNICORN! (HARD)',
      'Horn on head • Lean to steer • Ram to pop • Buttons jump',
      '#ffdd00',
      () => onStartGame(GameMode.VR_HARD)
    );

    // Instructions
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = '#e0ecff';
    ctx.fillText('🎯 Point ray & pull Trigger, OR press A (Easy) / B (Hard)', 512, 735);

    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = '#9cb3d0';
    ctx.fillText('Jump: Controller A / X or Thumbstick Up • Pause: Esc', 512, 778);

    try {
      (window as any)._df = ctx.getImageData(0, 0, 1, 1);
    } catch (_) {}
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
        'SWITCH TO ' + otherModeName,
        '',
        '#ffdd00',
        () => onToggleMode()
      );
    }

    try {
      (window as any)._gof = ctx.getImageData(0, 0, 1, 1);
    } catch (_) {}
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
        ctx.globalAlpha = 0.55;
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
      ctx.lineWidth = isUrgent || isCritical ? 4.0 : 2.0;
      this.roundRect(ctx, x + 4, 86, laneW - 8, 146, 14);
      ctx.stroke();

      // Color Label
      ctx.fillStyle = col;
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(COLOR_NAMES_EN[i].toUpperCase(), x + laneW / 2, 114);

      // Percentage / EMPTY
      ctx.save();
      if (h > 0.04) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 8;
        ctx.font = '900 38px system-ui, sans-serif';
        ctx.fillText(`${Math.round(h * 100)}%`, x + laneW / 2, 174);
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.shadowColor = '#ff2a4b';
        ctx.shadowBlur = 10;
        ctx.font = '900 24px system-ui, sans-serif';
        ctx.fillText('EMPTY', x + laneW / 2, 170);
      }
      ctx.restore();
    }
  }

  private drawTrackPercentages(
    ctx: CanvasRenderingContext2D,
    laneHealth: number[],
    urgentLane: number,
    time: number,
    score: number = 0,
    combo: number = 1,
    highScore: number = 0,
    isVR: boolean = false,
    vrMode: VRMode | GameMode = GameMode.DESKTOP
  ): void {
    ctx.clearRect(0, 0, 1024, 256);

    // 1. TOP HEADER: Score, Combo / Best Score, Mode
    ctx.fillStyle = 'rgba(8, 6, 22, 0.90)';
    this.roundRect(ctx, 8, 6, 1008, 52, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.textBaseline = 'middle';

    // Left: Live Score
    ctx.textAlign = 'left';
    ctx.font = '900 28px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 10;
    const scoreStr = Math.floor(score).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    ctx.fillText(`SCORE: ${scoreStr}`, 28, 32);
    ctx.shadowBlur = 0;

    // Heartbeat Pulse Indicator on header to visually guarantee active frame loop
    const pulseX = 260 + sin(time * 6) * 35;
    ctx.beginPath();
    ctx.arc(pulseX, 32, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = combo > 1 ? '#ffdd00' : '#00d4ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Center: Combo or Best Score
    ctx.textAlign = 'center';
    if (combo > 1) {
      ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillStyle = '#ffdd00';
      ctx.shadowColor = '#ffdd00';
      ctx.shadowBlur = 12;
      ctx.fillText(`🔥 COMBO x${combo}! 🔥`, 512, 32);
      ctx.shadowBlur = 0;
    } else {
      ctx.font = '800 21px system-ui, sans-serif';
      ctx.fillStyle = '#ffd24d';
      const bestStr = Math.floor(highScore).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      ctx.fillText(`BEST: ${bestStr}`, 512, 32);
    }

    // Right: Mode
    const isHard = vrMode === (VRMode.UNICORN_HARD as any) || (vrMode as any) === GameMode.VR_HARD;
    const isEasy = vrMode === (VRMode.RIDER_EASY as any) || (vrMode as any) === GameMode.VR_EASY;
    const modeLabel = isHard ? 'VR HARD' : (isEasy ? 'VR EASY' : 'DESKTOP');
    ctx.textAlign = 'right';
    ctx.font = '800 21px system-ui, sans-serif';
    ctx.fillStyle = '#a0b8d8';
    ctx.fillText(modeLabel, 996, 32);
    ctx.restore();

    // 2. BOTTOM CARDS: 7 Rainbow Lane Columns
    const colW = 1008 / LANE_COUNT;
    const startX = 8;
    const cardY = 66;
    const cardH = 184;

    for (let i = 0; i < LANE_COUNT; i++) {
      const h = laneHealth[i] ?? 1.0;
      const x = startX + i * colW + 3;
      const w = colW - 6;
      const col = RAINBOW_HEX_STRINGS[i];
      const isUrgent = i === urgentLane;
      const isCritical = h < 0.32;

      // Dark card container
      ctx.fillStyle = 'rgba(12, 9, 28, 0.88)';
      this.roundRect(ctx, x, cardY, w, cardH, 12);
      ctx.fill();

      // Dynamic health fill from bottom of card
      if (h > 0.04) {
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.52;
        const fillH = (cardH - 8) * h;
        this.roundRect(ctx, x + 3, cardY + cardH - 4 - fillH, w - 6, fillH, 9);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Border with urgent/critical pulse
      const blink = sin(time * 18) > 0;
      ctx.strokeStyle = isUrgent
        ? (blink ? '#ffffff' : col)
        : isCritical
          ? (blink ? '#ffffff' : '#ff2a4b')
          : col;
      ctx.lineWidth = isUrgent || isCritical ? 4.5 : 2.0;
      this.roundRect(ctx, x, cardY, w, cardH, 12);
      ctx.stroke();

      // Lane Color Name
      ctx.fillStyle = col;
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(COLOR_NAMES_EN[i].toUpperCase(), x + w / 2, cardY + 28);

      // Percentage or EMPTY
      ctx.save();
      if (h > 0.04) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 8;
        ctx.font = '900 44px system-ui, sans-serif';
        ctx.fillText(`${Math.round(h * 100)}%`, x + w / 2, cardY + 92);
      } else {
        ctx.fillStyle = '#ff2a4b';
        ctx.shadowColor = '#ff2a4b';
        ctx.shadowBlur = 10;
        ctx.font = '900 25px system-ui, sans-serif';
        ctx.fillText('EMPTY', x + w / 2, cardY + 90);
      }
      ctx.restore();

      // Status Indicator
      ctx.save();
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      if (h > 0.70) {
        ctx.fillStyle = '#10e052';
        ctx.fillText('● OK', x + w / 2, cardY + 148);
      } else if (h > 0.32) {
        ctx.fillStyle = '#ffdd00';
        ctx.fillText('▲ DRAIN', x + w / 2, cardY + 148);
      } else if (h > 0.04) {
        ctx.fillStyle = '#ff2a4b';
        ctx.fillText('⚠ ALERT', x + w / 2, cardY + 148);
      } else {
        ctx.fillStyle = '#888888';
        ctx.fillText('✖ GONE', x + w / 2, cardY + 148);
      }
      ctx.restore();
    }

    // Force Chromium / WebXR GPU synchronization flush
    try {
      (window as any)._cf = ctx.getImageData(0, 0, 1, 1);
    } catch (_) {}
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
