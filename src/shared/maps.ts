import type { AABBCollider, MapDefinition, MapId } from './types.ts';

function box(
  id: string,
  cx: number,
  bottomY: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  kind: AABBCollider['kind'],
  color?: string,
  accent?: string,
): AABBCollider {
  return {
    id,
    minX: cx - w / 2,
    minY: bottomY,
    minZ: cz - d / 2,
    maxX: cx + w / 2,
    maxY: bottomY + h,
    maxZ: cz + d / 2,
    kind,
    color,
    accent,
  };
}

const NEON_DISTRICT: MapDefinition = {
  id: 'neon_district',
  name: 'NEON DISTRICT',
  subtitle: 'Futuristic Urban Courtyard · Rooftops & Skybridges',
  size: 60,
  skyColor: '#09111F',
  fogColor: '#0A1324',
  fogDensity: 0.011,
  ambientSky: '#60A5FA',
  ambientGround: '#0F172A',
  keyLightColor: '#E0F2FE',
  colliders: [
    // Main Arena Floor
    box('nd_floor', 0, -1, 0, 64, 1, 64, 'floor', '#121B2B'),

    // Outer Arena Perimeter Walls (60x60 playable)
    box('nd_wall_n', 0, 0, -30.5, 62, 7.5, 1, 'wall', '#172236', '#00D2FF'),
    box('nd_wall_s', 0, 0, 30.5, 62, 7.5, 1, 'wall', '#172236', '#00D2FF'),
    box('nd_wall_w', -30.5, 0, 0, 1, 7.5, 60, 'wall', '#172236', '#00D2FF'),
    box('nd_wall_e', 30.5, 0, 0, 1, 7.5, 60, 'wall', '#172236', '#00D2FF'),

    // === NORTH BUILDING (z: -24 to -14, x: -12 to 12, indoor + rooftop y=4.0) ===
    // North Back Wall (with side alley gaps)
    box('nd_nb_back', 0, 0, -24, 24, 4.0, 1.2, 'building', '#1B2840'),
    // North Front Wall split into 3 segments (2 wide doorways into central courtyard)
    box('nd_nb_front_c', 0, 0, -14, 7, 4.0, 1.0, 'building', '#1B2840', '#00D2FF'),
    box('nd_nb_front_l', -9.5, 0, -14, 5, 4.0, 1.0, 'building', '#1B2840'),
    box('nd_nb_front_r', 9.5, 0, -14, 5, 4.0, 1.0, 'building', '#1B2840'),
    // North Side Walls with doorways
    box('nd_nb_side_l1', -12, 0, -21.5, 1.0, 4.0, 4.5, 'building', '#1B2840'),
    box('nd_nb_side_l2', -12, 0, -15.5, 1.0, 4.0, 2.5, 'building', '#1B2840'),
    box('nd_nb_side_r1', 12, 0, -21.5, 1.0, 4.0, 4.5, 'building', '#1B2840'),
    box('nd_nb_side_r2', 12, 0, -15.5, 1.0, 4.0, 2.5, 'building', '#1B2840'),
    // North Rooftop Slab (y: 3.6 to 4.0)
    box('nd_nb_roof', 0, 3.6, -19, 25, 0.4, 11, 'platform', '#22314D', '#00D2FF'),
    // North Rooftop Low Parapet Cover
    box('nd_nb_parapet_c', 0, 4.0, -13.9, 6, 1.05, 0.45, 'cover', '#283B5C', '#00D2FF'),
    box('nd_nb_parapet_l', -8.5, 4.0, -13.9, 4, 1.05, 0.45, 'cover', '#283B5C'),
    box('nd_nb_parapet_r', 8.5, 4.0, -13.9, 4, 1.05, 0.45, 'cover', '#283B5C'),
    // North Indoor Cover Pillar
    box('nd_nb_in_c', 0, 0, -19, 2.6, 3.6, 2.2, 'pillar', '#24344F', '#38BDF8'),

    // === SOUTH BUILDING (z: 14 to 24, x: -12 to 12, indoor + rooftop y=4.0) ===
    box('nd_sb_back', 0, 0, 24, 24, 4.0, 1.2, 'building', '#1B2840'),
    box('nd_sb_front_c', 0, 0, 14, 7, 4.0, 1.0, 'building', '#1B2840', '#F59E0B'),
    box('nd_sb_front_l', -9.5, 0, 14, 5, 4.0, 1.0, 'building', '#1B2840'),
    box('nd_sb_front_r', 9.5, 0, 14, 5, 4.0, 1.0, 'building', '#1B2840'),
    box('nd_sb_side_l1', -12, 0, 21.5, 1.0, 4.0, 4.5, 'building', '#1B2840'),
    box('nd_sb_side_l2', -12, 0, 15.5, 1.0, 4.0, 2.5, 'building', '#1B2840'),
    box('nd_sb_side_r1', 12, 0, 21.5, 1.0, 4.0, 4.5, 'building', '#1B2840'),
    box('nd_sb_side_r2', 12, 0, 15.5, 1.0, 4.0, 2.5, 'building', '#1B2840'),
    box('nd_sb_roof', 0, 3.6, 19, 25, 0.4, 11, 'platform', '#22314D', '#F59E0B'),
    box('nd_sb_parapet_c', 0, 4.0, 13.9, 6, 1.05, 0.45, 'cover', '#283B5C', '#F59E0B'),
    box('nd_sb_parapet_l', -8.5, 4.0, 13.9, 4, 1.05, 0.45, 'cover', '#283B5C'),
    box('nd_sb_parapet_r', 8.5, 4.0, 13.9, 4, 1.05, 0.45, 'cover', '#283B5C'),
    box('nd_sb_in_c', 0, 0, 19, 2.6, 3.6, 2.2, 'pillar', '#24344F', '#F59E0B'),

    // === WEST ELEVATED SKYBRIDGE & CONNECTORS ===
    box('nd_w_bridge', -21, 3.6, 0, 6, 0.4, 24, 'platform', '#23324D', '#00D2FF'),
    box('nd_w_bridge_n_link', -16.5, 3.6, -16, 8, 0.4, 5, 'platform', '#23324D'),
    box('nd_w_bridge_s_link', -16.5, 3.6, 16, 8, 0.4, 5, 'platform', '#23324D'),
    box('nd_w_pillar_1', -21, 0, -9, 1.5, 3.6, 1.5, 'pillar', '#1A253B', '#00D2FF'),
    box('nd_w_pillar_2', -21, 0, 9, 1.5, 3.6, 1.5, 'pillar', '#1A253B', '#00D2FF'),
    box('nd_w_rail_1', -18.2, 4.0, 0, 0.4, 1.0, 10, 'cover', '#2B3E5E', '#00D2FF'),

    // === EAST ELEVATED SKYBRIDGE & CONNECTORS ===
    box('nd_e_bridge', 21, 3.6, 0, 6, 0.4, 24, 'platform', '#23324D', '#00D2FF'),
    box('nd_e_bridge_n_link', 16.5, 3.6, -16, 8, 0.4, 5, 'platform', '#23324D'),
    box('nd_e_bridge_s_link', 16.5, 3.6, 16, 8, 0.4, 5, 'platform', '#23324D'),
    box('nd_e_pillar_1', 21, 0, -9, 1.5, 3.6, 1.5, 'pillar', '#1A253B', '#00D2FF'),
    box('nd_e_pillar_2', 21, 0, 9, 1.5, 3.6, 1.5, 'pillar', '#1A253B', '#00D2FF'),
    box('nd_e_rail_1', 18.2, 4.0, 0, 0.4, 1.0, 10, 'cover', '#2B3E5E', '#00D2FF'),

    // === CENTRAL PLAZA COVER & PARKOUR CRATES ===
    // Central Cyber Monolith
    box('nd_mid_core', 0, 0, 0, 4.2, 2.8, 4.2, 'pillar', '#1E2C45', '#00D2FF'),
    box('nd_mid_step_w', -3.2, 0, 0, 2.2, 1.35, 2.6, 'cover', '#263959'),
    box('nd_mid_step_e', 3.2, 0, 0, 2.2, 1.35, 2.6, 'cover', '#263959'),

    // Courtyard Cover Barriers
    box('nd_cov_nw', -7.5, 0, -6.5, 3.6, 1.5, 1.2, 'cover', '#253552', '#38BDF8'),
    box('nd_cov_ne', 7.5, 0, -6.5, 3.6, 1.5, 1.2, 'cover', '#253552', '#38BDF8'),
    box('nd_cov_sw', -7.5, 0, 6.5, 3.6, 1.5, 1.2, 'cover', '#253552', '#F59E0B'),
    box('nd_cov_se', 7.5, 0, 6.5, 3.6, 1.5, 1.2, 'cover', '#253552', '#F59E0B'),

    // Jumpable Cargo Crates in Lanes
    box('nd_crate_w1', -13, 0, -2, 2.4, 1.3, 2.4, 'cover', '#2B3E5C'),
    box('nd_crate_w2', -13, 0, 1.2, 2.4, 2.4, 2.4, 'cover', '#20304A', '#00D2FF'),
    box('nd_crate_e1', 13, 0, 2, 2.4, 1.3, 2.4, 'cover', '#2B3E5C'),
    box('nd_crate_e2', 13, 0, -1.2, 2.4, 2.4, 2.4, 'cover', '#20304A', '#00D2FF'),

    // Corner Cover Blocks
    box('nd_corner_nw', -23, 0, -24, 3.5, 2.2, 2.5, 'cover', '#202E47'),
    box('nd_corner_ne', 23, 0, -24, 3.5, 2.2, 2.5, 'cover', '#202E47'),
    box('nd_corner_sw', -23, 0, 24, 3.5, 2.2, 2.5, 'cover', '#202E47'),
    box('nd_corner_se', 23, 0, 24, 3.5, 2.2, 2.5, 'cover', '#202E47'),
  ],
  ramps: [
    // West ramp ascending from z=0 area up to West Skybridge (or from outer corners up to skybridge links)
    { id: 'nd_ramp_nw', x: -21, y: 0, z: -20, width: 4.5, height: 3.6, length: 8.5, axis: 'z', dir: 1 },
    { id: 'nd_ramp_sw', x: -21, y: 0, z: 20, width: 4.5, height: 3.6, length: 8.5, axis: 'z', dir: -1 },
    { id: 'nd_ramp_ne', x: 21, y: 0, z: -20, width: 4.5, height: 3.6, length: 8.5, axis: 'z', dir: 1 },
    { id: 'nd_ramp_se', x: 21, y: 0, z: 20, width: 4.5, height: 3.6, length: 8.5, axis: 'z', dir: -1 },
  ],
  neonTrimStrips: [
    { x: 0, y: 4.05, z: -13.6, w: 25, h: 0.12, d: 0.12, color: '#00D2FF' },
    { x: 0, y: 4.05, z: 13.6, w: 25, h: 0.12, d: 0.12, color: '#F59E0B' },
    { x: -18, y: 3.8, z: 0, w: 0.12, h: 0.12, d: 24, color: '#00D2FF' },
    { x: 18, y: 3.8, z: 0, w: 0.12, h: 0.12, d: 24, color: '#00D2FF' },
    { x: 0, y: 2.85, z: 0, w: 4.3, h: 0.12, d: 4.3, color: '#00D2FF' },
  ],
  spawns: [
    // Team 1 (North) & FFA Spawns
    { x: -7, y: 0.1, z: -26.8, yaw: 0, team: 1 },
    { x: 7, y: 0.1, z: -26.8, yaw: 0, team: 1 },
    { x: -26, y: 0.1, z: -26, yaw: Math.PI * 0.25, team: 1 },
    { x: 26, y: 0.1, z: -26, yaw: -Math.PI * 0.25, team: 1 },
    { x: 0, y: 0.1, z: -16.5, yaw: 0, team: 1 },

    // Team 2 (South) & FFA Spawns
    { x: -7, y: 0.1, z: 26.8, yaw: Math.PI, team: 2 },
    { x: 7, y: 0.1, z: 26.8, yaw: Math.PI, team: 2 },
    { x: -26, y: 0.1, z: 26, yaw: Math.PI * 0.75, team: 2 },
    { x: 26, y: 0.1, z: 26, yaw: -Math.PI * 0.75, team: 2 },
    { x: 0, y: 0.1, z: 16.5, yaw: Math.PI, team: 2 },

    // Mid / Flank FFA Spawns
    { x: -26.5, y: 0.1, z: 0, yaw: Math.PI * 0.5, team: 0 },
    { x: 26.5, y: 0.1, z: 0, yaw: -Math.PI * 0.5, team: 0 },
  ],
};

const ORBITAL_FOUNDRY: MapDefinition = {
  id: 'orbital_foundry',
  name: 'ORBITAL FOUNDRY',
  subtitle: 'Industrial Reactor Bay · Multi-Tier Catwalks',
  size: 58,
  skyColor: '#0A0D16',
  fogColor: '#0C101C',
  fogDensity: 0.012,
  ambientSky: '#93C5FD',
  ambientGround: '#111827',
  keyLightColor: '#FDE68A',
  colliders: [
    box('of_floor', 0, -1, 0, 62, 1, 62, 'floor', '#141923'),
    box('of_wall_n', 0, 0, -29.5, 60, 8, 1, 'wall', '#19202D', '#F59E0B'),
    box('of_wall_s', 0, 0, 29.5, 60, 8, 1, 'wall', '#19202D', '#F59E0B'),
    box('of_wall_w', -29.5, 0, 0, 1, 8, 58, 'wall', '#19202D', '#F59E0B'),
    box('of_wall_e', 29.5, 0, 0, 1, 8, 58, 'wall', '#19202D', '#F59E0B'),

    // Central Elevated Reactor Deck (y=2.4)
    box('of_reactor_deck', 0, 2.0, 0, 14, 0.4, 14, 'platform', '#263042', '#F59E0B'),
    box('of_reactor_core', 0, 0, 0, 3.2, 6.0, 3.2, 'pillar', '#1A2230', '#00D2FF'),
    // Reactor corner cover blocks
    box('of_rc_nw', -4.5, 2.4, -4.5, 2.2, 1.15, 2.2, 'cover', '#334155', '#F59E0B'),
    box('of_rc_ne', 4.5, 2.4, -4.5, 2.2, 1.15, 2.2, 'cover', '#334155', '#F59E0B'),
    box('of_rc_sw', -4.5, 2.4, 4.5, 2.2, 1.15, 2.2, 'cover', '#334155', '#F59E0B'),
    box('of_rc_se', 4.5, 2.4, 4.5, 2.2, 1.15, 2.2, 'cover', '#334155', '#F59E0B'),

    // North & South Foundry Bays (indoor rooms)
    box('of_n_bay_l', -10, 0, -19, 10, 4.2, 1.2, 'building', '#1E2738'),
    box('of_n_bay_r', 10, 0, -19, 10, 4.2, 1.2, 'building', '#1E2738'),
    box('of_n_bay_c', 0, 0, -23, 8, 2.2, 1.8, 'cover', '#2A364D', '#00D2FF'),

    box('of_s_bay_l', -10, 0, 19, 10, 4.2, 1.2, 'building', '#1E2738'),
    box('of_s_bay_r', 10, 0, 19, 10, 4.2, 1.2, 'building', '#1E2738'),
    box('of_s_bay_c', 0, 0, 23, 8, 2.2, 1.8, 'cover', '#2A364D', '#F59E0B'),

    // East & West Sniper Catwalks (y=3.6)
    box('of_w_catwalk', -22, 3.2, 0, 6, 0.4, 30, 'platform', '#232C3D', '#00D2FF'),
    box('of_e_catwalk', 22, 3.2, 0, 6, 0.4, 30, 'platform', '#232C3D', '#00D2FF'),
    box('of_w_shield_1', -19.2, 3.6, -6, 0.4, 1.1, 4.5, 'cover', '#334155'),
    box('of_w_shield_2', -19.2, 3.6, 6, 0.4, 1.1, 4.5, 'cover', '#334155'),
    box('of_e_shield_1', 19.2, 3.6, -6, 0.4, 1.1, 4.5, 'cover', '#334155'),
    box('of_e_shield_2', 19.2, 3.6, 6, 0.4, 1.1, 4.5, 'cover', '#334155'),

    // Ground floor crates & pillars
    box('of_crate_1', -12, 0, -8, 2.8, 1.6, 2.8, 'cover', '#293548'),
    box('of_crate_2', 12, 0, -8, 2.8, 1.6, 2.8, 'cover', '#293548'),
    box('of_crate_3', -12, 0, 8, 2.8, 1.6, 2.8, 'cover', '#293548'),
    box('of_crate_4', 12, 0, 8, 2.8, 1.6, 2.8, 'cover', '#293548'),
  ],
  ramps: [
    // 4 Ramps onto Central Reactor Deck (y=0 to y=2.4)
    { id: 'of_ramp_n', x: 0, y: 0, z: -10.5, width: 4.5, height: 2.4, length: 7, axis: 'z', dir: 1 },
    { id: 'of_ramp_s', x: 0, y: 0, z: 10.5, width: 4.5, height: 2.4, length: 7, axis: 'z', dir: -1 },
    { id: 'of_ramp_w', x: -10.5, y: 0, z: 0, width: 4.5, height: 2.4, length: 7, axis: 'x', dir: 1 },
    { id: 'of_ramp_e', x: 10.5, y: 0, z: 0, width: 4.5, height: 2.4, length: 7, axis: 'x', dir: -1 },
    // Ramps up to W/E Catwalks (y=0 to y=3.6)
    { id: 'of_cat_nw', x: -22, y: 0, z: -19, width: 4.5, height: 3.6, length: 8, axis: 'z', dir: 1 },
    { id: 'of_cat_sw', x: -22, y: 0, z: 19, width: 4.5, height: 3.6, length: 8, axis: 'z', dir: -1 },
    { id: 'of_cat_ne', x: 22, y: 0, z: -19, width: 4.5, height: 3.6, length: 8, axis: 'z', dir: 1 },
    { id: 'of_cat_se', x: 22, y: 0, z: 19, width: 4.5, height: 3.6, length: 8, axis: 'z', dir: -1 },
  ],
  neonTrimStrips: [
    { x: 0, y: 2.45, z: 0, w: 14.1, h: 0.1, d: 14.1, color: '#F59E0B' },
    { x: -19, y: 3.65, z: 0, w: 0.12, h: 0.12, d: 30, color: '#00D2FF' },
    { x: 19, y: 3.65, z: 0, w: 0.12, h: 0.12, d: 30, color: '#00D2FF' },
  ],
  spawns: [
    { x: -8, y: 0.1, z: -26, yaw: 0, team: 1 },
    { x: 8, y: 0.1, z: -26, yaw: 0, team: 1 },
    { x: -25, y: 0.1, z: -25, yaw: Math.PI * 0.25, team: 1 },
    { x: 25, y: 0.1, z: -25, yaw: -Math.PI * 0.25, team: 1 },

    { x: -8, y: 0.1, z: 26, yaw: Math.PI, team: 2 },
    { x: 8, y: 0.1, z: 26, yaw: Math.PI, team: 2 },
    { x: -25, y: 0.1, z: 25, yaw: Math.PI * 0.75, team: 2 },
    { x: 25, y: 0.1, z: 25, yaw: -Math.PI * 0.75, team: 2 },

    { x: -15, y: 0.1, z: 0, yaw: Math.PI * 0.5, team: 0 },
    { x: 15, y: 0.1, z: 0, yaw: -Math.PI * 0.5, team: 0 },
  ],
};

export const MAPS: Record<MapId, MapDefinition> = {
  neon_district: NEON_DISTRICT,
  orbital_foundry: ORBITAL_FOUNDRY,
};
