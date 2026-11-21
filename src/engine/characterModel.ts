import * as THREE from 'three';
import type { TeamId, WeaponId } from '../shared/types.ts';

export interface CharacterAvatar {
  root: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  upperBody: THREE.Group;
  head: THREE.Group;
  visorMat: THREE.MeshStandardMaterial;
  armorMat: THREE.MeshStandardMaterial;
  setTeamColor: (team: TeamId, isAlly: boolean) => void;
  setWeaponPose: (weapon: WeaponId) => void;
  setHitFlash: (active: boolean) => void;
  updateAnimation: (speed: number, crouching: boolean, pitch: number, time: number) => void;
  dispose: () => void;
}

export function createCharacterAvatar(team: TeamId): CharacterAvatar {
  const root = new THREE.Group();

  const accentColor = team === 2 ? '#EF4444' : team === 1 ? '#00D2FF' : '#F59E0B';

  const darkUnderMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.65,
    metalness: 0.25,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.72,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentColor),
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 1.9,
    roughness: 0.15,
    metalness: 0.2,
  });
  const gunMat = new THREE.MeshStandardMaterial({
    color: 0x0b1220,
    roughness: 0.3,
    metalness: 0.85,
  });

  const geometries: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // Bottom-center pivot at y = 0
  const legGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.72, 0.24));
  const leftLeg = new THREE.Mesh(legGeo, darkUnderMat);
  leftLeg.position.set(-0.14, 0.36, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, darkUnderMat);
  rightLeg.position.set(0.14, 0.36, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.72, 0);
  root.add(upperBody);

  // Torso core + Tactical Chestplate
  const torso = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 0.6, 0.3)), armorMat);
  torso.position.set(0, 0.3, 0);
  torso.castShadow = true;
  upperBody.add(torso);

  const chestCore = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.16, 0.32)), visorMat);
  chestCore.position.set(0, 0.36, 0);
  upperBody.add(chestCore);

  // Shoulder Pauldrons
  const padGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.2, 0.28));
  const leftPad = new THREE.Mesh(padGeo, armorMat);
  leftPad.position.set(-0.34, 0.5, 0);
  leftPad.castShadow = true;
  upperBody.add(leftPad);

  const rightPad = new THREE.Mesh(padGeo, armorMat);
  rightPad.position.set(0.34, 0.5, 0);
  rightPad.castShadow = true;
  upperBody.add(rightPad);

  // Head + Helmet + Glowing Visor
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0);
  upperBody.add(head);

  const helmet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.32, 0.34)), armorMat);
  helmet.position.set(0, 0.18, 0);
  helmet.castShadow = true;
  head.add(helmet);

  const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.1, 0.06)), visorMat);
  visor.position.set(0, 0.2, -0.16);
  head.add(visor);

  // Held Rifle Silhouette (faces -Z)
  const weaponMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.11, 0.62)), gunMat);
  weaponMesh.position.set(0.24, 0.34, -0.28);
  upperBody.add(weaponMesh);

  return {
    root,
    leftLeg,
    rightLeg,
    upperBody,
    head,
    visorMat,
    armorMat,
    setTeamColor: (t: TeamId, isAlly: boolean) => {
      const hex = t === 0 ? '#EF4444' : isAlly ? '#00D2FF' : '#EF4444';
      visorMat.color.set(hex);
      visorMat.emissive.set(hex);
    },
    setWeaponPose: (weapon: WeaponId) => {
      if (weapon === 'sniper') weaponMesh.scale.set(0.9, 1.0, 1.4);
      else if (weapon === 'pistol') weaponMesh.scale.set(0.75, 0.85, 0.45);
      else if (weapon === 'smg') weaponMesh.scale.set(0.9, 0.95, 0.75);
      else weaponMesh.scale.set(1, 1, 1);
    },
    setHitFlash: (active: boolean) => {
      armorMat.emissive.setHex(active ? 0xffffff : 0x000000);
      armorMat.emissiveIntensity = active ? 0.8 : 0;
    },
    updateAnimation: (speed: number, crouching: boolean, pitch: number, time: number) => {
      const targetUpperY = crouching ? 0.45 : 0.72;
      upperBody.position.y = THREE.MathUtils.lerp(upperBody.position.y, targetUpperY, 0.25);
      leftLeg.scale.y = crouching ? 0.62 : 1;
      rightLeg.scale.y = crouching ? 0.62 : 1;
      leftLeg.position.y = crouching ? 0.22 : 0.36;
      rightLeg.position.y = crouching ? 0.22 : 0.36;

      if (speed > 0.6) {
        const swing = Math.sin(time * Math.min(14, speed * 1.45)) * 0.45;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
      } else {
        leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, 0, 0.2);
        rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, 0, 0.2);
      }

      head.rotation.x = THREE.MathUtils.clamp(pitch * 0.6, -0.6, 0.6);
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      darkUnderMat.dispose();
      armorMat.dispose();
      visorMat.dispose();
      gunMat.dispose();
    },
  };
}
