import {
  LANE_COUNT,
  LANE_WIDTH,
  RAINBOW_COLORS,
  RAINBOW_HEX_STRINGS,
  COLOR_NAMES_EN,
  GameState,
  GameMode,
} from './types';
import { sin, max, min, floor } from './math';
import { getRandomDeathQuip } from './quips';
import { toggleAudio, toggleSfx, getAudioMuted, getSfxMuted } from './audio';

export interface UIButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

const uiFont = (size: number, weight: number | string = 900) => `${weight} ${size}px system-ui, sans-serif`;

const createQuad = (w: number, h: number, mat: any, x: number, y: number, z: number, order: number, parent: any): any => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.renderOrder = order;
  parent.add(mesh);
  return mesh;
};

const createMat = (color: number | string, opacity = 1.0): any => {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1.0,
    opacity,
    depthWrite: false,
  });
};

export class UIManager {
  public group: any;
  private camera: any;

  // 1. 100% Native 3D HUD Board (zero canvas dynamic uploads, 90/120Hz WebGL)
  private board3DGroup: any;
  private charMaterials: Record<string, any> = {};
  private labelMaterials: Record<string, any> = {};
  private scoreDigitMeshes: any[] = [];
  private bestDigitMeshes: any[] = [];
  private comboLabelMesh: any;
  private bestLabelMesh: any;
  private modeLabelMesh: any;
  private heartbeatMesh: any;
  private laneColumns: Array<{
    colGroup: any;
    borderMesh: any;
    cardMesh: any;
    colorLabelMesh: any;
    percentDigitMeshes: any[];
    emptyMesh: any;
    statusTextMesh: any;
    statusPillMesh: any;
    gaugeMesh: any;
  }> = [];

  // Floating 3D Popups (100% on pierce, -5% on miss)
  private floatingPopups: Array<{
    mesh: any;
    life: number;
    maxLife: number;
    active: boolean;
  }> = [];

  // 2. 3D Dialog panel (Menu & Game Over)
  private dialogMesh: any;
  private dialogCanvas: HTMLCanvasElement;
  private dialogCtx: CanvasRenderingContext2D;
  private dialogTexture: any;
  private reticle3DMesh: any;

  // Dialog Canvas dirty tracking (prevents expensive 1024x1024 redraws every frame)
  private dialogDirty = true;
  private lastDialogState: GameState | null = null;
  private lastDialogAudioMuted: boolean = false;
  private lastDialogSfxMuted: boolean = false;
  private lastDialogScore: number = -1;
  private lastDialogIsVR: boolean = false;
  private lastDialogVRMode: GameMode = GameMode.DESKTOP;
  private tempLocalVec: any;

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
    this.tempLocalVec = new THREE.Vector3();

    this.loadHighScores();
    this.initStaticMaterials();
    this.initCanvasMesh();
    this.init3DBoard();
    this.initFloatingPopups(scene);
  }

  private getScoreKey(mode: GameMode): [string, 'highScoreHard' | 'highScoreEasy' | 'highScoreDesktop'] {
    if (mode === GameMode.VR_HARD) return ['str_h_hard', 'highScoreHard'];
    if (mode === GameMode.VR_EASY) return ['str_h_easy', 'highScoreEasy'];
    return ['str_h_desktop', 'highScoreDesktop'];
  }

  private loadHighScores(): void {
    const get = (k: string) => {
      try { return parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (_) { return 0; }
    };
    this.highScoreDesktop = get('str_h_desktop');
    this.highScoreEasy = get('str_h_easy');
    this.highScoreHard = get('str_h_hard');
  }

  public saveHighScore(score: number, mode: GameMode): boolean {
    const [key, prop] = this.getScoreKey(mode);
    if (score > this[prop]) {
      this[prop] = score;
      this.dialogDirty = true;
      try {
        localStorage.setItem(key, score.toString());
      } catch (_) { }
      return true;
    }
    return false;
  }

  public getHighScore(mode: GameMode): number {
    return this[this.getScoreKey(mode)[1]];
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
    this.dialogMesh.position.set(isVR ? playerX : 0, playerY + (isVR ? 0.35 : -0.20), isVR ? -2.8 : -3.2);
    this.dialogMesh.rotation.x = isVR ? -0.05 : -0.08;
  }

  public setMenuPosition(isVR: boolean = false): void {
    if (!this.dialogMesh) return;
    this.dialogMesh.position.set(0, isVR ? 2.15 : 2.25, isVR ? -2.8 : -3.2);
    this.dialogMesh.rotation.x = isVR ? -0.03 : -0.04;
  }

  private createTextMaterial(
    text: string,
    font: string,
    color: string,
    w: number,
    h: number,
    glowColor?: string
  ): any {
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);

    const tex = new THREE.CanvasTexture(cvs);
    tex.generateMipmaps = false;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
  }

  private initStaticMaterials(): void {
    // 1. Single-character materials (pre-rasterized once at boot)
    const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%', ',', ' ', 'x', '!', '-'];
    for (const ch of chars) {
      this.charMaterials[ch] = this.createTextMaterial(
        ch,
        uiFont(110),
        '#ffffff',
        112,
        140,
        '#000000'
      );
    }

    // 2. Fixed UI Labels (enlarged for crisp readability and prominent header)
    const fixedLabels: [string, number, string, number, number, string?][] = [
      ['SCORE:', 48, '#ffffff', 280, 72, '#00d4ff'],
      ['BEST:', 44, '#ffd24d', 240, 72],
      ['COMBO', 48, '#ffdd00', 240, 72, '#ffdd00'],
      ['VR EASY', 46, '#00d4ff', 340, 72],
      ['VR HARD', 46, '#ffdd00', 340, 72],
      ['DESKTOP', 46, '#a0b8d8', 340, 72],
      // 4. Status Badges
      ['● OK', 30, '#10e052', 180, 48],
      ['▲ DRAIN', 30, '#ffdd00', 180, 48],
      ['⚠ ALERT', 30, '#ff2a4b', 180, 48],
      ['✖ GONE', 30, '#888888', 180, 48],
      ['EMPTY', 46, '#ff2a4b', 240, 72, '#ff2a4b'],
      ['100%', 64, '#ffffff', 220, 76, '#000000'],
      ['-5%', 64, '#ffffff', 180, 76, '#000000'],
    ];

    for (const [text, sz, col, w, h, glow] of fixedLabels) {
      this.labelMaterials[text] = this.createTextMaterial(text, uiFont(sz), col, w, h, glow);
    }

    // 3. Lane Color Names
    for (let i = 0; i < LANE_COUNT; i++) {
      const name = COLOR_NAMES_EN[i].toUpperCase();
      this.labelMaterials[name] = this.createTextMaterial(
        name,
        uiFont(36),
        RAINBOW_HEX_STRINGS[i],
        220,
        56
      );
    }
  }

  private init3DBoard(): void {
    this.board3DGroup = new THREE.Group();
    // Positioned closer to player with optimized sightline tilt
    this.board3DGroup.position.set(0, 0.74, -2.7);
    this.board3DGroup.rotation.set(-Math.PI / 2 + 0.46, 0, 0);
    this.group.add(this.board3DGroup);

    // 1. Dark Main Backplate (tightened to 2.80m width, exactly matching the 2.80m rainbow track with minimal side padding)
    const bgMesh = createQuad(2.80, 0.82, createMat(0x080616, 0.90), 0, 0.09, 0, 100, this.board3DGroup);

    // Subtle cyan frame outline
    const frameEdges = new THREE.EdgesGeometry(bgMesh.geometry);
    const frameLine = new THREE.LineSegments(
      frameEdges,
      new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 })
    );
    frameLine.position.set(0, 0.09, 0.005);
    frameLine.renderOrder = 101;
    this.board3DGroup.add(frameLine);

    // Separator line between header and lane columns
    createQuad(2.78, 0.012, createMat(0x00d4ff, 0.35), 0, 0.24, 0.01, 102, this.board3DGroup);

    // 2. Top Header Bar (prominently enlarged fonts for score, multiplier/combo, and game mode)
    // Left: "SCORE:" Label
    createQuad(0.32, 0.11, this.labelMaterials['SCORE:'], -1.18, 0.36, 0.02, 104, this.board3DGroup);

    // Score Digits (8 digit quads, enlarged for crisp visibility)
    const makeDigits = (count: number, startX: number) => {
      const arr = [];
      for (let d = 0; d < count; d++) {
        arr.push(createQuad(0.065, 0.11, this.charMaterials[' '], startX + d * 0.068, 0.36, 0.02, 104, this.board3DGroup));
      }
      return arr;
    };

    // Score Digits (8 digit quads, enlarged for crisp visibility)
    this.scoreDigitMeshes = makeDigits(8, -0.97);

    // Heartbeat Pulse Mesh (instant visual feedback of 90/120Hz live frame loop)
    const hbGeom = new THREE.CircleGeometry(0.022, 16);
    const hbMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, depthWrite: false });
    this.heartbeatMesh = new THREE.Mesh(hbGeom, hbMat);
    this.heartbeatMesh.position.set(-0.41, 0.36, 0.02);
    this.heartbeatMesh.renderOrder = 104;
    this.board3DGroup.add(this.heartbeatMesh);

    // Center: COMBO or BEST Label & Digits (significantly enlarged multiplier)
    this.comboLabelMesh = createQuad(0.28, 0.11, this.labelMaterials['COMBO'], -0.19, 0.36, 0.02, 104, this.board3DGroup);
    this.bestLabelMesh = createQuad(0.28, 0.11, this.labelMaterials['BEST:'], -0.19, 0.36, 0.02, 104, this.board3DGroup);

    this.bestDigitMeshes = makeDigits(6, 0.01);

    // Right: Mode Label (prominently enlarged game mode indicator)
    this.modeLabelMesh = createQuad(0.46, 0.11, this.labelMaterials['DESKTOP'], 1.11, 0.36, 0.02, 104, this.board3DGroup);

    // 3. Bottom: 7 Rainbow Lane Columns (spaced at 0.40m matching the rainbow, with snug card widths)
    this.laneColumns = [];
    const cardGeom = new THREE.PlaneGeometry(0.38, 0.50);
    const borderEdges = new THREE.EdgesGeometry(cardGeom);
    const gaugeGeom = new THREE.PlaneGeometry(0.36, 0.48);
    gaugeGeom.translate(0, 0.24, 0); // pivot at bottom

    for (let i = 0; i < LANE_COUNT; i++) {
      const cx = LANE_WIDTH * (i - 3);
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, -0.06, 0.01);
      this.board3DGroup.add(colGroup);

      // Card Background Plane
      const cardMesh = new THREE.Mesh(cardGeom, createMat(0x0c091c, 0.88));
      cardMesh.renderOrder = 102;
      colGroup.add(cardMesh);

      // Card Border Outline
      const borderMesh = new THREE.LineSegments(borderEdges, new THREE.LineBasicMaterial({
        color: RAINBOW_COLORS[i],
        linewidth: 2,
      }));
      borderMesh.position.z = 0.005;
      borderMesh.renderOrder = 103;
      colGroup.add(borderMesh);

      // 3D Gauge Fill inside card (pivoted at bottom, scales with lane health)
      const gaugeMesh = new THREE.Mesh(gaugeGeom, createMat(RAINBOW_COLORS[i], 0.50));
      gaugeMesh.position.set(0, -0.24, 0.01);
      gaugeMesh.renderOrder = 103;
      colGroup.add(gaugeMesh);

      // Color Name Quad
      const colorLabelMesh = createQuad(
        0.34,
        0.082,
        this.labelMaterials[COLOR_NAMES_EN[i].toUpperCase()],
        0,
        0.17,
        0.02,
        104,
        colGroup
      );

      // 4 Percentage Digit Quads (e.g. '1', '0', '0', '%' or ' ', '8', '5', '%')
      const percentDigitMeshes: any[] = [];
      const pw = 0.066;
      for (let d = 0; d < 4; d++) {
        const pMesh = createQuad(pw, 0.096, this.charMaterials[' '], -1.5 * pw + d * pw, 0.05, 0.025, 104, colGroup);
        percentDigitMeshes.push(pMesh);
      }

      // EMPTY label (displayed when lane health is <= 0.04)
      const emptyMesh = createQuad(0.30, 0.092, this.labelMaterials['EMPTY'], 0, 0.05, 0.025, 104, colGroup);
      emptyMesh.visible = false;

      // Status Text Mesh (● OK, ▲ DRAIN, ⚠ ALERT, ✖ GONE)
      const statusTextMesh = createQuad(0.28, 0.070, this.labelMaterials['● OK'], 0, -0.11, 0.02, 104, colGroup);

      // Status Pill Mesh (glowing underline)
      const statusPillMesh = createQuad(0.24, 0.020, createMat(0x10e052), 0, -0.17, 0.02, 104, colGroup);

      this.laneColumns.push({
        colGroup,
        borderMesh,
        cardMesh,
        colorLabelMesh,
        percentDigitMeshes,
        emptyMesh,
        statusTextMesh,
        statusPillMesh,
        gaugeMesh,
      });
    }
  }

  private initFloatingPopups(scene: any): void {
    const count = 16;
    const geom = new THREE.PlaneGeometry(0.65, 0.26);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: true,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      mesh.renderOrder = 110;
      scene.add(mesh);
      this.floatingPopups.push({ mesh, life: 0, maxLife: 0.85, active: false });
    }
  }

  public spawnWorldPopup(text: '100%' | '-5%', colorIdx: number): void {
    const baseMat = this.labelMaterials[text];
    if (!baseMat) return;
    const p = this.floatingPopups.find(item => !item.active) || this.floatingPopups[0];
    p.active = true;
    p.life = 0;
    p.maxLife = 0.95;
    p.mesh.material = baseMat.clone();
    p.mesh.material.color.setHex(RAINBOW_COLORS[colorIdx] ?? 0xffffff);
    p.mesh.material.opacity = 1.0;

    // Position further forward in front of player, directly above the corresponding color lane
    p.mesh.position.set((colorIdx - 3) * LANE_WIDTH, text === '100%' ? 1.45 : 1.25, -2.65);
    p.mesh.scale.set(0.70, 0.70, 0.70);
    p.mesh.visible = true;
  }

  private updateFloatingPopups(dt: number): void {
    for (const p of this.floatingPopups) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const progress = p.life / p.maxLife;
      p.mesh.position.y += dt * 1.5;
      const popScale = progress < 0.25 ? 0.65 + (progress / 0.25) * 0.55 : 1.20 - (progress - 0.25) * 0.25;
      p.mesh.scale.set(popScale, popScale, popScale);
      if (progress > 0.40) {
        const fade = (1 - progress) / 0.60;
        p.mesh.material.opacity = Math.max(0, fade);
      }
      if (this.camera) {
        p.mesh.quaternion.copy(this.camera.quaternion);
      }
    }
  }

  private update3DBoard(
    score: number,
    combo: number,
    laneHealth: number[],
    time: number,
    dt: number,
    vrMode: GameMode
  ): void {
    if (!this.board3DGroup) return;

    const updateDigits = (meshes: any[], str: string) => {
      for (let d = 0; d < meshes.length; d++) {
        if (meshes[d]) meshes[d].material = this.charMaterials[str[d] || ' '] || this.charMaterials[' '];
      }
    };

    // 1. Live Score Digits
    const sStr = Math.floor(score).toLocaleString('en-US').padStart(8, ' ');
    updateDigits(this.scoreDigitMeshes, sStr);

    // 2. Heartbeat Indicator
    if (this.heartbeatMesh) {
      const pulse = 1 + 0.35 * Math.sin(time * 8);
      this.heartbeatMesh.scale.set(pulse, pulse, 1);
      this.heartbeatMesh.material.color.setHex(combo > 1 ? 0xffdd00 : 0x00d4ff);
    }

    // 3. Combo vs Best Score
    const isCombo = combo > 1;
    if (this.comboLabelMesh) this.comboLabelMesh.visible = isCombo;
    if (this.bestLabelMesh) this.bestLabelMesh.visible = !isCombo;
    const comboStr = isCombo ? `x${combo}` : Math.floor(this.getHighScore(vrMode)).toLocaleString('en-US');
    updateDigits(this.bestDigitMeshes, comboStr.padStart(6, ' '));

    // 4. Mode Label
    const isHard = vrMode === GameMode.VR_HARD;
    const isEasy = vrMode === GameMode.VR_EASY;
    const modeKey = isHard ? 'VR HARD' : (isEasy ? 'VR EASY' : 'DESKTOP');
    if (this.modeLabelMesh && this.labelMaterials[modeKey]) {
      this.modeLabelMesh.material = this.labelMaterials[modeKey];
    }

    // 5. 7 Rainbow Lane Columns
    const blink = Math.sin(time * 18) > 0;
    for (let i = 0; i < LANE_COUNT; i++) {
      const col = this.laneColumns[i];
      if (!col) continue;
      const h = laneHealth[i] ?? 1.0;
      const isCritical = h < 0.32;

      // Dynamic border color: alerts red if critical, otherwise lane color
      const borderCol = isCritical
        ? (blink ? 0xffffff : 0xff2a4b)
        : RAINBOW_COLORS[i];
      col.borderMesh.material.color.setHex(borderCol);

      // Gauge fill: visible as long as health > 0%
      col.gaugeMesh.visible = h > 0.0;
      col.gaugeMesh.scale.y = Math.max(0.02, Math.min(1.0, h));

      // Percent digits vs EMPTY: EMPTY only at 0%
      if (h > 0.0) {
        if (col.emptyMesh) col.emptyMesh.visible = false;
        const pctStr = `${Math.round(h * 100)}%`.padStart(4, ' ');
        for (let d = 0; d < 4; d++) col.percentDigitMeshes[d].visible = true;
        updateDigits(col.percentDigitMeshes, pctStr);
      } else {
        if (col.emptyMesh) col.emptyMesh.visible = true;
        for (let d = 0; d < 4; d++) col.percentDigitMeshes[d].visible = false;
      }

      // Status Badge and Status Pill
      const [stKey, pillColor] = h > 0.70 ? ['● OK', 0x10e052] :
        h > 0.32 ? ['▲ DRAIN', 0xffdd00] :
        h > 0.0 ? ['⚠ ALERT', 0xff2a4b] : ['✖ GONE', 0x888888];
      if (this.labelMaterials[stKey]) {
        col.statusTextMesh.material = this.labelMaterials[stKey];
      }
      col.statusPillMesh.material.color.setHex(pillColor);
    }
  }

  private initCanvasMesh(): void {
    // 1. Centered 3D Dialog panel (Menu & Game Over) in 3D world space (comfortable VR reading distance)
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 1024;
    cvs.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1000;';
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(cvs);
    }
    this.dialogCanvas = cvs;
    this.dialogCtx = cvs.getContext('2d')!;

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
    this.dialogMesh.position.set(0, 2.15, -2.8);
    this.dialogMesh.rotation.x = -0.03;
    this.dialogMesh.renderOrder = 2000;
    this.dialogMesh.visible = true;
    this.group.add(this.dialogMesh);

    // 2. Glowing 3D Laser Reticle Ring on dialog board (child of dialogMesh so it moves with it)
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

  }

  private setHoveredButton(id: string | null): void {
    if (this.hoveredButtonId !== id) {
      this.hoveredButtonId = id;
      this.dialogDirty = true;
    }
  }

  private updateReticle3D(hit: boolean, point?: any): void {
    if (!this.reticle3DMesh) return;
    if (hit && point) {
      this.dialogMesh.worldToLocal(this.tempLocalVec.copy(point));
      this.reticle3DMesh.position.set(this.tempLocalVec.x, this.tempLocalVec.y, 0.02);
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

  private clearHover(): { hit: boolean } {
    this.setHoveredButton(null);
    this.pointerX = this.pointerY = -100;
    if (this.reticle3DMesh) {
      this.reticle3DMesh.visible = false;
      this.reticle3DMesh.position.set(0, -999, 0);
    }
    return { hit: false };
  }

  private intersectDialog(): { hit: boolean; point?: any } {
    const res = this.processIntersects(this.raycaster.intersectObject(this.dialogMesh));
    this.updateReticle3D(res.hit, res.point);
    return res;
  }

  public updateHoverRay(origin: any, direction: any): { hit: boolean; point?: any } {
    if (!this.dialogMesh?.visible) return this.clearHover();
    this.dialogMesh.updateMatrixWorld(true);
    this.raycaster.set(origin, direction);
    return this.intersectDialog();
  }

  public updateHoverNdc(pointerNdcX: number, pointerNdcY: number): { hit: boolean; point?: any } {
    if (!this.dialogMesh?.visible) return this.clearHover();
    this.dialogMesh.updateMatrixWorld(true);
    this.mouseVec.set(pointerNdcX, pointerNdcY);
    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    return this.intersectDialog();
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

      // If pointing on the difficulty cards area, intelligently snap to closest difficulty
      if (!found && this.dialogMesh && this.dialogMesh.visible) {
        if (cx >= 80 && cx <= 944) {
          if (cy >= 260 && cy < 450) {
            found = 'btn-easy';
          } else if (cy >= 450 && cy < 620) {
            found = 'btn-hard';
          }
        }
      }

      this.setHoveredButton(found);
      return { hit: true, point: hit.point };
    } else {
      this.setHoveredButton(null);
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
    // High-confidence fallback if laser hits within the difficulty selection zone:
    if (this.pointerX >= 60 && this.pointerX <= 964 && this.pointerY >= 260 && this.pointerY < 620) {
      const targetId = this.pointerY < 450 ? 'btn-easy' : 'btn-hard';
      const btn = this.buttons.find((b) => b.id === targetId);
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
    this.dialogDirty = true;
  }

  public renderUI(
    state: GameState,
    score: number,
    combo: number,
    laneHealth: number[],
    time: number,
    dt: number,
    onStartGame: (mode: GameMode) => void,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
    isVR: boolean = false,
    vrMode: GameMode = GameMode.DESKTOP
  ): void {
    if (this.quipTimer > 0) {
      this.quipTimer -= dt;
      if (this.quipTimer <= 0) {
        this.currentQuip = '';
      }
    }

    // 1. Update 100% Native 3D HUD Board (zero dynamic canvas uploads, 90/120Hz native WebGL)
    this.update3DBoard(score, combo, laneHealth, time, dt, vrMode);

    // 2. Update 3D Floating Popups (100% / -5%)
    this.updateFloatingPopups(dt);

    const audioMuted = getAudioMuted();
    const sfxMuted = getSfxMuted();
    if (
      state !== this.lastDialogState ||
      audioMuted !== this.lastDialogAudioMuted ||
      sfxMuted !== this.lastDialogSfxMuted ||
      isVR !== this.lastDialogIsVR ||
      vrMode !== this.lastDialogVRMode
    ) {
      this.dialogDirty = true;
      this.lastDialogState = state;
      this.lastDialogAudioMuted = audioMuted;
      this.lastDialogSfxMuted = sfxMuted;
      this.lastDialogIsVR = isVR;
      this.lastDialogVRMode = vrMode;
    }

    if (state === GameState.MENU) {
      this.dialogMesh.visible = true;
      this.setMenuPosition(isVR);
      if (this.dialogDirty) {
        this.buttons = [];
        this.dialogCtx.clearRect(0, 0, 1024, 1024);
        this.drawMenu(this.dialogCtx, onStartGame, isVR, vrMode);
        this.dialogTexture.needsUpdate = true;
        this.dialogDirty = false;
      }
      return;
    }

    if (state === GameState.PLAYING || state === GameState.FALLING) {
      this.hideDialog();
      return;
    }

    if (state === GameState.GAMEOVER) {
      this.dialogMesh.visible = true;
      if (score !== this.lastDialogScore) {
        this.lastDialogScore = score;
        this.dialogDirty = true;
      }
      if (this.dialogDirty) {
        this.buttons = [];
        this.dialogCtx.clearRect(0, 0, 1024, 1024);
        this.drawGameOver(this.dialogCtx, score, onRestart, onHome, onToggleMode, isVR, vrMode);
        this.dialogTexture.needsUpdate = true;
        this.dialogDirty = false;
      }
      return;
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
    const pad = isHover ? 4 : 0;
    const bx = x - pad, by = y - pad, bw = w + pad * 2, bh = h + pad * 2, br = 20 + pad / 2;
    const titleY = subtitle ? y + h * 0.40 : y + h * 0.5 + 10;
    ctx.textAlign = 'center';

    if (isHover) {
      // Vivid glowing gradient fill
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      const colLower = color.toLowerCase();
      const [c1, c2] = colLower.includes('ffdd00') || colLower.includes('yellow') || colLower.includes('ff7b00')
        ? ['rgba(255, 221, 0, 0.48)', 'rgba(255, 120, 0, 0.28)']
        : colLower.includes('00d4ff') || colLower.includes('cyan')
        ? ['rgba(0, 212, 255, 0.48)', 'rgba(0, 120, 255, 0.28)']
        : colLower.includes('10e052') || colLower.includes('green')
        ? ['rgba(16, 224, 82, 0.48)', 'rgba(0, 160, 60, 0.28)']
        : ['rgba(255, 255, 255, 0.42)', 'rgba(200, 220, 255, 0.22)'];
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);

      ctx.fillStyle = grad;
      this.roundRect(ctx, bx, by, bw, bh, br);
      ctx.fill();

      // Glowing multi-layer border
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5.5;
      this.roundRect(ctx, bx, by, bw, bh, br);
      ctx.stroke();
      ctx.restore();

      // Highlighted title
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffffff';
      ctx.font = uiFont(32);
      ctx.fillText(`✨  ${title}  ✨`, x + w / 2, titleY);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      this.roundRect(ctx, bx, by, bw, bh, br);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = uiFont(29, 800);
      ctx.fillText(title, x + w / 2, titleY);
    }

    if (subtitle) {
      ctx.fillStyle = isHover ? '#ffffff' : '#c8d6e5';
      ctx.font = uiFont(isHover ? 19 : 18, isHover ? 700 : 600);
      ctx.fillText(subtitle, x + w / 2, y + h * 0.72);
    }
  }

  private drawAudioBar(
    ctx: CanvasRenderingContext2D,
    x1: number,
    x2: number,
    y: number,
    w: number,
    musicSub: string,
    sfxSub: string
  ): void {
    const isMusicMuted = getAudioMuted();
    const isSfxMuted = getSfxMuted();

    this.drawButton(
      ctx,
      'btn-music-3d',
      x1,
      y,
      w,
      85,
      isMusicMuted ? '🎵 MUSIC: OFF' : '🎵 MUSIC: ON',
      musicSub,
      isMusicMuted ? '#8899aa' : '#00d4ff',
      () => {
        toggleAudio();
        const b = document.getElementById('btn-music');
        if (b) b.textContent = `🎵 MUSIC: ${getAudioMuted() ? 'OFF' : 'ON'}`;
        this.dialogDirty = true;
      }
    );

    this.drawButton(
      ctx,
      'btn-sfx-3d',
      x2,
      y,
      w,
      85,
      isSfxMuted ? '🔊 SFX: OFF' : '🔊 SFX: ON',
      sfxSub,
      isSfxMuted ? '#8899aa' : '#10e052',
      () => {
        toggleSfx();
        const b = document.getElementById('btn-sfx');
        if (b) b.textContent = `🔊 SFX: ${getSfxMuted() ? 'OFF' : 'ON'}`;
        this.dialogDirty = true;
      }
    );
  }

  private drawControlsText(
    ctx: CanvasRenderingContext2D,
    baseY: number,
    gap: number,
    aimText: string,
    showDesktop: boolean = false
  ): void {
    ctx.textAlign = 'center';
    ctx.font = uiFont(19, 800);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🌈 STEER: Take real side-steps across the 2m rainbow!', 512, baseY);

    ctx.font = uiFont(17, 700);
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('🥽 VR CONTROLLER: Trigger = Stab  •  Grip = Jump  •  A / B = Return to Home', 512, baseY + gap);

    let offset = 2;
    if (showDesktop) {
      ctx.font = uiFont(15, 600);
      ctx.fillStyle = '#10e052';
      ctx.fillText('💻 DESKTOP: Mouse Move to Steer  •  Left-Click: Stab  •  Right-Click / Wheel: Jump', 512, baseY + gap * offset++);
    }

    ctx.font = uiFont(15, 600);
    ctx.fillStyle = '#9cb3d0';
    ctx.fillText(aimText, 512, baseY + gap * offset);
  }

  private drawMenu(
    ctx: CanvasRenderingContext2D,
    onStartGame: (mode: GameMode) => void,
    isVR: boolean,
    currentMode: GameMode
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
    ctx.font = uiFont(52);
    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 20;
    ctx.fillText('STAB THE RAINBOW', 512, 160);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = uiFont(21, 700);
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('CHOOSE DIFFICULTY ABOVE THE RAINBOW', 512, 206);

    // High Scores - Easy & Hard separated
    ctx.font = uiFont(21, 700);
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
      285,
      824,
      140,
      'UNICORN RIDER (EASY)',
      'Horn in hand • Controller / Ray aims • Trigger stabs • Grip jumps',
      '#00d4ff',
      () => onStartGame(GameMode.VR_EASY)
    );

    this.drawButton(
      ctx,
      'btn-hard',
      100,
      440,
      824,
      140,
      'YOU ARE THE UNICORN! (HARD)',
      'Horn on head • Ram / Headbutt stabs • Physical leap / Grip jumps',
      '#ffdd00',
      () => onStartGame(GameMode.VR_HARD)
    );

    // Controls Instructions (Clear, stylish and aligned)
    this.drawControlsText(ctx, 625, 35, '🎯 Aim pointer beam & pull Trigger to select difficulty');

    // Separator line before Audio Bar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(140, 735);
    ctx.lineTo(884, 735);
    ctx.stroke();

    // 3D Audio Buttons (Side-by-side in bottom bar)
    this.drawAudioBar(ctx, 110, 534, 755, 380, 'Click to toggle music soundtrack', 'Click to toggle sound effects');
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
    isVR: boolean,
    vrMode: GameMode
  ): void {
    const isHard = vrMode === GameMode.VR_HARD;
    const isEasy = vrMode === GameMode.VR_EASY;
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
    ctx.font = uiFont(50);
    ctx.fillStyle = '#ff7b00';
    ctx.shadowColor = '#ff7b00';
    ctx.shadowBlur = 20;
    ctx.fillText('FELL INTO THE ABYSS', 512, 160);
    ctx.shadowBlur = 0;

    // Death quote
    ctx.font = uiFont(22, 'italic 600');
    ctx.fillStyle = '#ffd2d9';
    ctx.fillText(this.lastQuote || 'Gravity was faster this time.', 512, 218);

    // Final Score
    ctx.font = uiFont(46);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE (${modeName}): ${score.toLocaleString()}`, 512, 290);

    if (isNewHigh) {
      ctx.font = uiFont(26, 800);
      ctx.fillStyle = '#ffdd00';
      ctx.fillText('NEW HIGH SCORE!', 512, 335);
    } else {
      ctx.font = uiFont(22, 700);
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`BEST SCORE (${modeName}): ${highScore.toLocaleString()}`, 512, 335);
    }

    // Action Buttons
    this.drawButton(
      ctx,
      'btn-retry',
      140,
      370,
      744,
      88,
      'PLAY AGAIN',
      '',
      '#10e052',
      () => onRestart()
    );

    this.drawButton(
      ctx,
      'btn-home',
      140,
      472,
      744,
      88,
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
        574,
        744,
        88,
        'SWITCH TO ' + otherModeName,
        '',
        '#ffdd00',
        () => onToggleMode()
      );
    }

    // Controls Instructions (Consistent with VR Menu + Desktop)
    const instrBaseY = isVR ? 684 : 598;
    const lineGap = isVR ? 27 : 29;
    this.drawControlsText(
      ctx,
      instrBaseY,
      lineGap,
      isVR ? '🎯 Aim pointer beam & pull Trigger to select' : '🎯 Aim with mouse & left-click button to select',
      true
    );

    // Separator line before Audio Bar
    const audioY = isVR ? 782 : 706;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(160, audioY);
    ctx.lineTo(864, audioY);
    ctx.stroke();

    // 3D Audio Buttons (Side-by-side in bottom bar)
    const btnAudioY = isVR ? 802 : 726;
    this.drawAudioBar(ctx, 140, 529, btnAudioY, 355, 'Toggle music', 'Toggle sound effects');
  }


  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    } else {
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
}
