import * as THREE from 'three';
import type { SkinId, WeaponId } from '../shared/types.ts';
import { WEAPON_SKINS } from '../shared/weapons.ts';

export interface WeaponViewmodel {
  group: THREE.Group;
  muzzleFlash: THREE.Mesh;
  muzzlePoint: THREE.Object3D;
  dispose: () => void;
}

export function createWeaponViewmodel(weapon: WeaponId, skinId: SkinId): WeaponViewmodel {
  const skin = WEAPON_SKINS[skinId] || WEAPON_SKINS.standard;
  const group = new THREE.Group();

  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.primaryHex),
    metalness: skin.metalness,
    roughness: skin.roughness,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.secondaryHex),
    metalness: Math.min(0.95, skin.metalness + 0.08),
    roughness: Math.min(0.9, skin.roughness + 0.15),
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.92,
    roughness: 0.22,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.accentHex),
    emissive: new THREE.Color(skin.accentHex),
    emissiveIntensity: 1.8,
    metalness: 0.3,
    roughness: 0.2,
  });

  const parts: THREE.Mesh[] = [];
  const addPart = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parts.push(m);
    group.add(m);
    return m;
  };

  let muzzleZ = -0.6;
  let muzzleY = 0.03;

  if (weapon === 'ar') {
    // VX-47 Pulse Rifle (8-part assembly)
    addPart(new THREE.BoxGeometry(0.075, 0.1, 0.42), primaryMat, 0, 0, 0); // Receiver
    addPart(new THREE.BoxGeometry(0.065, 0.065, 0.28), secondaryMat, 0, 0.01, -0.32); // Shroud
    addPart(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 12), barrelMat, 0, 0.015, -0.38, Math.PI / 2); // Barrel
    addPart(new THREE.BoxGeometry(0.05, 0.14, 0.075), secondaryMat, 0, -0.1, -0.05, -0.18); // Magazine
    addPart(new THREE.BoxGeometry(0.048, 0.11, 0.06), secondaryMat, 0, -0.08, 0.12, 0.25); // Grip
    addPart(new THREE.BoxGeometry(0.055, 0.085, 0.18), primaryMat, 0, -0.01, 0.27); // Stock
    addPart(new THREE.BoxGeometry(0.042, 0.035, 0.12), barrelMat, 0, 0.07, -0.02); // Holographic optic housing
    addPart(new THREE.BoxGeometry(0.08, 0.012, 0.34), accentMat, 0, 0.035, -0.08); // Neon energy rail
    muzzleZ = -0.63;
    muzzleY = 0.015;
  } else if (weapon === 'sniper') {
    // Kestrel-9 Railgun (9-part assembly)
    addPart(new THREE.BoxGeometry(0.07, 0.095, 0.48), primaryMat, 0, 0, 0.04); // Main chassis
    addPart(new THREE.BoxGeometry(0.055, 0.03, 0.56), secondaryMat, 0, 0.042, -0.44); // Upper rail
    addPart(new THREE.BoxGeometry(0.055, 0.03, 0.56), secondaryMat, 0, -0.01, -0.44); // Lower rail
    addPart(new THREE.BoxGeometry(0.018, 0.018, 0.52), accentMat, 0, 0.016, -0.43); // Glowing rail core
    addPart(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 16), barrelMat, 0, 0.085, -0.04, Math.PI / 2); // Scope tube
    addPart(new THREE.CylinderGeometry(0.032, 0.026, 0.07, 16), secondaryMat, 0, 0.085, -0.17, Math.PI / 2); // Scope bell
    addPart(new THREE.BoxGeometry(0.045, 0.1, 0.055), secondaryMat, 0, -0.08, 0.15, 0.25); // Grip
    addPart(new THREE.BoxGeometry(0.05, 0.09, 0.22), primaryMat, 0, -0.01, 0.34); // Heavy stock
    addPart(new THREE.BoxGeometry(0.045, 0.09, 0.09), secondaryMat, 0, -0.08, -0.08); // Mag
    muzzleZ = -0.74;
    muzzleY = 0.016;
  } else if (weapon === 'smg') {
    // Viper-X9 SMG (7-part assembly)
    addPart(new THREE.BoxGeometry(0.068, 0.09, 0.32), primaryMat, 0, 0, -0.02); // Receiver
    addPart(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 12), barrelMat, 0, 0.01, -0.25, Math.PI / 2); // Suppressor shroud
    addPart(new THREE.BoxGeometry(0.04, 0.16, 0.05), secondaryMat, 0, -0.11, -0.06, -0.15); // Extended stick mag
    addPart(new THREE.BoxGeometry(0.044, 0.1, 0.055), secondaryMat, 0, -0.075, 0.08, 0.22); // Grip
    addPart(new THREE.BoxGeometry(0.072, 0.014, 0.24), accentMat, 0, 0.028, -0.03); // Side neon strip
    addPart(new THREE.BoxGeometry(0.038, 0.028, 0.07), barrelMat, 0, 0.062, -0.02); // Reflex sight
    addPart(new THREE.BoxGeometry(0.035, 0.06, 0.12), secondaryMat, 0, 0.0, 0.19); // Compact wire stock
    muzzleZ = -0.35;
    muzzleY = 0.01;
  } else if (weapon === 'shotgun') {
    // Breacher-12 Shotgun (7-part assembly)
    addPart(new THREE.BoxGeometry(0.08, 0.105, 0.38), primaryMat, 0, 0, 0.02); // Receiver
    addPart(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 12), barrelMat, 0, 0.03, -0.36, Math.PI / 2); // Upper barrel
    addPart(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 12), secondaryMat, 0, -0.01, -0.33, Math.PI / 2); // Tube mag
    addPart(new THREE.BoxGeometry(0.065, 0.055, 0.18), secondaryMat, 0, -0.015, -0.3); // Pump grip
    addPart(new THREE.BoxGeometry(0.055, 0.08, 0.22), primaryMat, 0, -0.02, 0.28, -0.1); // Stock
    addPart(new THREE.BoxGeometry(0.084, 0.015, 0.22), accentMat, 0, 0.02, 0.0); // Heat strip
    muzzleZ = -0.6;
    muzzleY = 0.03;
  } else {
    // Apex-45 Pistol (6-part assembly)
    addPart(new THREE.BoxGeometry(0.052, 0.058, 0.24), primaryMat, 0, 0.025, -0.04); // Slide
    addPart(new THREE.BoxGeometry(0.046, 0.038, 0.21), secondaryMat, 0, -0.015, -0.03); // Frame
    addPart(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 10), barrelMat, 0, 0.022, -0.17, Math.PI / 2); // Barrel tip
    addPart(new THREE.BoxGeometry(0.042, 0.11, 0.055), secondaryMat, 0, -0.075, 0.035, 0.24); // Grip
    addPart(new THREE.BoxGeometry(0.056, 0.01, 0.18), accentMat, 0, 0.026, -0.04); // Slide neon accent
    muzzleZ = -0.21;
    muzzleY = 0.022;
  }

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, muzzleY, muzzleZ);
  group.add(muzzlePoint);

  const flashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(skin.accentHex),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const flashGeo = new THREE.OctahedronGeometry(0.065, 0);
  const muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
  muzzleFlash.position.set(0, muzzleY, muzzleZ - 0.03);
  muzzleFlash.scale.set(1, 1, 1.8);
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  return {
    group,
    muzzleFlash,
    muzzlePoint,
    dispose: () => {
      for (const m of parts) m.geometry.dispose();
      flashGeo.dispose();
      primaryMat.dispose();
      secondaryMat.dispose();
      barrelMat.dispose();
      accentMat.dispose();
      flashMat.dispose();
    },
  };
}
