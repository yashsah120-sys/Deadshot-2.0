import * as THREE from 'three';
import type { GraphicsQuality, MapDefinition } from '../shared/types.ts';
import { createArenaTextures } from './textures.ts';

export interface BuiltMapScene {
  group: THREE.Group;
  keyLight: THREE.DirectionalLight;
  dispose: () => void;
}

function createRampMesh(
  width: number,
  height: number,
  length: number,
  axis: 'x' | 'z',
  dir: 1 | -1,
  mat: THREE.Material,
): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
  const shape = new THREE.Shape();
  if (dir === 1) {
    shape.moveTo(-length / 2, 0);
    shape.lineTo(length / 2, 0);
    shape.lineTo(length / 2, height);
    shape.closePath();
  } else {
    shape.moveTo(-length / 2, 0);
    shape.lineTo(length / 2, 0);
    shape.lineTo(-length / 2, height);
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
  });
  // Center extrusion on Z, then orient along axis
  geo.translate(0, 0, -width / 2);
  if (axis === 'z') {
    // Shape X -> World Z, Extrude Z -> World X
    geo.rotateY(-Math.PI / 2);
    // Note: rotating -PI/2 maps +X to +Z! Check dir:
    // After rotateY(-PI/2): original x becomes z, original z becomes -x.
    // Wait: in Three.js rotateY(-PI/2): x' = -z, z' = x. Let's double check:
    // +X rotated -90 deg around Y (looking down +Y, clockwise) goes to +Z! Yes!
  }

  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return { mesh, geometry: geo };
}

export function buildArenaScene(
  map: MapDefinition,
  scene: THREE.Scene,
  maxAnisotropy: number,
  quality: GraphicsQuality,
  isSoftwareGl: boolean,
): BuiltMapScene {
  const group = new THREE.Group();
  const textures = createArenaTextures(maxAnisotropy);
  const disposables: Array<{ dispose: () => void }> = [textures];

  scene.background = new THREE.Color(map.skyColor);
  scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);

  // 3-Point Lighting Rig (<= 3 shadow casters: only 1 directional key light casts shadows)
  const hemi = new THREE.HemisphereLight(map.ambientSky, map.ambientGround, 0.85);
  group.add(hemi);

  const keyLight = new THREE.DirectionalLight(map.keyLightColor, 1.65);
  keyLight.position.set(24, 42, 18);
  const enableShadows = !isSoftwareGl && quality !== 'low';
  keyLight.castShadow = enableShadows;
  if (enableShadows) {
    const sSize = quality === 'high' ? 2048 : 1024;
    keyLight.shadow.mapSize.set(sSize, sSize);
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 110;
    const d = 36;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.03;
  }
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight('#00D2FF', 0.55);
  rimLight.position.set(-28, 18, -26);
  group.add(rimLight);

  // Materials
  const floorMat = new THREE.MeshStandardMaterial({
    map: textures.floorColor,
    roughness: 0.72,
    metalness: 0.22,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: textures.wallColor,
    roughness: 0.6,
    metalness: 0.35,
  });
  const platformMat = new THREE.MeshStandardMaterial({
    map: textures.metalPanel,
    roughness: 0.42,
    metalness: 0.58,
  });
  const coverMat = new THREE.MeshStandardMaterial({
    color: 0x263854,
    roughness: 0.48,
    metalness: 0.48,
  });
  const rampMat = new THREE.MeshStandardMaterial({
    map: textures.rampHazard,
    roughness: 0.55,
    metalness: 0.35,
  });

  disposables.push(floorMat, wallMat, platformMat, coverMat, rampMat);

  // Build Colliders
  for (const c of map.colliders) {
    const w = c.maxX - c.minX;
    const h = c.maxY - c.minY;
    const d = c.maxZ - c.minZ;
    const cx = (c.minX + c.maxX) / 2;
    const cy = (c.minY + c.maxY) / 2;
    const cz = (c.minZ + c.maxZ) / 2;

    const geo = new THREE.BoxGeometry(w, h, d);
    disposables.push(geo);

    let mat: THREE.Material = wallMat;
    if (c.kind === 'floor') mat = floorMat;
    else if (c.kind === 'platform') mat = platformMat;
    else if (c.kind === 'cover' || c.kind === 'pillar') mat = coverMat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = c.kind !== 'floor';
    group.add(mesh);
  }

  // Build Ramps
  for (const r of map.ramps) {
    const { mesh, geometry } = createRampMesh(r.width, r.height, r.length, r.axis, r.dir, rampMat);
    mesh.position.set(r.x, r.y, r.z);
    group.add(mesh);
    disposables.push(geometry);
  }

  // Build Emissive Neon Trim Strips
  for (const strip of map.neonTrimStrips) {
    const geo = new THREE.BoxGeometry(strip.w, strip.h, strip.d);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(strip.color),
      emissive: new THREE.Color(strip.color),
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(strip.x, strip.y, strip.z);
    group.add(mesh);
    disposables.push(geo, mat);
  }

  // Outer Urban Skyline Silhouettes (prevents floating arena void)
  const skyGeo = new THREE.BoxGeometry(1, 1, 1);
  const skyMat = new THREE.MeshStandardMaterial({
    color: 0x0e1726,
    roughness: 0.85,
    metalness: 0.2,
  });
  const towerCount = 36;
  const skylineInstanced = new THREE.InstancedMesh(skyGeo, skyMat, towerCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < towerCount; i++) {
    const angle = (i / towerCount) * Math.PI * 2;
    const dist = 48 + (i % 3) * 14;
    const height = 18 + ((i * 13) % 34);
    const width = 8 + ((i * 7) % 10);
    dummy.position.set(Math.cos(angle) * dist, height / 2 - 4, Math.sin(angle) * dist);
    dummy.scale.set(width, height, width);
    dummy.rotation.y = angle * 0.5;
    dummy.updateMatrix();
    skylineInstanced.setMatrixAt(i, dummy.matrix);
  }
  skylineInstanced.instanceMatrix.needsUpdate = true;
  skylineInstanced.computeBoundingSphere();
  group.add(skylineInstanced);
  disposables.push(skyGeo, skyMat);

  // Extended Ground Apron outside perimeter
  const apronGeo = new THREE.PlaneGeometry(240, 240);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x090f1a,
    roughness: 0.9,
    metalness: 0.1,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.05;
  group.add(apron);
  disposables.push(apronGeo, apronMat);

  scene.add(group);

  return {
    group,
    keyLight,
    dispose: () => {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
