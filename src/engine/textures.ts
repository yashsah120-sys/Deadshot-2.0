import * as THREE from 'three';

export interface ProceduralTextureSet {
  floorColor: THREE.CanvasTexture;
  wallColor: THREE.CanvasTexture;
  metalPanel: THREE.CanvasTexture;
  rampHazard: THREE.CanvasTexture;
  dispose: () => void;
}

export function createArenaTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Tactical Arena Floor Grid Texture
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 512;
  floorCanvas.height = 512;
  const fctx = floorCanvas.getContext('2d')!;
  fctx.fillStyle = '#121B2B';
  fctx.fillRect(0, 0, 512, 512);

  // Subtle tile variation
  fctx.fillStyle = '#152033';
  fctx.fillRect(4, 4, 248, 248);
  fctx.fillRect(260, 260, 248, 248);

  // Fine tactical grid lines
  fctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  fctx.lineWidth = 2;
  fctx.strokeRect(1, 1, 510, 510);
  fctx.beginPath();
  fctx.moveTo(256, 0);
  fctx.lineTo(256, 512);
  fctx.moveTo(0, 256);
  fctx.lineTo(512, 256);
  fctx.stroke();

  // Micro sub-grid
  fctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  fctx.lineWidth = 1;
  for (let i = 64; i < 512; i += 64) {
    fctx.beginPath();
    fctx.moveTo(i, 0);
    fctx.lineTo(i, 512);
    fctx.moveTo(0, i);
    fctx.lineTo(512, i);
    fctx.stroke();
  }

  const floorColor = new THREE.CanvasTexture(floorCanvas);
  floorColor.colorSpace = THREE.SRGBColorSpace;
  floorColor.wrapS = THREE.RepeatWrapping;
  floorColor.wrapT = THREE.RepeatWrapping;
  floorColor.repeat.set(16, 16);
  floorColor.anisotropy = maxAnisotropy;

  // 2. Futuristic Architectural Concrete Wall Texture
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 256;
  wallCanvas.height = 256;
  const wctx = wallCanvas.getContext('2d')!;
  wctx.fillStyle = '#1B2840';
  wctx.fillRect(0, 0, 256, 256);
  wctx.fillStyle = '#20304B';
  wctx.fillRect(8, 8, 240, 112);
  wctx.fillRect(8, 136, 240, 112);
  wctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  wctx.lineWidth = 2;
  wctx.strokeRect(8, 8, 240, 112);
  wctx.strokeRect(8, 136, 240, 112);
  // Subtle rivets
  wctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
  for (const rx of [18, 238]) {
    for (const ry of [18, 110, 146, 238]) {
      wctx.fillRect(rx - 2, ry - 2, 4, 4);
    }
  }

  const wallColor = new THREE.CanvasTexture(wallCanvas);
  wallColor.colorSpace = THREE.SRGBColorSpace;
  wallColor.wrapS = THREE.RepeatWrapping;
  wallColor.wrapT = THREE.RepeatWrapping;
  wallColor.anisotropy = maxAnisotropy;

  // 3. Brushed Metal Platform Panel
  const metalCanvas = document.createElement('canvas');
  metalCanvas.width = 256;
  metalCanvas.height = 256;
  const mctx = metalCanvas.getContext('2d')!;
  mctx.fillStyle = '#22314D';
  mctx.fillRect(0, 0, 256, 256);
  mctx.strokeStyle = 'rgba(0, 210, 255, 0.18)';
  mctx.lineWidth = 3;
  mctx.strokeRect(6, 6, 244, 244);
  mctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let y = 16; y < 240; y += 24) {
    mctx.fillRect(16, y, 224, 6);
  }

  const metalPanel = new THREE.CanvasTexture(metalCanvas);
  metalPanel.colorSpace = THREE.SRGBColorSpace;
  metalPanel.wrapS = THREE.RepeatWrapping;
  metalPanel.wrapT = THREE.RepeatWrapping;
  metalPanel.anisotropy = maxAnisotropy;

  // 4. Ramp Tread Texture
  const rampCanvas = document.createElement('canvas');
  rampCanvas.width = 256;
  rampCanvas.height = 256;
  const rctx = rampCanvas.getContext('2d')!;
  rctx.fillStyle = '#1E293B';
  rctx.fillRect(0, 0, 256, 256);
  rctx.fillStyle = 'rgba(0, 210, 255, 0.25)';
  for (let y = 0; y < 256; y += 32) {
    rctx.fillRect(16, y + 8, 224, 6);
  }
  rctx.fillStyle = '#F59E0B';
  rctx.fillRect(0, 0, 10, 256);
  rctx.fillRect(246, 0, 10, 256);

  const rampHazard = new THREE.CanvasTexture(rampCanvas);
  rampHazard.colorSpace = THREE.SRGBColorSpace;
  rampHazard.wrapS = THREE.RepeatWrapping;
  rampHazard.wrapT = THREE.RepeatWrapping;
  rampHazard.anisotropy = maxAnisotropy;

  return {
    floorColor,
    wallColor,
    metalPanel,
    rampHazard,
    dispose: () => {
      floorColor.dispose();
      wallColor.dispose();
      metalPanel.dispose();
      rampHazard.dispose();
    },
  };
}
