// The people of Neon Bay: pedestrians strolling the sidewalks who scatter when shots
// ring out, foot cops who join the chase at higher wanted levels, and the armed Marina
// crew for the final mission. Every person is a small group of boxes with a procedural
// walk cycle (legs and arms swing with speed), so no animation files are needed.

import * as THREE from 'three';
import { ROAD_LINES } from './config.js';
import { clamp, wrapAngle, angleDelta } from './random.js';

const SHIRT_COLORS = [0xd84a4a, 0x4a8ad8, 0x4ad88a, 0xd8c34a, 0x9a5fd8, 0xe0e0e0, 0x2e2e38, 0xe07b2e];
const SKIN_COLORS = [0xe8b98a, 0xc98d5f, 0x8a5a34, 0xf0c8a0];

/** Build one low-poly person: torso, head, two legs, two arms. */
export function buildPersonMesh(shirt, skin, police = false) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: police ? 0x1c2f6e : shirt, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: police ? 0x14161d : 0x2a2d38, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  if (police) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshStandardMaterial({ color: 0x10131c }));
    cap.position.y = 1.8;
    group.add(cap);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), pantsMat);
  legL.geometry.translate(0, -0.4, 0);
  legL.position.set(-0.14, 0.8, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), pantsMat);
  legR.geometry.translate(0, -0.4, 0);
  legR.position.set(0.14, 0.8, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), shirtMat);
  armL.geometry.translate(0, -0.31, 0);
  armL.position.set(-0.34, 1.38, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), shirtMat);
  armR.geometry.translate(0, -0.31, 0);
  armR.position.set(0.34, 1.38, 0);
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

/** Swing the limbs for a walk cycle; phase advances with distance walked. */
export function animateWalk(mesh, phase, amount) {
  const swing = Math.sin(phase) * 0.55 * amount;
  mesh.legL.rotation.x = swing;
  mesh.legR.rotation.x = -swing;
  mesh.armL.rotation.x = -swing * 0.8;
  mesh.armR.rotation.x = swing * 0.8;
}

export function makePedestrian(random, x, z) {
  const mesh = buildPersonMesh(random.pick(SHIRT_COLORS), random.pick(SKIN_COLORS));
  mesh.group.position.set(x, 0, z);
  return {
    kind: 'ped',
    x,
    z,
    heading: random.angle(),
    speed: random.range(0.9, 1.6),
    walkPhase: random.range(0, Math.PI * 2),
    mesh,
    // A sidewalk stroll: pick a road line and walk along its kerb.
    road: random.pick(ROAD_LINES),
    alongRoad: random.chance(0.5) ? 'x' : 'z',
    side: random.chance(0.5) ? 1 : -1,
    fleeing: 0,
    fleeX: 0,
    fleeZ: 0,
    dead: false,
  };
}

export function makeCop(random, x, z) {
  const mesh = buildPersonMesh(0x1c2f6e, random.pick(SKIN_COLORS), true);
  mesh.group.position.set(x, 0, z);
  return {
    kind: 'cop',
    x,
    z,
    heading: 0,
    speed: 3.4,
    walkPhase: 0,
    mesh,
    touchTime: 0,
    dead: false,
  };
}

export function makeGuard(random, x, z) {
  const mesh = buildPersonMesh(0x3a1c1c, random.pick(SKIN_COLORS));
  mesh.group.position.set(x, 0, z);
  return {
    kind: 'guard',
    x,
    z,
    heading: 0,
    speed: 2.2,
    walkPhase: 0,
    mesh,
    health: 100,
    shootCooldown: random.range(0.5, 1.5),
    dead: false,
  };
}

/** One step for a pedestrian: stroll the kerb, or sprint away from a gunshot. */
export function stepPedestrian(ped, dt, colliders) {
  if (ped.dead) return;
  if (ped.fleeing > 0) {
    ped.fleeing -= dt;
    const dx = ped.x - ped.fleeX;
    const dz = ped.z - ped.fleeZ;
    const d = Math.hypot(dx, dz) || 1;
    ped.heading = Math.atan2(dx / d, dz / d);
    ped.speed = 5.2;
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
  } else {
    // Stroll along the kerb of the assigned road: the heading is fixed by the axis and
    // the side, and the cross-axis position is pinned to the kerb line.
    ped.speed = 1.3;
    if (ped.alongRoad === 'x') {
      ped.heading = ped.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z = ped.road + 7.6;
      if (ped.x > 210) ped.x = -210;
      if (ped.x < -210) ped.x = 210;
    } else {
      ped.heading = ped.side > 0 ? 0 : Math.PI;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      ped.x = ped.road + 7.6;
      if (ped.z > 210) ped.z = -210;
      if (ped.z < -210) ped.z = 210;
    }
  }
  ped.x = clamp(ped.x, -228, 228);
  ped.z = clamp(ped.z, -228, 228);
  ped.walkPhase += ped.speed * dt * 2.4;
  animateWalk(ped.mesh, ped.walkPhase, clamp(ped.speed / 5, 0.3, 1));
  ped.mesh.group.position.set(ped.x, 0, ped.z);
  ped.mesh.group.rotation.y = ped.heading;
}

/** A foot cop runs at the player and, on contact, starts the bust timer. */
export function stepCop(cop, dt, playerX, playerZ) {
  if (cop.dead) return;
  const dx = playerX - cop.x;
  const dz = playerZ - cop.z;
  const d = Math.hypot(dx, dz) || 1;
  cop.heading = Math.atan2(dx / d, dz / d);
  cop.x += Math.sin(cop.heading) * cop.speed * dt;
  cop.z += Math.cos(cop.heading) * cop.speed * dt;
  cop.walkPhase += cop.speed * dt * 2.6;
  animateWalk(cop.mesh, cop.walkPhase, 1);
  cop.mesh.group.position.set(cop.x, 0, cop.z);
  cop.mesh.group.rotation.y = cop.heading;
  cop.touchTime = d < 1.4 ? cop.touchTime + dt : 0;
}

/** A guard holds his ground and fires at the player when in range and line of sight. */
export function stepGuard(guard, dt, playerX, playerZ) {
  if (guard.dead) return;
  const dx = playerX - guard.x;
  const dz = playerZ - guard.z;
  const d = Math.hypot(dx, dz) || 1;
  guard.heading = Math.atan2(dx / d, dz / d);
  guard.shootCooldown -= dt;
  if (d > 26) {
    guard.x += Math.sin(guard.heading) * guard.speed * dt;
    guard.z += Math.cos(guard.heading) * guard.speed * dt;
    guard.walkPhase += guard.speed * dt * 2.4;
    animateWalk(guard.mesh, guard.walkPhase, 0.8);
  } else {
    animateWalk(guard.mesh, guard.walkPhase, 0.1);
  }
  guard.mesh.group.position.set(guard.x, 0, guard.z);
  guard.mesh.group.rotation.y = guard.heading;
}

/** Scatter every pedestrian near a point: they run away from it. */
export function scarePedestrians(peds, x, z, radius) {
  for (const ped of peds) {
    if (ped.dead) continue;
    const dx = ped.x - x;
    const dz = ped.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      ped.fleeing = 3;
      ped.fleeX = x;
      ped.fleeZ = z;
    }
  }
}
