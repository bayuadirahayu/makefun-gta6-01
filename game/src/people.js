// The people of Neon Bay: pedestrians strolling the sidewalks who scatter when shots
// ring out, foot cops who join the chase at higher wanted levels, and the armed Marina
// crew for the final mission. Every person is built procedurally from three.js geometry:
// a proportional body with a pelvis, a tapered chest, a neck and a real head (hair, nose,
// eyes), articulated arms and legs — thigh and shin joined at a knee, upper arm and
// forearm joined at an elbow — so the walk cycle bends knees and elbows instead of
// swinging stiff boards. Shoes, caps, beanies, police badges and a guard's pistol are
// small meshes parented to the limb that carries them, so they move with the walk.

import * as THREE from 'three';
import { ROAD_LINES } from './config.js';
import { clamp, wrapAngle, angleDelta } from './random.js';

const SHIRT_COLORS = [0xd84a4a, 0x4a8ad8, 0x4ad88a, 0xd8c34a, 0x9a5fd8, 0xe0e0e0, 0x2e2e38, 0xe07b2e];
const SKIN_COLORS = [0xe8b98a, 0xc98d5f, 0x8a5a34, 0xf0c8a0];
const HAIR_COLORS = [0x1a1210, 0x3a2418, 0x6b4a2a, 0xb9b9b9, 0x0e0e0e, 0x8a2a1a];
const PANTS_COLORS = [0x2a2d38, 0x3a3f4a, 0x4a3a2a, 0x22242c, 0x5a6b7a];

function std(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** One leg: thigh pivoting at the hip, shin pivoting at the knee, shoe on the foot. */
function buildLeg(pantsMat, shoeMat, side) {
  const hip = new THREE.Group();
  hip.position.set(0.13 * side, 0.98, 0);
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.48, 0.21), pantsMat);
  thigh.geometry.translate(0, -0.24, 0);
  thigh.castShadow = true;
  hip.add(thigh);
  const knee = new THREE.Group();
  knee.position.set(0, -0.48, 0);
  hip.add(knee);
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.44, 0.18), pantsMat);
  shin.geometry.translate(0, -0.22, 0);
  shin.castShadow = true;
  knee.add(shin);
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.09, 0.3), shoeMat);
  shoe.position.set(0, -0.44, 0.05);
  shoe.castShadow = true;
  knee.add(shoe);
  return { hip, knee };
}

/** One arm: upper arm pivoting at the shoulder, forearm at the elbow, hand at the end. */
function buildArm(shirtMat, skinMat, side) {
  const shoulder = new THREE.Group();
  shoulder.position.set(0.33 * side, 1.48, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.15), shirtMat);
  upper.geometry.translate(0, -0.16, 0);
  upper.castShadow = true;
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.set(0, -0.32, 0);
  shoulder.add(elbow);
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.13), shirtMat);
  forearm.geometry.translate(0, -0.15, 0);
  forearm.castShadow = true;
  elbow.add(forearm);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.06), skinMat);
  hand.position.set(0, -0.33, 0);
  elbow.add(hand);
  return { shoulder, elbow, hand };
}

/**
 * Build one person. Returns the outer group plus the pivots the walk cycle drives:
 * legL/legR are the hip groups, kneeL/kneeR the knee groups, armL/armR the shoulder
 * groups, elbowL/elbowR the elbow groups, rig the inner group that bobs with the step.
 * `variant` is 'ped' | 'cop' | 'guard' | 'cap' | 'hoodie'; police/cop also takes the
 * `police` flag for the navy uniform. The player is built with the default variant.
 */
export function buildPersonMesh(shirt, skin, police = false, variant = 'ped') {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const shirtMat = std(police ? 0x1c2f6e : shirt, 0.85);
  const skinMat = std(skin, 0.7);
  // Pants and hair are picked deterministically from the shirt/skin colours, never from
  // Math.random(): the same seed must build the same person every load.
  const pantsMat = std(police ? 0x14161d : PANTS_COLORS[(shirt ^ 0x5f3a) % PANTS_COLORS.length], 0.9);
  const shoeMat = std(0x1c1a18, 0.6);
  const hairMat = std(HAIR_COLORS[(skin ^ 0x2b7d) % HAIR_COLORS.length], 0.95);

  // Legs with knees.
  const legL = buildLeg(pantsMat, shoeMat, -1);
  const legR = buildLeg(pantsMat, shoeMat, 1);
  rig.add(legL.hip, legR.hip);

  // Pelvis, belt, chest and shoulders: a torso that reads as a torso, not a slab.
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.28), pantsMat);
  pelvis.position.y = 1.04;
  pelvis.castShadow = true;
  rig.add(pelvis);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.3), std(0x14100c, 0.7));
  belt.position.y = 1.14;
  rig.add(belt);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.3), shirtMat);
  chest.position.y = 1.34;
  chest.castShadow = true;
  rig.add(chest);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.32), shirtMat);
  shoulders.position.y = 1.52;
  shoulders.castShadow = true;
  rig.add(shoulders);
  if (variant === 'guard') {
    // A dark vest over the shirt: the Marina crew reads as armed at a glance.
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.34), std(0x2e1a1a, 0.9));
    vest.position.y = 1.34;
    rig.add(vest);
  }
  if (variant === 'hoodie') {
    // A hood bump behind the neck and a kangaroo pocket on the belly.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.12), shirtMat);
    hood.position.set(0, 1.56, -0.18);
    rig.add(hood);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.04), std(0x22242c, 0.9));
    pocket.position.set(0, 1.18, 0.16);
    rig.add(pocket);
  }
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.24), shirtMat);
  collar.position.y = 1.58;
  rig.add(collar);

  // Neck and head: a rounded head with hair, a nose and eyes.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), skinMat);
  neck.position.y = 1.6;
  rig.add(neck);
  const head = new THREE.Group();
  head.position.y = 1.72;
  rig.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skinMat);
  skull.scale.set(1, 1.15, 1.05);
  skull.castShadow = true;
  head.add(skull);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.06), skinMat);
  nose.position.set(0, -0.02, 0.17);
  head.add(nose);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14100c });
  for (const ex of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.02), eyeMat);
    eye.position.set(ex, 0.03, 0.155);
    head.add(eye);
  }
  if (police) {
    // Peaked cap with a brim, plus a badge on the chest.
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 12), std(0x10131c, 0.6));
    capTop.position.y = 0.16;
    head.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.14), std(0x0c0e14, 0.5));
    brim.position.set(0, 0.13, 0.18);
    head.add(brim);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    badge.position.set(0.14, 1.4, 0.16);
    rig.add(badge);
  } else if (variant === 'guard') {
    // A dark beanie pulled low.
    const beanie = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      std(0x1c1a18, 0.95),
    );
    beanie.position.y = 0.04;
    beanie.scale.set(1, 0.85, 1);
    head.add(beanie);
  } else if (variant === 'cap') {
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12), std(0xd84a4a, 0.8));
    capTop.position.y = 0.15;
    head.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.13), std(0xd84a4a, 0.8));
    brim.position.set(0, 0.12, 0.17);
    head.add(brim);
  } else {
    // Hair: a cap of hair over the top and back of the skull.
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat,
    );
    hair.position.set(0, 0.03, -0.015);
    hair.scale.set(1, 0.9, 1);
    head.add(hair);
  }

  // Arms with elbows.
  const armL = buildArm(shirtMat, skinMat, -1);
  const armR = buildArm(shirtMat, skinMat, 1);
  rig.add(armL.shoulder, armR.shoulder);
  if (variant === 'guard') {
    // A pistol held in the right hand.
    const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.18), std(0x0c0d10, 0.5, 0.6));
    pistol.position.set(0, -0.36, 0.06);
    armR.elbow.add(pistol);
  }

  return {
    group,
    rig,
    head,
    legL: legL.hip,
    legR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    armL: armL.shoulder,
    armR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
  };
}

/**
 * Swing the limbs for a walk cycle; phase advances with distance walked, amount is 0
 * at a standstill and 1 at a run. Hips swing, knees bend as the leg lifts forward,
 * arms counter-swing with a slight elbow bend, and the rig bobs and leans a touch.
 */
export function animateWalk(mesh, phase, amount) {
  const swing = Math.sin(phase) * 0.5 * amount;
  mesh.legL.rotation.x = swing;
  mesh.legR.rotation.x = -swing;
  mesh.kneeL.rotation.x = Math.max(0, Math.sin(phase + 0.4)) * 0.75 * amount;
  mesh.kneeR.rotation.x = Math.max(0, Math.sin(phase + Math.PI + 0.4)) * 0.75 * amount;
  mesh.armL.rotation.x = -swing * 0.85;
  mesh.armR.rotation.x = swing * 0.85;
  mesh.elbowL.rotation.x = -0.18 - 0.22 * amount;
  mesh.elbowR.rotation.x = -0.18 - 0.22 * amount;
  mesh.rig.position.y = Math.abs(Math.cos(phase)) * 0.035 * amount;
  mesh.rig.rotation.x = 0.05 * amount;
}

function pickVariant(random) {
  const roll = random.range(0, 1);
  if (roll < 0.22) return 'cap';
  if (roll < 0.42) return 'hoodie';
  return 'ped';
}

export function makePedestrian(random, x, z) {
  const variant = pickVariant(random);
  const mesh = buildPersonMesh(random.pick(SHIRT_COLORS), random.pick(SKIN_COLORS), false, variant);
  mesh.group.position.set(x, 0, z);
  mesh.group.scale.setScalar(random.range(0.94, 1.06));
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
  const mesh = buildPersonMesh(0x1c2f6e, random.pick(SKIN_COLORS), true, 'cop');
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
  const mesh = buildPersonMesh(0x3a1c1c, random.pick(SKIN_COLORS), false, 'guard');
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
