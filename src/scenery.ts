import { sin, randRange } from './math';

const THREE = (window as any).THREE || (typeof AFRAME !== 'undefined' ? AFRAME.THREE : null);

interface HillData {
  mesh: any;
  speedFactor: number;
}

export class SceneryManager {
  public group: any;
  private hills: HillData[] = [];
  private sunMesh: any;
  private coronaMesh: any;

  constructor(scene: any) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.initSun();
    this.initHills();
  }

  private initSun(): void {
    // 1. Radiant central solar sphere
    const sunGeom = new THREE.SphereGeometry(9, 14, 10);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      fog: false,
      depthWrite: false,
    });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.sunMesh.position.set(0, 14, -145);
    this.group.add(this.sunMesh);

    // 2. Soft glowing corona with radial canvas gradient
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 32;
    const ctx = cvs.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,245,190,.95)');
    grad.addColorStop(0.3, 'rgba(255,175,50,.6)');
    grad.addColorStop(0.7, 'rgba(255,80,20,.18)');
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const coronaTex = new THREE.CanvasTexture(cvs);
    const coronaMat = new THREE.MeshBasicMaterial({
      map: coronaTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this.coronaMesh = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), coronaMat);
    this.coronaMesh.position.set(0, 14, -144.5);
    this.group.add(this.coronaMesh);
  }

  private initHills(): void {
    // Shared low-poly cone geometry with base at Y = 0
    const hillGeom = new THREE.ConeGeometry(1, 1, 7);
    hillGeom.translate(0, 0.5, 0);

    // 3 Atmospheric hill materials for near, mid, and far layers
    const mats = [
      new THREE.MeshLambertMaterial({ color: 0x301852, flatShading: true }),
      new THREE.MeshLambertMaterial({ color: 0x1e123c, flatShading: true }),
      new THREE.MeshLambertMaterial({ color: 0x140e2a, flatShading: true }),
    ];

    // Layers: [count, xMin, xMax, rMin, rMax, hMin, hMax, baseY, speed, matIdx]
    const layers = [
      [10, 8, 15, 6, 11, 5, 9, -4, 1.0, 0],
      [8, 18, 32, 12, 20, 9, 17, -6, 0.65, 1],
      [6, 35, 65, 22, 40, 18, 32, -8, 0.35, 2],
    ];

    for (const [count, xMin, xMax, rMin, rMax, hMin, hMax, baseY, speed, mat] of layers) {
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const x = side * randRange(xMin, xMax);
        const z = randRange(-140, 20);
        const r = randRange(rMin, rMax);
        const h = randRange(hMin, hMax);

        const mesh = new THREE.Mesh(hillGeom, mats[mat]);
        mesh.position.set(x, baseY, z);
        mesh.scale.set(r, h, r * 1.25);
        mesh.rotation.y = randRange(0, Math.PI * 2);

        this.group.add(mesh);
        this.hills.push({ mesh, speedFactor: speed });
      }
    }
  }

  public reset(): void {
    // Re-spread hills along the track
    for (let i = 0; i < this.hills.length; i++) {
      this.hills[i].mesh.position.z = randRange(-140, 20);
    }
  }

  public update(dt: number, speed: number, time: number): void {
    // 1. Gently pulse solar corona
    if (this.coronaMesh) {
      const pulse = 1 + sin(time * 2.2) * 0.045;
      this.coronaMesh.scale.set(pulse, pulse, 1);
    }

    // 2. Parallax scrolling of hills along the track
    for (let i = 0; i < this.hills.length; i++) {
      const h = this.hills[i];
      h.mesh.position.z += speed * dt * h.speedFactor;

      // Wrap when passing behind the camera
      if (h.mesh.position.z > 25) {
        h.mesh.position.z -= 165;
        h.mesh.rotation.y = randRange(0, Math.PI * 2);
      }
    }
  }
}
