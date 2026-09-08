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

  // Floating 3D Popups (+100% on pierce, -5% on miss)
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
    this.initStaticMaterials();
    this.initCanvasMesh();
    this.init3DBoard();
    this.initFloatingPopups(scene);
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

  public saveHighScore(score: number, mode: GameMode): boolean {
    const isHard = mode === GameMode.VR_HARD;
    const isEasy = mode === GameMode.VR_EASY;

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

  public getHighScore(mode: GameMode): number {
    if (mode === GameMode.VR_HARD) return this.highScoreHard;
    if (mode === GameMode.VR_EASY) return this.highScoreEasy;
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
        '900 62px system-ui, sans-serif',
        '#ffffff',
        64,
        80,
        '#000000'
      );
    }

    // 2. Fixed UI Labels
    this.labelMaterials['SCORE:'] = this.createTextMaterial(
      'SCORE:',
      '900 32px system-ui, sans-serif',
      '#ffffff',
      192,
      48,
      '#00d4ff'
    );
    this.labelMaterials['BEST:'] = this.createTextMaterial(
      'BEST:',
      '800 28px system-ui, sans-serif',
      '#ffd24d',
      160,
      48
    );
    this.labelMaterials['COMBO'] = this.createTextMaterial(
      'COMBO',
      '900 30px system-ui, sans-serif',
      '#ffdd00',
      160,
      48,
      '#ffdd00'
    );
    this.labelMaterials['VR EASY'] = this.createTextMaterial(
      'VR EASY',
      '800 24px system-ui, sans-serif',
      '#00d4ff',
      180,
      44
    );
    this.labelMaterials['VR HARD'] = this.createTextMaterial(
      'VR HARD',
      '800 24px system-ui, sans-serif',
      '#ffdd00',
      180,
      44
    );
    this.labelMaterials['DESKTOP'] = this.createTextMaterial(
      'DESKTOP',
      '800 24px system-ui, sans-serif',
      '#a0b8d8',
      180,
      44
    );

    // 3. Lane Color Names
    for (let i = 0; i < LANE_COUNT; i++) {
      const name = COLOR_NAMES_EN[i].toUpperCase();
      this.labelMaterials[name] = this.createTextMaterial(
        name,
        '900 26px system-ui, sans-serif',
        RAINBOW_HEX_STRINGS[i],
        160,
        44
      );
    }

    // 4. Status Badges
    this.labelMaterials['● OK'] = this.createTextMaterial(
      '● OK',
      '800 22px system-ui, sans-serif',
      '#10e052',
      140,
      40
    );
    this.labelMaterials['▲ DRAIN'] = this.createTextMaterial(
      '▲ DRAIN',
      '800 22px system-ui, sans-serif',
      '#ffdd00',
      140,
      40
    );
    this.labelMaterials['⚠ ALERT'] = this.createTextMaterial(
      '⚠ ALERT',
      '800 22px system-ui, sans-serif',
      '#ff2a4b',
      140,
      40
    );
    this.labelMaterials['✖ GONE'] = this.createTextMaterial(
      '✖ GONE',
      '800 22px system-ui, sans-serif',
      '#888888',
      140,
      40
    );
    this.labelMaterials['EMPTY'] = this.createTextMaterial(
      'EMPTY',
      '900 32px system-ui, sans-serif',
      '#ff2a4b',
      160,
      54,
      '#ff2a4b'
    );
    this.labelMaterials['+100%'] = this.createTextMaterial(
      '+100%',
      '900 52px system-ui, sans-serif',
      '#ffffff',
      190,
      64,
      '#000000'
    );
    this.labelMaterials['-5%'] = this.createTextMaterial(
      '-5%',
      '900 52px system-ui, sans-serif',
      '#ffffff',
      150,
      64,
      '#000000'
    );
  }

  private init3DBoard(): void {
    this.board3DGroup = new THREE.Group();
    this.board3DGroup.position.set(0, 0.72, -3.8);
    this.board3DGroup.rotation.set(-Math.PI / 2 + 0.40, 0, 0);
    this.group.add(this.board3DGroup);

    // 1. Dark Main Backplate (scaled for ~2.96m width)
    const bgGeom = new THREE.PlaneGeometry(2.96, 0.78);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x080616,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(bgGeom, bgMat);
    bgMesh.position.set(0, 0.08, 0);
    bgMesh.renderOrder = 100;
    this.board3DGroup.add(bgMesh);

    // Subtle cyan frame outline
    const frameEdges = new THREE.EdgesGeometry(bgGeom);
    const frameLine = new THREE.LineSegments(
      frameEdges,
      new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 })
    );
    frameLine.position.set(0, 0.08, 0.005);
    frameLine.renderOrder = 101;
    this.board3DGroup.add(frameLine);

    // Separator line between header and lane columns
    const sepGeom = new THREE.PlaneGeometry(2.92, 0.01);
    const sepMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const sepMesh = new THREE.Mesh(sepGeom, sepMat);
    sepMesh.position.set(0, 0.25, 0.01);
    sepMesh.renderOrder = 102;
    this.board3DGroup.add(sepMesh);

    // 2. Top Header Bar
    // Left: "SCORE:" Label
    const scoreLabelGeom = new THREE.PlaneGeometry(0.28, 0.08);
    const scoreLabelMesh = new THREE.Mesh(scoreLabelGeom, this.labelMaterials['SCORE:']);
    scoreLabelMesh.position.set(-1.18, 0.33, 0.02);
    scoreLabelMesh.renderOrder = 104;
    this.board3DGroup.add(scoreLabelMesh);

    // Score Digits (8 digit quads to support scores up to 99,999,999 with commas)
    this.scoreDigitMeshes = [];
    for (let d = 0; d < 8; d++) {
      const dGeom = new THREE.PlaneGeometry(0.055, 0.08);
      const dMesh = new THREE.Mesh(dGeom, this.charMaterials[' ']);
      dMesh.position.set(-0.98 + d * 0.058, 0.33, 0.02);
      dMesh.renderOrder = 104;
      this.board3DGroup.add(dMesh);
      this.scoreDigitMeshes.push(dMesh);
    }

    // Heartbeat Pulse Mesh (instant visual feedback of 90/120Hz live frame loop)
    const hbGeom = new THREE.CircleGeometry(0.018, 16);
    const hbMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, depthWrite: false });
    this.heartbeatMesh = new THREE.Mesh(hbGeom, hbMat);
    this.heartbeatMesh.position.set(-0.46, 0.33, 0.02);
    this.heartbeatMesh.renderOrder = 104;
    this.board3DGroup.add(this.heartbeatMesh);

    // Center: COMBO or BEST Label & Digits
    const centerLabelGeom = new THREE.PlaneGeometry(0.24, 0.08);
    this.comboLabelMesh = new THREE.Mesh(centerLabelGeom, this.labelMaterials['COMBO']);
    this.comboLabelMesh.position.set(-0.10, 0.33, 0.02);
    this.comboLabelMesh.renderOrder = 104;
    this.board3DGroup.add(this.comboLabelMesh);

    this.bestLabelMesh = new THREE.Mesh(centerLabelGeom, this.labelMaterials['BEST:']);
    this.bestLabelMesh.position.set(-0.10, 0.33, 0.02);
    this.bestLabelMesh.renderOrder = 104;
    this.board3DGroup.add(this.bestLabelMesh);

    this.bestDigitMeshes = [];
    for (let d = 0; d < 6; d++) {
      const dGeom = new THREE.PlaneGeometry(0.055, 0.08);
      const dMesh = new THREE.Mesh(dGeom, this.charMaterials[' ']);
      dMesh.position.set(0.08 + d * 0.058, 0.33, 0.02);
      dMesh.renderOrder = 104;
      this.board3DGroup.add(dMesh);
      this.bestDigitMeshes.push(dMesh);
    }

    // Right: Mode Label
    const modeGeom = new THREE.PlaneGeometry(0.28, 0.08);
    this.modeLabelMesh = new THREE.Mesh(modeGeom, this.labelMaterials['DESKTOP']);
    this.modeLabelMesh.position.set(1.18, 0.33, 0.02);
    this.modeLabelMesh.renderOrder = 104;
    this.board3DGroup.add(this.modeLabelMesh);

    // 3. Bottom: 7 Rainbow Lane Columns (spaced exactly at 0.40m matching the rainbow)
    this.laneColumns = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      const cx = LANE_WIDTH * (i - 3);
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, -0.06, 0.01);
      this.board3DGroup.add(colGroup);

      // Card Background Plane
      const cardGeom = new THREE.PlaneGeometry(0.37, 0.50);
      const cardMat = new THREE.MeshBasicMaterial({
        color: 0x0c091c,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      const cardMesh = new THREE.Mesh(cardGeom, cardMat);
      cardMesh.renderOrder = 102;
      colGroup.add(cardMesh);

      // Card Border Outline
      const borderEdges = new THREE.EdgesGeometry(cardGeom);
      const borderMat = new THREE.LineBasicMaterial({
        color: RAINBOW_COLORS[i],
        linewidth: 2,
      });
      const borderMesh = new THREE.LineSegments(borderEdges, borderMat);
      borderMesh.position.z = 0.005;
      borderMesh.renderOrder = 103;
      colGroup.add(borderMesh);

      // 3D Gauge Fill inside card (pivoted at bottom, scales with lane health)
      const gaugeGeom = new THREE.PlaneGeometry(0.35, 0.48);
      gaugeGeom.translate(0, 0.24, 0); // pivot at bottom
      const gaugeMat = new THREE.MeshBasicMaterial({
        color: RAINBOW_COLORS[i],
        transparent: true,
        opacity: 0.50,
        depthWrite: false,
      });
      const gaugeMesh = new THREE.Mesh(gaugeGeom, gaugeMat);
      gaugeMesh.position.set(0, -0.24, 0.01);
      gaugeMesh.renderOrder = 103;
      colGroup.add(gaugeMesh);

      // Color Name Quad
      const nameGeom = new THREE.PlaneGeometry(0.32, 0.075);
      const colorLabelMesh = new THREE.Mesh(
        nameGeom,
        this.labelMaterials[COLOR_NAMES_EN[i].toUpperCase()]
      );
      colorLabelMesh.position.set(0, 0.17, 0.02);
      colorLabelMesh.renderOrder = 104;
      colGroup.add(colorLabelMesh);

      // 4 Percentage Digit Quads (e.g. '1', '0', '0', '%' or ' ', '8', '5', '%')
      const percentDigitMeshes: any[] = [];
      const pw = 0.062;
      for (let d = 0; d < 4; d++) {
        const pGeom = new THREE.PlaneGeometry(pw, 0.09);
        const pMesh = new THREE.Mesh(pGeom, this.charMaterials[' ']);
        pMesh.position.set(-1.5 * pw + d * pw, 0.05, 0.025);
        pMesh.renderOrder = 104;
        colGroup.add(pMesh);
        percentDigitMeshes.push(pMesh);
      }

      // EMPTY label (displayed when lane health is <= 0.04)
      const emptyGeom = new THREE.PlaneGeometry(0.28, 0.085);
      const emptyMesh = new THREE.Mesh(emptyGeom, this.labelMaterials['EMPTY']);
      emptyMesh.position.set(0, 0.05, 0.025);
      emptyMesh.renderOrder = 104;
      emptyMesh.visible = false;
      colGroup.add(emptyMesh);

      // Status Text Mesh (● OK, ▲ DRAIN, ⚠ ALERT, ✖ GONE)
      const stGeom = new THREE.PlaneGeometry(0.26, 0.065);
      const statusTextMesh = new THREE.Mesh(stGeom, this.labelMaterials['● OK']);
      statusTextMesh.position.set(0, -0.11, 0.02);
      statusTextMesh.renderOrder = 104;
      colGroup.add(statusTextMesh);

      // Status Pill Mesh (glowing underline)
      const pillGeom = new THREE.PlaneGeometry(0.22, 0.018);
      const pillMat = new THREE.MeshBasicMaterial({ color: 0x10e052, depthWrite: false });
      const statusPillMesh = new THREE.Mesh(pillGeom, pillMat);
      statusPillMesh.position.set(0, -0.17, 0.02);
      statusPillMesh.renderOrder = 104;
      colGroup.add(statusPillMesh);

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

  public spawnWorldPopup(text: '+100%' | '-5%', colorIdx: number): void {
    const baseMat = this.labelMaterials[text];
    if (!baseMat) return;
    let p = this.floatingPopups.find(item => !item.active);
    if (!p) {
      p = this.floatingPopups[0];
    }
    p.active = true;
    p.life = 0;
    p.maxLife = 0.95;
    p.mesh.material = baseMat.clone();
    p.mesh.material.color.setHex(RAINBOW_COLORS[colorIdx] ?? 0xffffff);
    p.mesh.material.opacity = 1.0;

    // Position further forward in front of player, directly above the corresponding color lane
    const laneX = (colorIdx - 3) * LANE_WIDTH;
    const forwardZ = -2.8;
    const spawnY = text === '+100%' ? 1.45 : 1.25;
    p.mesh.position.set(laneX, spawnY, forwardZ);
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

    // 1. Live Score Digits
    const sStr = Math.floor(score)
      .toLocaleString('en-US')
      .padStart(8, ' ');
    for (let d = 0; d < 8; d++) {
      const ch = sStr[d] || ' ';
      if (this.scoreDigitMeshes[d]) {
        this.scoreDigitMeshes[d].material = this.charMaterials[ch] || this.charMaterials[' '];
      }
    }

    // 2. Heartbeat Indicator
    if (this.heartbeatMesh) {
      const pulse = 1 + 0.35 * Math.sin(time * 8);
      this.heartbeatMesh.scale.set(pulse, pulse, 1);
      this.heartbeatMesh.material.color.setHex(combo > 1 ? 0xffdd00 : 0x00d4ff);
    }

    // 3. Combo vs Best Score
    const highScore = this.getHighScore(vrMode);
    if (combo > 1) {
      if (this.comboLabelMesh) this.comboLabelMesh.visible = true;
      if (this.bestLabelMesh) this.bestLabelMesh.visible = false;
      const cStr = `x${combo}!`.padStart(6, ' ');
      for (let d = 0; d < 6; d++) {
        const ch = cStr[d] || ' ';
        if (this.bestDigitMeshes[d]) {
          this.bestDigitMeshes[d].material = this.charMaterials[ch] || this.charMaterials[' '];
        }
      }
    } else {
      if (this.comboLabelMesh) this.comboLabelMesh.visible = false;
      if (this.bestLabelMesh) this.bestLabelMesh.visible = true;
      const bStr = Math.floor(highScore)
        .toLocaleString('en-US')
        .padStart(6, ' ');
      for (let d = 0; d < 6; d++) {
        const ch = bStr[d] || ' ';
        if (this.bestDigitMeshes[d]) {
          this.bestDigitMeshes[d].material = this.charMaterials[ch] || this.charMaterials[' '];
        }
      }
    }

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
        const pct = Math.round(h * 100);
        const pctStr = `${pct}%`.padStart(4, ' ');
        for (let d = 0; d < 4; d++) {
          const ch = pctStr[d] || ' ';
          col.percentDigitMeshes[d].visible = true;
          col.percentDigitMeshes[d].material = this.charMaterials[ch] || this.charMaterials[' '];
        }
      } else {
        if (col.emptyMesh) col.emptyMesh.visible = true;
        for (let d = 0; d < 4; d++) {
          col.percentDigitMeshes[d].visible = false;
        }
      }

      // Status Badge and Status Pill
      let stKey = '● OK';
      let pillColor = 0x10e052;
      if (h > 0.70) {
        stKey = '● OK';
        pillColor = 0x10e052;
      } else if (h > 0.32) {
        stKey = '▲ DRAIN';
        pillColor = 0xffdd00;
      } else if (h > 0.0) {
        stKey = '⚠ ALERT';
        pillColor = 0xff2a4b;
      } else {
        stKey = '✖ GONE';
        pillColor = 0x888888;
      }
      if (this.labelMaterials[stKey]) {
        col.statusTextMesh.material = this.labelMaterials[stKey];
      }
      col.statusPillMesh.material.color.setHex(pillColor);
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

    // 1. Centered 3D Dialog panel (Menu & Game Over) in 3D world space (comfortable VR reading distance)
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
    this.buttons = [];

    if (this.quipTimer > 0) {
      this.quipTimer -= dt;
      if (this.quipTimer <= 0) {
        this.currentQuip = '';
      }
    }

    // 1. Update 100% Native 3D HUD Board (zero dynamic canvas uploads, 90/120Hz native WebGL)
    this.update3DBoard(score, combo, laneHealth, time, dt, vrMode);

    // 2. Update 3D Floating Popups (+100% / -5%)
    this.updateFloatingPopups(dt);


    if (state === GameState.MENU) {
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
      this.dialogMesh.visible = false;
      this.dialogMesh.position.set(0, -999, 0);
      if (this.reticle3DMesh) {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
      return;
    }

    if (state === GameState.FALLING) {
      this.dialogMesh.visible = false;
      this.dialogMesh.position.set(0, -999, 0);
      if (this.reticle3DMesh) {
        this.reticle3DMesh.visible = false;
        this.reticle3DMesh.position.set(0, -999, 0);
      }
      return;
    }

    if (state === GameState.GAMEOVER) {
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
    onStartGame: (mode: GameMode) => void,
    time: number,
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
    ctx.textAlign = 'center';
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🌈 STEER: Take real side-steps across the 2m rainbow! (Desktop: Mouse)', 512, 615);

    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('🥽 VR CONTROLLER: Trigger = Stab  •  Grip = Jump  •  A / B = Return to Home', 512, 648);

    ctx.font = '600 15.5px system-ui, sans-serif';
    ctx.fillStyle = '#10e052';
    ctx.fillText('💻 DESKTOP: Mouse Move to Steer  •  Left-Click: Stab  •  Right-Click / Wheel: Jump', 512, 678);

    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = '#9cb3d0';
    ctx.fillText('🎯 Aim pointer beam & pull Trigger to select difficulty', 512, 708);

    // Separator line before Audio Bar
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(140, 735);
    ctx.lineTo(884, 735);
    ctx.stroke();

    // 3D Audio Buttons (Side-by-side in bottom bar)
    const isMusicMuted = getAudioMuted();
    const isSfxMuted = getSfxMuted();

    this.drawButton(
      ctx,
      'btn-music-3d',
      110,
      755,
      380,
      85,
      isMusicMuted ? '🎵 MUSIC: OFF' : '🎵 MUSIC: ON',
      'Click to toggle music soundtrack',
      isMusicMuted ? '#8899aa' : '#00d4ff',
      () => {
        toggleAudio();
        const b = document.getElementById('btn-music');
        if (b) b.textContent = `🎵 MUSIC: ${getAudioMuted() ? 'OFF' : 'ON'}`;
        this.dialogTexture.needsUpdate = true;
      }
    );

    this.drawButton(
      ctx,
      'btn-sfx-3d',
      534,
      755,
      380,
      85,
      isSfxMuted ? '🔊 SFX: OFF' : '🔊 SFX: ON',
      'Click to toggle sound effects',
      isSfxMuted ? '#8899aa' : '#10e052',
      () => {
        toggleSfx();
        const b = document.getElementById('btn-sfx');
        if (b) b.textContent = `🔊 SFX: ${getSfxMuted() ? 'OFF' : 'ON'}`;
        this.dialogTexture.needsUpdate = true;
      }
    );
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    onRestart: () => void,
    onHome: () => void,
    onToggleMode: () => void,
    time: number,
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
      370,
      744,
      88,
      `PLAY AGAIN (${modeName})`,
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
      'MAIN MENU (A / B)',
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

    // Separator line before Audio Bar
    const audioY = isVR ? 688 : 586;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(160, audioY);
    ctx.lineTo(864, audioY);
    ctx.stroke();

    // 3D Audio Buttons (Side-by-side in bottom bar)
    const isMusicMuted = getAudioMuted();
    const isSfxMuted = getSfxMuted();
    const btnAudioY = isVR ? 706 : 606;

    this.drawButton(
      ctx,
      'btn-music-3d',
      140,
      btnAudioY,
      355,
      85,
      isMusicMuted ? '🎵 MUSIC: OFF' : '🎵 MUSIC: ON',
      'Toggle music',
      isMusicMuted ? '#8899aa' : '#00d4ff',
      () => {
        toggleAudio();
        const b = document.getElementById('btn-music');
        if (b) b.textContent = `🎵 MUSIC: ${getAudioMuted() ? 'OFF' : 'ON'}`;
        this.dialogTexture.needsUpdate = true;
      }
    );

    this.drawButton(
      ctx,
      'btn-sfx-3d',
      529,
      btnAudioY,
      355,
      85,
      isSfxMuted ? '🔊 SFX: OFF' : '🔊 SFX: ON',
      'Toggle sound effects',
      isSfxMuted ? '#8899aa' : '#10e052',
      () => {
        toggleSfx();
        const b = document.getElementById('btn-sfx');
        if (b) b.textContent = `🔊 SFX: ${getSfxMuted() ? 'OFF' : 'ON'}`;
        this.dialogTexture.needsUpdate = true;
      }
    );

    try {
      (window as any)._gof = ctx.getImageData(0, 0, 1, 1);
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
