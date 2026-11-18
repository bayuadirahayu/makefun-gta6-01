// The screenshot scenes behind ?shot=cover|street|chase|mission. Each one plays the real
// rules forward from a fresh seeded world — the player drives or walks with a simple
// autopilot, traffic and pedestrians live, the police chase for real — then parks a fixed
// cinematic camera. The same seed always gives the same frame, because every step is the
// same fixed-step simulation the game itself runs.

import * as THREE from 'three';
import { STEP, CAR } from './config.js';
import { clamp, angleDelta } from './random.js';
import { makeCar, stepDriving, stepTraffic, updatePoliceLights } from './vehicles.js';
import { stepPedestrian } from './people.js';
import { stepPlayer } from './player.js';
import { addCrime } from './wanted.js';
import { startMission } from './missions.js';
import { createBeacon } from './beacon.js';

/** Traffic, pedestrians and neon for one fixed step, without the player. */
function ambient(game, world, dt) {
  for (const car of game.traffic) stepTraffic(car, dt, world.colliders, game.cars);
  for (const ped of game.peds) stepPedestrian(ped, dt, world.colliders);
  world.update(game.time);
}

/** Arcade autopilot: steer a car toward a point, easing off the gas for sharp turns so
 * a 90-degree corner does not arc wide into the buildings. `speedCap` bounds the
 * speed the autopilot holds: it brakes above the cap and never accelerates past it,
 * because stepDriving clamps to the config top speed and ignores any per-car cap. */
function driveToward(car, tx, tz, dt, colliders, speedCap = CAR.maxSpeed) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  const turn = angleDelta(car.heading, want);
  const steer = clamp(turn * 1.8, -1, 1);
  let throttle = clamp(1.2 - Math.abs(turn), 0.35, 1);
  if (car.speed > speedCap + 1) throttle = -0.6;
  else if (car.speed > speedCap - 1) throttle = 0;
  else throttle = Math.min(throttle, 0.6);
  stepDriving(car, dt, { throttle, steer, handbrake: false }, colliders);
}

/**
 * Drive a car along road waypoints (a Manhattan route through the grid), advancing to
 * the next waypoint when close. Straight-line autopilots cut across blocks and wedge
 * the car against towers; the route keeps it on the roads.
 */
function driveRoute(car, waypoints, index, dt, colliders) {
  const target = waypoints[Math.min(index, waypoints.length - 1)];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  // Crawl through corners: cap the speed while approaching a turn waypoint, so the
  // car arrives at the corner slow enough that its turn radius stays inside the
  // road instead of arcing wide into the corner tower.
  const speedCap = dist < 45 ? 12 : CAR.maxSpeed;
  driveToward(car, target.x, target.z, dt, colliders, speedCap);
  if (dist < 7) return Math.min(index + 1, waypoints.length - 1);
  return index;
}

/** Put the player in a car for a shot (headlights on, player mesh hidden). */
function putPlayerInCar(game, renderer, car) {
  game.playerCar = car;
  car.taken = true;
  const trafficIndex = game.traffic.indexOf(car);
  if (trafficIndex !== -1) game.traffic.splice(trafficIndex, 1);
  const parkedIndex = game.parked.indexOf(car);
  if (parkedIndex !== -1) game.parked.splice(parkedIndex, 1);
  renderer.scene.remove(game.player.mesh.group);
  // Headlights: a modest pool of light on the road ahead. A strong spotlight blows
  // out to white under the bloom pass and hides the car behind it in screenshots.
  const light = new THREE.SpotLight(0xffeebb, 30, 46, 0.55, 0.45, 1.4);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 14);
  light.position.set(0, 1, 2.2);
  car.mesh.group.add(light);
  car.mesh.group.add(target);
  light.target = target;
  game.headlight = light;
  game.headlightTarget = target;
}

function spawnChasePolice(game, renderer, x, z) {
  const car = makeCar('police', x, z, 0, 0xffffff, true);
  car.cruise = 20;
  game.policeCars.push(car);
  game.cars.push(car);
  renderer.scene.add(car.mesh.group);
  return car;
}

function fixedCamera(renderer, px, pz, heading, back, side, height, ahead) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = fz;
  const rz = -fx;
  renderer.setFixed({
    position: new THREE.Vector3(px - fx * back + rx * side, height, pz - fz * back + rz * side),
    look: new THREE.Vector3(px + fx * ahead, 2.4, pz + fz * ahead),
  });
}

/**
 * Set `game` to the named scene and return the beacon (already placed) for the shot.
 * Unknown names stage the cover.
 */
export function stageShot(name, game, world, renderer) {
  const beacon = createBeacon();
  renderer.scene.add(beacon.group);
  game.screen = 'play';
  game.time = 12;
  game.clockMinutes = 18 * 60 + 40;
  game.money = 1250;
  renderer.setPixelRatio(1);

  if (name === 'street') {
    // On foot at a Downtown intersection, pedestrians on the kerb, traffic passing.
    game.player.x = 4;
    game.player.z = 62;
    game.player.heading = 0;
    game.player.mesh.group.position.set(4, 0, 62);
    // Bring a few pedestrians onto the kerb beside the player, and a car down the
    // avenue on a straight run so it passes the camera during the staging.
    const nearPeds = game.peds.slice(0, 4);
    const spots = [18, 28, 38, 48];
    nearPeds.forEach((ped, i) => {
      ped.x = 7.6;
      ped.z = spots[i];
      ped.road = 0;
      ped.alongRoad = 'z';
      ped.side = i % 2 === 0 ? 1 : -1;
      ped.fleeing = 0;
      ped.mesh.group.position.set(ped.x, 0, ped.z);
    });
    const passer = game.traffic[0];
    passer.loop = [{ x: 0, z: 120 }, { x: 0, z: -160 }];
    passer.loopIndex = 1;
    passer.x = 0;
    passer.z = 70;
    passer.heading = Math.PI;
    passer.cruise = 12;
    for (let i = 0; i < 3 * 60; i += 1) {
      game.time += STEP;
      stepPlayer(game.player, STEP, { x: 0, y: 1 }, 0, false, world.colliders);
      ambient(game, world, STEP);
    }
    fixedCamera(renderer, game.player.x, game.player.z, game.player.heading, 8, 2.5, 3.4, 10);
    beacon.update(null, game.time);
    return beacon;
  }

  if (name === 'chase') {
    // Three stars, two police cars on the tail, the player flooring it down the avenue.
    const car = game.parked[0] ?? game.traffic[0];
    car.x = 0;
    car.z = -100;
    car.heading = 0;
    putPlayerInCar(game, renderer, car);
    addCrime(game.wanted, 3, game.time);
    const police1 = spawnChasePolice(game, renderer, 2.5, -114);
    const police2 = spawnChasePolice(game, renderer, -3, -124);
    for (let i = 0; i < 4 * 60; i += 1) {
      game.time += STEP;
      driveToward(car, 0, 220, STEP, world.colliders);
      for (const police of [police1, police2]) {
        const want = Math.atan2(car.x - police.x, car.z - police.z);
        const steer = clamp(angleDelta(police.heading, want) * 1.8, -1, 1);
        stepDriving(police, STEP, { throttle: 1, steer, handbrake: false }, world.colliders);
        updatePoliceLights(police, game.time);
      }
      ambient(game, world, STEP);
    }
    // Side-on: the player car sweeps past with the police on its tail behind it.
    // The camera looks north-west, away from the low sun, so the glare stays out
    // of frame and the police light bars read against the dusk sky. Camera z is
    // 8 south of the car, not 2: a street-light pole stands at x=+7.2, z≈car.z-0.9,
    // dead on the old sightline — the shift puts it ~28° off-axis, clear of the car.
    renderer.setFixed({
      position: new THREE.Vector3(car.x + 16, 5, car.z - 8),
      look: new THREE.Vector3(car.x - 2, 1.8, car.z - 6),
    });
    beacon.update(null, game.time);
    return beacon;
  }

  if (name === 'mission') {
    // Courier Run in progress: the player racing for the Old Town checkpoint, the
    // objective and the waypoint live on the HUD.
    game.missions.index = 1;
    startMission(game.missions);
    const car = game.parked[0] ?? game.traffic[0];
    car.x = 52;
    car.z = 130;
    car.heading = Math.PI;
    putPlayerInCar(game, renderer, car);
    // The route stays on the roads: north up the x=52 avenue, then west to Old Town.
    // The corner is rounded with a diagonal waypoint — a single 90-degree turn at
    // speed arcs wide into the corner tower, two 45-degree turns stay in the road.
    // (The diagonal starts 10 units BEFORE the corner, south of it, not past it.)
    // 12 seconds: the approach is slower now that the autopilot brakes for the corner.
    const route = [{ x: 52, z: -94 }, { x: 42, z: -104 }, { x: -104, z: -104 }];
    let waypoint = 0;
    const trace = [];
    for (let i = 0; i < 12 * 60; i += 1) {
      game.time += STEP;
      waypoint = driveRoute(car, route, waypoint, STEP, world.colliders);
      ambient(game, world, STEP);
      if (i % 30 === 0) {
        trace.push({
          t: +game.time.toFixed(1), x: +car.x.toFixed(1), z: +car.z.toFixed(1),
          h: +car.heading.toFixed(2), s: +car.speed.toFixed(1), wp: waypoint,
        });
      }
    }
    window.__neonTrace = trace;
    // Side-on from the south: the car reads broadside with its new detail, and the
    // low western sun stays out of frame — a chase cam here looks straight west
    // into it and blooms the car to white.
    renderer.setFixed({
      position: new THREE.Vector3(car.x + 1, 4.5, car.z + 15),
      look: new THREE.Vector3(car.x - 4, 1.8, car.z - 1),
    });
    beacon.update(game.missions.marker, game.time);
    return beacon;
  }

  // Cover: dusk driving down the Downtown avenue, neon in the wet street, HUD live.
  const car = game.parked[0] ?? game.traffic[0];
  car.x = 0;
  car.z = -160;
  car.heading = 0;
  putPlayerInCar(game, renderer, car);
  for (let i = 0; i < 7 * 60; i += 1) {
    game.time += STEP;
    driveToward(car, 0, 220, STEP, world.colliders);
    ambient(game, world, STEP);
  }
  fixedCamera(renderer, car.x, car.z, car.heading, 13, 3, 5.0, 14);
  beacon.update(null, game.time);
  return beacon;
}
