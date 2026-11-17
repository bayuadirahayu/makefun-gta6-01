// Every tuning number, district and colour for NEON BAY lives here, so the rest of the
// game reads plain names instead of magic numbers. The city is a road grid: roads run every
// PITCH units, ROAD wide, with one building block between neighbouring roads. One unit is
// roughly one metre; the whole drivable city is about 470 units across.

export const STEP = 1 / 60;
export const CITY = {
  pitch: 52,
  roadWidth: 12,
  roads: 9, // road lines at index -4 .. 4, so x and z run from -208 to 208
  blockSize: 40,
  groundSize: 760,
  waterWest: -252,
  beachSouth: 236,
};

/** Road line positions, in world units, for both axes. */
export const ROAD_LINES = [-208, -156, -104, -52, 0, 52, 104, 156, 208];

/** The five districts, each with a centre, a radius and the mood its buildings wear. */
export const DISTRICTS = [
  { name: 'Marina', centre: [-208, 0], radius: 90, hue: 0.52, tall: false },
  { name: 'Downtown', centre: [0, 0], radius: 110, hue: 0.62, tall: true },
  { name: 'Old Town', centre: [0, -156], radius: 80, hue: 0.08, tall: false },
  { name: 'Beachfront', centre: [0, 208], radius: 90, hue: 0.09, tall: false },
  { name: 'Airport Rd', centre: [208, 0], radius: 80, hue: 0.35, tall: false },
];

export const PLAYER = {
  walkSpeed: 6.5,
  runSpeed: 10.5,
  radius: 0.55,
  height: 1.8,
  health: 100,
  punchDamage: 12,
  punchRange: 1.6,
  punchCooldown: 0.45,
};

export const PISTOL = {
  damage: 34,
  magazine: 12,
  reserveStart: 60,
  reloadSeconds: 1.4,
  range: 90,
  fireCooldown: 0.22,
};

export const CAR = {
  accel: 16,
  brake: 30,
  reverseAccel: 9,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 0.55,
  grip: 6.5,
  handbrakeGrip: 2.2,
  length: 4.4,
  width: 2.0,
  enterRange: 3.2,
};

export const TRAFFIC_COUNT = 14;
export const PARKED_COUNT = 8;
export const PED_COUNT = 20;

export const WANTED = {
  max: 5,
  decayQuietSeconds: 12,
  decayStepSeconds: 8,
  sightRange: 55,
  bustTouchSeconds: 2.0,
};

export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    brief: 'Steal a car and bring it to the Marina drop-off.',
    reward: 500,
  },
  {
    id: 'courier-run',
    name: 'Courier Run',
    brief: 'Hit every checkpoint before the timer runs out.',
    reward: 800,
    timeLimit: 150,
    checkpoints: 5,
  },
  {
    id: 'heat',
    name: 'Heat',
    brief: 'Get the heat to 3 stars, then shake it off completely.',
    reward: 1000,
  },
  {
    id: 'marina-job',
    name: 'The Marina Job',
    brief: 'Clear the Marina crew, then escape to Airport Rd.',
    reward: 2500,
    guards: 4,
  },
];

export const PALETTE = {
  duskSky: '#2a1e4f',
  duskHorizon: '#ff7a3c',
  fog: '#3a2a55',
  asphalt: '#1c1e26',
  roadLine: '#c9c46a',
  sidewalk: '#3a3d47',
  sand: '#c9a86a',
  water: '#0b3d5c',
  neonPink: '#ff2e88',
  neonCyan: '#22e6ff',
  neonAmber: '#ffb02e',
  neonLime: '#9dff2e',
  hudText: '#f2f5ff',
  hudMuted: '#9aa3c0',
  hudPanel: 'rgba(10, 12, 24, 0.72)',
  star: '#ffd23e',
  danger: '#ff3b30',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const SAVE_KEY = 'neon-bay.save.v1';
