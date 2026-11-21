import type { MapDefinition, PlayerInputState } from './types.ts';

export const PLAYER_RADIUS = 0.42;
export const PLAYER_STAND_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.15;
export const PLAYER_EYE_STAND = 1.58;
export const PLAYER_EYE_CROUCH = 0.96;

const BASE_SPEED = 7.6;
const SPRINT_MULT = 1.36;
const CROUCH_MULT = 0.58;
const GROUND_ACCEL = 58.0;
const GROUND_FRICTION = 11.5;
const AIR_ACCEL = 19.0;
const JUMP_VELOCITY = 8.6;
const GRAVITY = 23.0;
const STEP_UP_MAX = 0.45;

export interface PhysicsBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  crouching: boolean;
  sprinting: boolean;
}

function getRampTopY(x: number, z: number, map: MapDefinition): number | null {
  let highest: number | null = null;
  for (const r of map.ramps) {
    if (r.axis === 'z') {
      const halfW = r.width / 2 + PLAYER_RADIUS * 0.4;
      const halfL = r.length / 2;
      if (x >= r.x - halfW && x <= r.x + halfW && z >= r.z - halfL && z <= r.z + halfL) {
        const t = r.dir === 1
          ? (z - (r.z - halfL)) / r.length
          : ((r.z + halfL) - z) / r.length;
        const clampedT = Math.max(0, Math.min(1, t));
        const ry = r.y + clampedT * r.height;
        if (highest === null || ry > highest) highest = ry;
      }
    } else {
      const halfW = r.width / 2 + PLAYER_RADIUS * 0.4;
      const halfL = r.length / 2;
      if (z >= r.z - halfW && z <= r.z + halfW && x >= r.x - halfL && x <= r.x + halfL) {
        const t = r.dir === 1
          ? (x - (r.x - halfL)) / r.length
          : ((r.x + halfL) - x) / r.length;
        const clampedT = Math.max(0, Math.min(1, t));
        const ry = r.y + clampedT * r.height;
        if (highest === null || ry > highest) highest = ry;
      }
    }
  }
  return highest;
}

export function stepPlayerPhysics(
  body: PhysicsBody,
  input: PlayerInputState,
  map: MapDefinition,
  weaponSpeedMult: number,
): void {
  const dt = Math.min(Math.max(input.dt, 0.001), 0.05);

  body.yaw = input.yaw;
  body.pitch = Math.max(-1.48, Math.min(1.48, input.pitch));
  body.crouching = input.crouch;
  body.sprinting = input.sprint && !input.crouch && input.forward > 0.1;

  const height = body.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_STAND_HEIGHT;

  // Compute desired horizontal direction from yaw
  // Three.js camera forward with rotation.y = yaw (YXZ): (-sin(yaw), 0, -cos(yaw))
  // Right vector: (cos(yaw), 0, -sin(yaw))
  const sinY = Math.sin(body.yaw);
  const cosY = Math.cos(body.yaw);

  let moveX = -sinY * input.forward + cosY * input.right;
  let moveZ = -cosY * input.forward - sinY * input.right;
  const moveLen = Math.hypot(moveX, moveZ);
  if (moveLen > 1e-5) {
    moveX /= Math.max(1, moveLen);
    moveZ /= Math.max(1, moveLen);
  }

  let maxSpeed = BASE_SPEED * weaponSpeedMult;
  if (body.crouching) maxSpeed *= CROUCH_MULT;
  else if (body.sprinting) maxSpeed *= SPRINT_MULT;

  if (body.grounded) {
    // Friction
    const speed = Math.hypot(body.vx, body.vz);
    if (speed > 0.001) {
      const drop = speed * GROUND_FRICTION * dt;
      const newSpeed = Math.max(0, speed - drop) / speed;
      body.vx *= newSpeed;
      body.vz *= newSpeed;
    }

    // Acceleration
    const accelX = moveX * maxSpeed * GROUND_ACCEL * dt;
    const accelZ = moveZ * maxSpeed * GROUND_ACCEL * dt;
    body.vx += accelX;
    body.vz += accelZ;

    const newH = Math.hypot(body.vx, body.vz);
    if (newH > maxSpeed) {
      body.vx = (body.vx / newH) * maxSpeed;
      body.vz = (body.vz / newH) * maxSpeed;
    }

    if (input.jump && !body.crouching) {
      body.vy = JUMP_VELOCITY;
      body.grounded = false;
    }
  } else {
    // Air control
    const targetVx = moveX * maxSpeed;
    const targetVz = moveZ * maxSpeed;
    const dvx = targetVx - body.vx;
    const dvz = targetVz - body.vz;
    const dvLen = Math.hypot(dvx, dvz);
    if (dvLen > 0.001) {
      const step = Math.min(dvLen, AIR_ACCEL * dt);
      body.vx += (dvx / dvLen) * step;
      body.vz += (dvz / dvLen) * step;
    }
  }

  // Gravity
  body.vy -= GRAVITY * dt;

  // Horizontal Movement + AABB collision (X then Z)
  const r = PLAYER_RADIUS;

  body.x += body.vx * dt;
  for (const c of map.colliders) {
    if (body.y + height <= c.minY + 0.01 || body.y >= c.maxY - 0.01) continue;
    if (
      body.x + r > c.minX &&
      body.x - r < c.maxX &&
      body.z + r > c.minZ &&
      body.z - r < c.maxZ
    ) {
      // Step-up check for low curbs/platforms
      const stepDelta = c.maxY - body.y;
      if (stepDelta > 0 && stepDelta <= STEP_UP_MAX && body.vy <= 0.1) {
        body.y = c.maxY;
        continue;
      }
      if (body.vx > 0) body.x = c.minX - r;
      else if (body.vx < 0) body.x = c.maxX + r;
      else {
        const pushLeft = Math.abs(body.x + r - c.minX);
        const pushRight = Math.abs(c.maxX - (body.x - r));
        body.x = pushLeft < pushRight ? c.minX - r : c.maxX + r;
      }
      body.vx = 0;
    }
  }

  body.z += body.vz * dt;
  for (const c of map.colliders) {
    if (body.y + height <= c.minY + 0.01 || body.y >= c.maxY - 0.01) continue;
    if (
      body.x + r > c.minX &&
      body.x - r < c.maxX &&
      body.z + r > c.minZ &&
      body.z - r < c.maxZ
    ) {
      const stepDelta = c.maxY - body.y;
      if (stepDelta > 0 && stepDelta <= STEP_UP_MAX && body.vy <= 0.1) {
        body.y = c.maxY;
        continue;
      }
      if (body.vz > 0) body.z = c.minZ - r;
      else if (body.vz < 0) body.z = c.maxZ + r;
      else {
        const pushFront = Math.abs(body.z + r - c.minZ);
        const pushBack = Math.abs(c.maxZ - (body.z - r));
        body.z = pushFront < pushBack ? c.minZ - r : c.maxZ + r;
      }
      body.vz = 0;
    }
  }

  // Vertical Movement
  const prevY = body.y;
  body.y += body.vy * dt;
  body.grounded = false;

  for (const c of map.colliders) {
    if (
      body.x + r > c.minX &&
      body.x - r < c.maxX &&
      body.z + r > c.minZ &&
      body.z - r < c.maxZ
    ) {
      if (body.vy <= 0 && prevY >= c.maxY - 0.15 && body.y <= c.maxY) {
        body.y = c.maxY;
        body.vy = 0;
        body.grounded = true;
      } else if (body.vy > 0 && prevY + height <= c.minY + 0.15 && body.y + height >= c.minY) {
        body.y = c.minY - height;
        body.vy = 0;
      }
    }
  }

  // Ramp surface check
  const rampY = getRampTopY(body.x, body.z, map);
  if (rampY !== null) {
    if (body.vy <= 0 && body.y <= rampY + 0.2 && prevY >= rampY - 0.65) {
      body.y = rampY;
      body.vy = 0;
      body.grounded = true;
    }
  }

  // Hard floor safety
  if (body.y < 0) {
    body.y = 0;
    body.vy = 0;
    body.grounded = true;
  }

  // Arena bounds clamp safety
  const halfArena = map.size / 2 - r;
  body.x = Math.max(-halfArena, Math.min(halfArena, body.x));
  body.z = Math.max(-halfArena, Math.min(halfArena, body.z));
}

export interface RaycastMapHit {
  distance: number;
  point: [number, number, number];
  normal: [number, number, number];
}

function rayVsAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): { t: number; nx: number; ny: number; nz: number } | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;

  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const invD = 1 / dx;
    let t1 = (minX - ox) * invD;
    let t2 = (maxX - ox) * invD;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = sign;
      ny = 0;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const invD = 1 / dy;
    let t1 = (minY - oy) * invD;
    let t2 = (maxY - oy) * invD;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = sign;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const invD = 1 / dz;
    let t1 = (minZ - oz) * invD;
    let t2 = (maxZ - oz) * invD;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = 0;
      nz = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (tmax < 0 || tmin < 0) return null;
  return { t: tmin, nx, ny, nz };
}

export function raycastMap(
  origin: [number, number, number],
  dir: [number, number, number],
  maxDist: number,
  map: MapDefinition,
): RaycastMapHit | null {
  let closestT = maxDist;
  let bestHit: RaycastMapHit | null = null;

  for (const c of map.colliders) {
    const res = rayVsAABB(
      origin[0],
      origin[1],
      origin[2],
      dir[0],
      dir[1],
      dir[2],
      c.minX,
      c.minY,
      c.minZ,
      c.maxX,
      c.maxY,
      c.maxZ,
    );
    if (res && res.t < closestT) {
      closestT = res.t;
      bestHit = {
        distance: res.t,
        point: [
          origin[0] + dir[0] * res.t,
          origin[1] + dir[1] * res.t,
          origin[2] + dir[2] * res.t,
        ],
        normal: [res.nx, res.ny, res.nz],
      };
    }
  }

  return bestHit;
}

export interface PlayerHitResult {
  distance: number;
  headshot: boolean;
  point: [number, number, number];
}

export function raycastPlayerHitbox(
  origin: [number, number, number],
  dir: [number, number, number],
  maxDist: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  crouching: boolean,
): PlayerHitResult | null {
  // Check Head Box first (generous competitive arcade FPS head hitbox)
  const headCenterY = targetY + (crouching ? 0.96 : 1.56);
  const headRadius = 0.24;
  const headHit = rayVsAABB(
    origin[0],
    origin[1],
    origin[2],
    dir[0],
    dir[1],
    dir[2],
    targetX - headRadius,
    headCenterY - headRadius,
    targetZ - headRadius,
    targetX + headRadius,
    headCenterY + headRadius,
    targetZ + headRadius,
  );
  if (headHit && headHit.t <= maxDist) {
    return {
      distance: headHit.t,
      headshot: true,
      point: [
        origin[0] + dir[0] * headHit.t,
        origin[1] + dir[1] * headHit.t,
        origin[2] + dir[2] * headHit.t,
      ],
    };
  }

  // Check Torso / Legs Box
  const bodyTop = targetY + (crouching ? 0.85 : 1.38);
  const bodyRadius = 0.38;
  const bodyHit = rayVsAABB(
    origin[0],
    origin[1],
    origin[2],
    dir[0],
    dir[1],
    dir[2],
    targetX - bodyRadius,
    targetY,
    targetZ - bodyRadius,
    targetX + bodyRadius,
    bodyTop,
    targetZ + bodyRadius,
  );
  if (bodyHit && bodyHit.t <= maxDist) {
    return {
      distance: bodyHit.t,
      headshot: false,
      point: [
        origin[0] + dir[0] * bodyHit.t,
        origin[1] + dir[1] * bodyHit.t,
        origin[2] + dir[2] * bodyHit.t,
      ],
    };
  }

  return null;
}
