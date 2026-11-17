// Cars: a detailed body built from three.js primitives — a chassis skirt, a painted
// body with hood and trunk lids, a glass cabin with pillars and a roof, chrome grille
// and bumpers, mirrors, door handles, plates and an exhaust — with wheels that carry
// hubcaps and spokes so the spin reads. Two kinds of motion share the same body: the
// player's arcade driving (accel, brake, steering that fades with speed, handbrake
// drift) and the traffic AI, which follows the rectangular loops the world exports and
// keeps its distance from the car ahead. Collisions against building boxes are circle
// tests, cheap enough to run for every car every step.

import * as THREE from 'three';
import { CAR } from './config.js';
import { clamp, wrapAngle, angleDelta } from './random.js';

const CAR_COLORS = [0xc23b3b, 0x3b7ac2, 0xd8c53a, 0x3ac27a, 0x8a5fc2, 0xd8d8d8, 0x22242c, 0xe07b2e, 0x2ec2c2];

function std(color, roughness = 0.45, metalness = 0.4) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** One wheel: a tyre with a hubcap and five spokes parented to it, so the spin reads. */
function buildWheel(wheelGeo, wheelMat, hubMat, spokeMat, side, front) {
  const wheel = new THREE.Mesh(wheelGeo, wheelMat);
  wheel.position.set(0.95 * side, 0.36, 1.45 * front);
  wheel.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), hubMat);
  hub.geometry.rotateZ(Math.PI / 2);
  wheel.add(hub);
  for (let s = 0; s < 5; s += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.05), spokeMat);
    const a = (s / 5) * Math.PI * 2;
    spoke.position.set(0.15 * side, Math.sin(a) * 0.11, Math.cos(a) * 0.11);
    spoke.rotation.x = -a;
    wheel.add(spoke);
  }
  return wheel;
}

/** Build one car mesh. `police` adds the black-and-white paint and the light bar. */
export function buildCarMesh(color, police = false) {
  const group = new THREE.Group();
  const paint = std(police ? 0xe8e8e8 : color, 0.38, 0.55);
  const darkTrim = std(0x14161d, 0.5, 0.5);
  const chrome = std(0xd8dde6, 0.18, 0.95);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1622, roughness: 0.08, metalness: 0.9 });

  // Chassis skirt and the main body.
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.22, 4.3), darkTrim);
  skirt.position.y = 0.32;
  group.add(skirt);
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.5, CAR.length), paint);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);
  // Hood and trunk lids, tilted a touch so the silhouette is not a slab.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 1.15), paint);
  hood.position.set(0, 0.88, 1.5);
  hood.rotation.x = 0.06;
  group.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.9), paint);
  trunk.position.set(0, 0.88, -1.6);
  trunk.rotation.x = -0.05;
  group.add(trunk);

  // The cabin: a glasshouse with pillars and a painted roof.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.52, 2.1), glassMat);
  cabin.position.set(0, 1.12, -0.3);
  cabin.castShadow = true;
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 1.9), paint);
  roof.position.set(0, 1.4, -0.3);
  roof.castShadow = true;
  group.add(roof);
  for (const [px, pz] of [[-0.8, 0.68], [0.8, 0.68], [-0.8, -1.28], [0.8, -1.28]]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), paint);
    pillar.position.set(px, 1.12, pz);
    group.add(pillar);
  }

  // Bumpers, grille with chrome slats, and plates.
  for (const bz of [2.2, -2.2]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 0.25), darkTrim);
    bumper.position.set(0, 0.38, bz);
    group.add(bumper);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }),
    );
    plate.position.set(0, 0.42, bz + (bz > 0 ? 0.14 : -0.14));
    group.add(plate);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.06), darkTrim);
  grille.position.set(0, 0.62, 2.21);
  group.add(grille);
  for (const gy of [0.56, 0.63, 0.7]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.02), chrome);
    slat.position.set(0, gy, 2.25);
    group.add(slat);
  }
  // Side mirrors, door handles and the exhaust pipe.
  for (const mx of [-1.04, 1.04]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.18), darkTrim);
    stalk.position.set(mx, 1.05, 0.55);
    group.add(stalk);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.16), paint);
    mirror.position.set(mx + 0.03 * Math.sign(mx), 1.08, 0.6);
    group.add(mirror);
  }
  for (const hx of [-1.01, 1.01]) {
    for (const hz of [0.15, -0.75]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), chrome);
      handle.position.set(hx, 0.78, hz);
      group.add(handle);
    }
  }
  const exhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8),
    std(0x3a3d44, 0.35, 0.85),
  );
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.6, 0.3, -2.28);
  group.add(exhaust);

  // Wheels with hubcaps and spokes.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = std(0x0c0d10, 0.9, 0);
  const hubMat = std(0xb9bec8, 0.3, 0.8);
  const spokeMat = std(0x6a6e78, 0.4, 0.7);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = buildWheel(wheelGeo, wheelMat, hubMat, spokeMat, Math.sign(wx), Math.sign(wz));
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights: a chrome surround with a warm lens; taillights: a red bar with
  // white reverse lights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false });
  for (const hx of [-0.68, 0.68]) {
    const surround = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.06), chrome);
    surround.position.set(hx, 0.66, 2.21);
    group.add(surround);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.04), headMat);
    head.position.set(hx, 0.66, 2.25);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22, toneMapped: false });
  for (const tx of [-0.55, 0.55]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), tailMat);
    tail.position.set(tx, 0.66, -2.21);
    group.add(tail);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.04), tailMat);
  tailBar.position.set(0, 0.66, -2.22);
  group.add(tailBar);
  const reverseMat = new THREE.MeshBasicMaterial({ color: 0xf2f5ff, toneMapped: false });
  for (const rx of [-0.25, 0.25]) {
    const rev = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), reverseMat);
    rev.position.set(rx, 0.5, -2.22);
    group.add(rev);
  }

  let lightBar = null;
  let barLeft = null;
  let barRight = null;
  if (police) {
    // Black door band, a push bar up front, and the light bar on the roof.
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(CAR.width + 0.02, 0.4, CAR.length * 0.5),
      std(0x14161d, 0.4, 0.5),
    );
    doors.position.y = 0.6;
    group.add(doors);
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.1), darkTrim);
    pushBar.position.set(0, 0.55, 2.32);
    group.add(pushBar);
    for (const px of [-0.7, 0.7]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), darkTrim);
      upright.position.set(px, 0.55, 2.32);
      group.add(upright);
    }
    lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), std(0x222222, 0.5, 0.3));
    lightBar.position.set(0, 1.44, -0.3);
    group.add(lightBar);
    barLeft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    barLeft.position.set(-0.28, 1.44, -0.3);
    group.add(barLeft);
    barRight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0x2244ff, toneMapped: false }));
    barRight.position.set(0.28, 1.44, -0.3);
    group.add(barRight);
  }
  return { group, wheels, barLeft, barRight };
}

/** One car in the simulation, player-driven or AI. Position is the centre, heading in radians. */
export function makeCar(kind, x, z, heading, color, police = false) {
  const mesh = buildCarMesh(color, police);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  return {
    kind, // 'player' | 'traffic' | 'parked' | 'police'
    police,
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    mesh,
    // Traffic AI state:
    loop: null,
    loopIndex: 0,
    lane: 2.4,
    cruise: 10,
    // Police chase state:
    ramCooldown: 0,
    sirenPhase: 0,
    taken: false, // a parked/traffic car the player has stolen
    dead: false,
  };
}

/** Push a circle out of every building box it overlaps; returns true on a hit. */
export function collideBuildings(car, colliders, radius) {
  let hit = false;
  for (const box of colliders) {
    const cx = clamp(car.x, box.minX, box.maxX);
    const cz = clamp(car.z, box.minZ, box.maxZ);
    const dx = car.x - cx;
    const dz = car.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      car.x = cx + (dx / d) * radius;
      car.z = cz + (dz / d) * radius;
      hit = true;
    } else if (d2 <= 0.0001) {
      car.x = box.maxX + radius;
      hit = true;
    }
  }
  return hit;
}

/** Keep a car inside the drivable city, bouncing softly off the edge. */
export function clampToCity(car, limit) {
  if (car.x < -limit) { car.x = -limit; car.heading = Math.PI - car.heading; }
  if (car.x > limit) { car.x = limit; car.heading = Math.PI - car.heading; }
  if (car.z < -limit) { car.z = -limit; car.heading = -car.heading; }
  if (car.z > limit) { car.z = limit; car.heading = -car.heading; }
  car.heading = wrapAngle(car.heading);
}

/**
 * One fixed step of arcade driving. `drive` is { throttle: -1..1, steer: -1..1,
 * handbrake: bool }. Speed is signed (reverse is negative); the car yaws toward the
 * steering angle, more at low speed, less at full speed, and the handbrake cuts grip so
 * the tail steps out.
 */
export function stepDriving(car, dt, drive, colliders) {
  if (drive.throttle > 0) car.speed += CAR.accel * drive.throttle * dt;
  else if (drive.throttle < 0) {
    car.speed += (car.speed > 0.5 ? -CAR.brake : CAR.reverseAccel * drive.throttle) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const steerAuthority = clamp(Math.abs(car.speed) / 8, 0.25, 1);
  const targetSteer = drive.steer * CAR.steer * steerAuthority;
  car.steer += (targetSteer - car.steer) * Math.min(1, 8 * dt);
  // Arcade yaw: the car turns faster as it gathers speed, then the rate caps out so
  // high-speed corners stay drivable; reversing flips the turn. The handbrake cuts grip,
  // so the tail steps out and the car rotates harder.
  const direction = car.speed >= 0 ? 1 : -1;
  const yawRate = car.steer * clamp(Math.abs(car.speed) / 6, 0, 1.6) * direction * 1.35 * (drive.handbrake ? 1.6 : 1);
  car.heading = wrapAngle(car.heading + yawRate * dt);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  car.x = nx;
  car.z = nz;
  if (collideBuildings(car, colliders, 1.7)) car.speed *= 0.45;
  clampToCity(car, 232);
  car.mesh.group.position.set(car.x, 0, car.z);
  car.mesh.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2.8;
  for (const wheel of car.mesh.wheels) wheel.rotation.x += spin;
}

/** Steer a traffic car along its loop, slowing for the car ahead on the same stretch. */
export function stepTraffic(car, dt, colliders, others) {
  if (!car.loop) return;
  const target = car.loop[car.loopIndex];
  // The lane offset sits on the right-hand side of the direction of travel.
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 4) {
    car.loopIndex = (car.loopIndex + 1) % car.loop.length;
    return;
  }
  const wantHeading = Math.atan2(dx, dz);
  const turn = clamp(angleDelta(car.heading, wantHeading), -0.5, 0.5);
  car.heading = wrapAngle(car.heading + turn * Math.min(1, 3.2 * dt));
  // Slow down for anything stopped ahead within a short look-ahead cone.
  let ahead = Infinity;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of others) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const forward = ox * fx + oz * fz;
    const side = Math.abs(ox * fz - oz * fx);
    if (forward > 0 && forward < 14 && side < 3.2) ahead = Math.min(ahead, forward);
  }
  const wantSpeed = ahead < 14 ? Math.max(0, (ahead - 5) * 0.9) : car.cruise;
  car.speed += clamp(wantSpeed - car.speed, -14 * dt, 8 * dt);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  if (collideBuildings(car, colliders, 1.7)) car.speed *= 0.5;
  car.mesh.group.position.set(car.x, 0, car.z);
  car.mesh.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2.8;
  for (const wheel of car.mesh.wheels) wheel.rotation.x += spin;
}

/** Flash a police light bar red/blue, alternating every quarter second. */
export function updatePoliceLights(car, time) {
  if (!car.mesh.barLeft || !car.mesh.barRight) return;
  const phase = Math.floor(time * 4) % 2 === 0;
  car.mesh.barLeft.material.color.setHex(phase ? 0xff2020 : 0x330000);
  car.mesh.barRight.material.color.setHex(phase ? 0x000033 : 0x2244ff);
}
