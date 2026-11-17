// Cars: a low-poly body built from boxes, cylinders for wheels, emissive head and tail
// lights, and one spotlight on the player's car. Two kinds of motion share the same body:
// the player's arcade driving (accel, brake, steering that fades with speed, handbrake
// drift) and the traffic AI, which follows the rectangular loops the world exports and
// keeps its distance from the car ahead. Collisions against building boxes are circle
// tests, cheap enough to run for every car every step.

import * as THREE from 'three';
import { CAR } from './config.js';
import { clamp, wrapAngle, angleDelta } from './random.js';

const CAR_COLORS = [0xc23b3b, 0x3b7ac2, 0xd8c53a, 0x3ac27a, 0x8a5fc2, 0xd8d8d8, 0x22242c, 0xe07b2e, 0x2ec2c2];

/** Build one car mesh. `police` adds the black-and-white paint and the light bar. */
export function buildCarMesh(color, police = false) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: police ? 0xe8e8e8 : color,
    roughness: 0.45,
    metalness: 0.4,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.62, CAR.length), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(CAR.width - 0.3, 0.55, CAR.length * 0.48),
    new THREE.MeshStandardMaterial({ color: 0x10131c, roughness: 0.15, metalness: 0.8 }),
  );
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (police) {
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(CAR.width + 0.02, 0.4, CAR.length * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.4, metalness: 0.5 }),
    );
    doors.position.y = 0.55;
    group.add(doors);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false });
  for (const hx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMat);
    head.position.set(hx, 0.62, CAR.length / 2 + 0.02);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22, toneMapped: false });
  for (const tx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), tailMat);
    tail.position.set(tx, 0.62, -CAR.length / 2 - 0.02);
    group.add(tail);
  }
  let lightBar = null;
  let barLeft = null;
  let barRight = null;
  if (police) {
    lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    lightBar.position.set(0, 1.44, -0.25);
    group.add(lightBar);
    barLeft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
    barLeft.position.set(-0.28, 1.44, -0.25);
    group.add(barLeft);
    barRight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0x2244ff, toneMapped: false }));
    barRight.position.set(0.28, 1.44, -0.25);
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
