import * as THREE from 'three';

interface TracerItem {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface SparkItem {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

const _start = new THREE.Vector3();
const _end = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export class EffectsPool {
  private tracers: TracerItem[] = [];
  private sparks: SparkItem[] = [];
  private tracerGeo: THREE.CylinderGeometry;
  private sparkGeo: THREE.BoxGeometry;
  private sparkMat: THREE.MeshBasicMaterial;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
    this.sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
    });

    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00d2ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.tracerGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0, maxLife: 0.1 });
    }

    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.25 });
    }
  }

  public spawnTracer(
    from: [number, number, number],
    to: [number, number, number],
    colorHex: string,
    duration = 0.09,
  ): void {
    const slot = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0];
    _start.set(from[0], from[1], from[2]);
    _end.set(to[0], to[1], to[2]);
    const dist = _start.distanceTo(_end);
    if (dist < 0.1) return;

    _mid.addVectors(_start, _end).multiplyScalar(0.5);
    _dir.subVectors(_end, _start).normalize();
    _quat.setFromUnitVectors(_up, _dir);

    slot.mesh.position.copy(_mid);
    slot.mesh.quaternion.copy(_quat);
    slot.mesh.scale.set(1, dist, 1);
    slot.mat.color.set(colorHex);
    slot.mat.opacity = 0.9;
    slot.mesh.visible = true;
    slot.life = duration;
    slot.maxLife = duration;
  }

  public spawnImpact(point: [number, number, number], count = 4): void {
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.mesh.position.set(point[0], point[1], point[2]);
      s.vx = (Math.random() - 0.5) * 7;
      s.vy = 1.5 + Math.random() * 4.5;
      s.vz = (Math.random() - 0.5) * 7;
      s.life = 0.22 + Math.random() * 0.12;
      s.maxLife = s.life;
      s.mesh.scale.setScalar(1);
      s.mesh.visible = true;
      spawned++;
      if (spawned >= count) break;
    }
  }

  public update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
      } else {
        t.mat.opacity = (t.life / t.maxLife) * 0.85;
      }
    }

    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
      } else {
        s.vy -= 14 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        const scale = s.life / s.maxLife;
        s.mesh.scale.setScalar(scale);
      }
    }
  }

  public dispose(): void {
    for (const t of this.tracers) {
      this.scene.remove(t.mesh);
      t.mat.dispose();
    }
    for (const s of this.sparks) {
      this.scene.remove(s.mesh);
    }
    this.tracerGeo.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
  }
}
