// NEON BAY: boot, the fixed-step loop and every system wired together. The game moves
// between four screens — title, play, paused and over (game over / busted / wasted) —
// and the world keeps living behind the title in attract mode. ?seed=N fixes the city;
// ?shot=<name>&seed=N stages a screenshot scene instead of the loop and sets
// window.__shotReady after painting twice.

import * as THREE from 'three';
import { STEP, PLAYER, PISTOL, CAR, TRAFFIC_COUNT, PARKED_COUNT, PED_COUNT, MISSIONS, PALETTE } from './config.js';
import { createRandom, clamp, wrapAngle, angleDelta } from './random.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER_CAR, ACTION_PUNCH, ACTION_RELOAD, ACTION_MUTE } from './input.js';
import { createWorld } from './world.js';
import { makeCar, stepDriving, stepTraffic, updatePoliceLights, collideBuildings } from './vehicles.js';
import { makePedestrian, makeCop, makeGuard, stepPedestrian, stepCop, stepGuard, scarePedestrians } from './people.js';
import { createPlayer, stepPlayer, firePistol, punch, hurtPlayer, startReload, makeTracer } from './player.js';
import { createWanted, addCrime, stepWanted, policeForLevel } from './wanted.js';
import { createMissions, startMission, stepMission, advanceMission, currentMission, guardPosts } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { createBeacon } from './beacon.js';

const MAX_FRAME = 0.25;
const CAR_COLORS = [0xc23b3b, 0x3b7ac2, 0xd8c53a, 0x3ac27a, 0x8a5fc2, 0xd8d8d8, 0x22242c, 0xe07b2e, 0x2ec2c2];

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);
const renderer = createRenderer(canvas);
renderer.scene.add(world.group);
const hud = createHud();
const audio = createAudio();

const game = {
  screen: 'title',
  time: 0,
  clockMinutes: 18 * 60 + 40,
  money: 0,
  player: createPlayer(4, 8),
  wanted: createWanted(),
  missions: createMissions(),
  cars: [],
  traffic: [],
  parked: [],
  policeCars: [],
  peds: [],
  cops: [],
  guards: [],
  guardsDown: 0,
  playerCar: null,
  tracers: [],
  lastCrimeAdd: -100,
  bustTimer: 0,
  crashSoundAt: -100,
  trafficRespawnAt: 0,
  lastOrbitAt: -100,
  headlight: null,
  headlightTarget: null,
};
renderer.scene.add(game.player.mesh.group);

// A debug handle for the browser console (handy while play-testing, harmless in play).
window.__neon = { game, renderer, world };

function announce(message) {
  statusEl.textContent = message;
}

/** Put a car on a loop and into the world. */
function spawnTrafficCar(loopIndex, cruise) {
  const loop = world.loops[loopIndex % world.loops.length];
  const start = loop[0];
  const car = makeCar('traffic', start.x, start.z, 0, CAR_COLORS[random.int(0, CAR_COLORS.length - 1)]);
  car.loop = loop;
  car.loopIndex = 1;
  car.cruise = cruise ?? random.range(8, 13);
  car.heading = Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z);
  game.traffic.push(car);
  game.cars.push(car);
  renderer.scene.add(car.mesh.group);
  return car;
}

function spawnParkedCars() {
  for (const spot of world.parkedSpots.slice(0, PARKED_COUNT)) {
    const car = makeCar('parked', spot.x, spot.z, spot.heading, CAR_COLORS[random.int(0, CAR_COLORS.length - 1)]);
    game.parked.push(car);
    game.cars.push(car);
    renderer.scene.add(car.mesh.group);
  }
}

function spawnPedestrians() {
  for (let i = 0; i < PED_COUNT; i += 1) {
    const road = [-104, -52, 0, 52, 104][i % 5];
    const ped = makePedestrian(random, random.range(-190, 190), road + 7.6);
    ped.alongRoad = i % 2 === 0 ? 'x' : 'z';
    game.peds.push(ped);
    renderer.scene.add(ped.mesh.group);
  }
}

function buildWorld() {
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(i, random.range(8, 13));
  spawnParkedCars();
  spawnPedestrians();
}

/** A crime the police may or may not see; throttled so one crash is one star, not five. */
function commitCrime(amount, reason) {
  if (game.time - game.lastCrimeAdd < 3) return;
  game.lastCrimeAdd = game.time;
  addCrime(game.wanted, amount, game.time);
  hud.showToast(`${reason} — Wanted ${'★'.repeat(game.wanted.stars)}`);
}

function nearestPoliceDistance() {
  let best = Infinity;
  for (const car of game.policeCars) {
    const d = Math.hypot(car.x - game.player.x, car.z - game.player.z);
    if (d < best) best = d;
  }
  for (const cop of game.cops) {
    const d = Math.hypot(cop.x - game.player.x, cop.z - game.player.z);
    if (d < best) best = d;
  }
  return best;
}

function spawnPoliceCar() {
  // Appear on a nearby road, already pointed at the player.
  const angle = random.angle();
  const x = clamp(game.player.x + Math.sin(angle) * 46, -208, 208);
  const z = clamp(game.player.z + Math.cos(angle) * 46, -208, 208);
  const car = makeCar('police', x, z, Math.atan2(game.player.x - x, game.player.z - z), 0xffffff, true);
  car.cruise = 20;
  game.policeCars.push(car);
  game.cars.push(car);
  renderer.scene.add(car.mesh.group);
  return car;
}

function spawnCop() {
  const angle = random.angle();
  const cop = makeCop(random, game.player.x + Math.sin(angle) * 24, game.player.z + Math.cos(angle) * 24);
  cop.health = 50;
  game.cops.push(cop);
  renderer.scene.add(cop.mesh.group);
  return cop;
}

function removeCarFromScene(car) {
  renderer.scene.remove(car.mesh.group);
  for (const list of [game.cars, game.traffic, game.parked, game.policeCars]) {
    const index = list.indexOf(car);
    if (index !== -1) list.splice(index, 1);
  }
}

/** Keep the police presence matched to the wanted level. */
function syncPolice() {
  const want = policeForLevel(game.wanted.stars);
  while (game.policeCars.length < want.cars) spawnPoliceCar();
  while (game.policeCars.length > want.cars) removeCarFromScene(game.policeCars[game.policeCars.length - 1]);
  while (game.cops.length < want.cops) spawnCop();
  while (game.cops.length > want.cops) {
    const cop = game.cops.pop();
    renderer.scene.remove(cop.mesh.group);
  }
}

function spawnGuards() {
  for (const post of guardPosts()) {
    const guard = makeGuard(random, post.x, post.z);
    game.guards.push(guard);
    renderer.scene.add(guard.mesh.group);
  }
}

/** The nearest car the player could enter, within reach. */
function nearestEnterableCar() {
  let best = null;
  let bestD = CAR.enterRange;
  for (const car of [...game.traffic, ...game.parked]) {
    const d = Math.hypot(car.x - game.player.x, car.z - game.player.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(car) {
  game.playerCar = car;
  car.taken = true;
  const index = game.traffic.indexOf(car);
  if (index !== -1) game.traffic.splice(index, 1);
  const parkedIndex = game.parked.indexOf(car);
  if (parkedIndex !== -1) game.parked.splice(parkedIndex, 1);
  renderer.scene.remove(game.player.mesh.group);
  renderer.rig.snapBehind(car.heading);
  // Headlights on the stolen car.
  if (!game.headlight) {
    game.headlight = new THREE.SpotLight(0xffeebb, 80, 46, 0.55, 0.45, 1.4);
    game.headlightTarget = new THREE.Object3D();
    game.headlightTarget.position.set(0, 0, 14);
  }
  car.mesh.group.add(game.headlight);
  game.headlight.position.set(0, 1, 2.2);
  car.mesh.group.add(game.headlightTarget);
  game.headlight.target = game.headlightTarget;
  const policeNear = nearestPoliceDistance() < 55;
  if (policeNear) commitCrime(1, 'Car stolen in front of the police');
  else hud.showToast('Car taken. Drive it to the marker.');
  audio.unlock();
}

function exitCar() {
  const car = game.playerCar;
  if (!car) return;
  game.playerCar = null;
  car.speed = 0;
  car.loop = null;
  game.parked.push(car);
  // Step out on the driver's side, clear of the door.
  game.player.x = car.x + 2.6;
  game.player.z = car.z + 1.5;
  game.player.heading = car.heading;
  game.player.mesh.group.position.set(game.player.x, 0, game.player.z);
  renderer.scene.add(game.player.mesh.group);
  if (game.headlight) {
    car.mesh.group.remove(game.headlight);
    car.mesh.group.remove(game.headlightTarget);
  }
}

/** Pistol hitscan from the camera through the crosshair; returns the hit point. */
function shootPistol() {
  const result = firePistol(game.player);
  if (result !== 'shot') {
    if (result === 'empty') hud.showToast('Out of ammo — press R to reload.');
    return;
  }
  audio.gunshot();
  const origin = new THREE.Vector3();
  renderer.camera.getWorldPosition(origin);
  const direction = new THREE.Vector3();
  renderer.camera.getWorldDirection(direction);
  const muzzle = new THREE.Vector3(game.player.x, 1.4, game.player.z);
  muzzle.addScaledVector(direction, 0.6);
  let bestTarget = null;
  let bestDist = PISTOL.range;
  const targets = [...game.guards, ...game.cops, ...game.peds];
  for (const target of targets) {
    if (target.dead) continue;
    const chest = new THREE.Vector3(target.x, 1.2, target.z);
    const toTarget = chest.clone().sub(origin);
    const along = toTarget.dot(direction);
    if (along < 1 || along > bestDist) continue;
    const closest = origin.clone().addScaledVector(direction, along);
    if (closest.distanceTo(chest) < 1.1) {
      bestDist = along;
      bestTarget = target;
    }
  }
  const end = origin.clone().addScaledVector(direction, bestDist);
  const tracer = makeTracer(muzzle, end);
  renderer.scene.add(tracer);
  game.tracers.push(tracer);
  if (bestTarget) {
    if (bestTarget.kind === 'guard') {
      bestTarget.health -= PISTOL.damage;
      if (bestTarget.health <= 0 && !bestTarget.dead) {
        bestTarget.dead = true;
        bestTarget.mesh.group.rotation.x = Math.PI / 2;
        bestTarget.mesh.group.position.y = 0.3;
        game.guardsDown += 1;
        hud.showToast('Guard down.');
      }
    } else if (bestTarget.kind === 'cop') {
      bestTarget.health -= PISTOL.damage;
      if (bestTarget.health <= 0 && !bestTarget.dead) {
        bestTarget.dead = true;
        bestTarget.mesh.group.rotation.x = Math.PI / 2;
        bestTarget.mesh.group.position.y = 0.3;
        commitCrime(1, 'Officer down');
        const index = game.cops.indexOf(bestTarget);
        if (index !== -1) game.cops.splice(index, 1);
      }
    } else {
      bestTarget.dead = true;
      bestTarget.mesh.group.rotation.x = Math.PI / 2;
      bestTarget.mesh.group.position.y = 0.3;
      commitCrime(1, 'Pedestrian hit');
    }
    scarePedestrians(game.peds, game.player.x, game.player.z, 40);
  }
  if (nearestPoliceDistance() < 60) commitCrime(1, 'Shots fired');
}

function swingPunch() {
  if (!punch(game.player)) return;
  audio.punch();
  const fx = Math.sin(game.player.heading);
  const fz = Math.cos(game.player.heading);
  for (const target of [...game.guards, ...game.cops, ...game.peds]) {
    if (target.dead) continue;
    const dx = target.x - game.player.x;
    const dz = target.z - game.player.z;
    const d = Math.hypot(dx, dz);
    if (d < PLAYER.punchRange && (dx * fx + dz * fz) / (d || 1) > 0.3) {
      if (target.kind === 'guard') {
        target.health -= PLAYER.punchDamage;
        if (target.health <= 0) {
          target.dead = true;
          target.mesh.group.rotation.x = Math.PI / 2;
          target.mesh.group.position.y = 0.3;
          game.guardsDown += 1;
        }
      } else if (target.kind === 'cop') {
        target.health -= PLAYER.punchDamage;
        if (target.health <= 0) {
          target.dead = true;
          target.mesh.group.rotation.x = Math.PI / 2;
          target.mesh.group.position.y = 0.3;
          commitCrime(1, 'Officer down');
          const index = game.cops.indexOf(target);
          if (index !== -1) game.cops.splice(index, 1);
        }
      } else {
        target.dead = true;
        target.mesh.group.rotation.x = Math.PI / 2;
        target.mesh.group.position.y = 0.3;
        commitCrime(1, 'Pedestrian hit');
      }
      scarePedestrians(game.peds, game.player.x, game.player.z, 30);
      break;
    }
  }
}

/** One fixed step of the whole simulation. */
function stepWorld(dt, input) {
  game.time += dt;
  game.clockMinutes += dt * 0.5;
  const player = game.player;

  // Input: orbit the camera, then move or drive.
  const mouse = input.takeMouse();
  if (mouse.dx !== 0 || mouse.dy !== 0) {
    renderer.orbit(mouse.dx, mouse.dy);
    game.lastOrbitAt = game.time;
  }
  const move = input.move();
  const actions = input.takeActions();

  if (game.playerCar) {
    const car = game.playerCar;
    const drive = {
      throttle: move.y,
      steer: -move.x,
      handbrake: input.handbrake(),
    };
    stepDriving(car, dt, drive, world.colliders);
    // Ease the chase camera back behind the car when the player stops looking around.
    if (game.time - game.lastOrbitAt > 1.5) {
      const delta = angleDelta(renderer.rig.yaw, car.heading);
      renderer.rig.yaw = wrapAngle(renderer.rig.yaw + delta * Math.min(1, 2.2 * dt));
    }
    // Ramming a pedestrian at speed is a crime, and a hard hit hurts.
    for (const ped of game.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 2 && Math.abs(car.speed) > 3) {
        ped.dead = true;
        ped.mesh.group.rotation.x = Math.PI / 2;
        ped.mesh.group.position.y = 0.3;
        car.speed *= 0.6;
        commitCrime(1, 'Pedestrian hit');
        scarePedestrians(game.peds, car.x, car.z, 40);
        if (game.time - game.crashSoundAt > 0.5) {
          audio.crash();
          game.crashSoundAt = game.time;
        }
      }
    }
    // Police cars ram the player's car.
    for (const cop of game.policeCars) {
      const d = Math.hypot(cop.x - car.x, cop.z - car.z);
      if (d < 3.4) {
        car.speed *= 0.75;
        cop.speed *= 0.6;
        if (game.time - game.crashSoundAt > 0.5) {
          audio.crash();
          game.crashSoundAt = game.time;
        }
      }
    }
    if (actions & ACTION_ENTER_CAR) exitCar();
  } else {
    stepPlayer(player, dt, move, renderer.rig.yaw, input.sprint(), world.colliders);
    // Traffic can run the player over.
    for (const car of [...game.traffic, ...game.policeCars]) {
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < 1.7 && Math.abs(car.speed) > 2) {
        if (hurtPlayer(player, 15)) {
          hud.showToast('Hit by a car!');
          audio.crash();
        }
        player.x += (player.x - car.x) * 0.6;
        player.z += (player.z - car.z) * 0.6;
      }
    }
    if (actions & ACTION_ENTER_CAR) {
      const car = nearestEnterableCar();
      if (car) enterCar(car);
    }
    if (actions & ACTION_PUNCH) swingPunch();
    if (actions & ACTION_RELOAD) {
      if (startReload(player)) hud.showToast('Reloading…');
    }
    if (input.firing()) shootPistol();
  }

  // Traffic, pedestrians and the police.
  for (const car of game.traffic) stepTraffic(car, dt, world.colliders, game.cars);
  for (const ped of game.peds) stepPedestrian(ped, dt, world.colliders);
  for (const car of game.policeCars) {
    const target = game.playerCar ?? player;
    const wantHeading = Math.atan2(target.x - car.x, target.z - car.z);
    const steer = clamp(angleDelta(car.heading, wantHeading) * 1.8, -1, 1);
    const dist = Math.hypot(target.x - car.x, target.z - car.z);
    stepDriving(car, dt, { throttle: dist > 6 ? 1 : 0.3, steer, handbrake: false }, world.colliders);
    updatePoliceLights(car, game.time);
  }
  for (const cop of game.cops) stepCop(cop, dt, player.x, player.z);
  for (const guard of game.guards) {
    stepGuard(guard, dt, player.x, player.z);
    if (!guard.dead && guard.shootCooldown <= 0) {
      const d = Math.hypot(player.x - guard.x, player.z - guard.z);
      if (d < 40) {
        guard.shootCooldown = 1.6;
        audio.gunshot();
        const from = new THREE.Vector3(guard.x, 1.4, guard.z);
        const to = new THREE.Vector3(player.x, 1.2, player.z);
        const tracer = makeTracer(from, to);
        renderer.scene.add(tracer);
        game.tracers.push(tracer);
        if (Math.random() < 0.4) hurtPlayer(player, 8);
      }
    }
  }

  // Wanted decay and the police presence.
  stepWanted(game.wanted, dt, game.time, nearestPoliceDistance());
  syncPolice();

  // Busted: a foot cop holding the player, or a police car sitting on them.
  const bustedByCop = game.cops.some((cop) => cop.touchTime > 2);
  const bustedByCar = !game.playerCar && game.policeCars.some((car) => Math.hypot(car.x - player.x, car.z - player.z) < 2.6);
  if (bustedByCop || bustedByCar) {
    game.bustTimer += dt;
    if (game.bustTimer > 1.2) return endScreen('busted');
  } else {
    game.bustTimer = 0;
  }
  if (player.dead) return endScreen('wasted');

  // Missions.
  if (game.missions.state === 'active') {
    const event = stepMission(game.missions, dt, {
      px: game.playerCar ? game.playerCar.x : player.x,
      pz: game.playerCar ? game.playerCar.z : player.z,
      driving: !!game.playerCar,
      wanted: game.wanted.stars,
      guardsDown: game.guardsDown,
    });
    if (event === 'complete') {
      const mission = MISSIONS[game.missions.index];
      game.money += mission.reward;
      audio.missionDone();
      hud.showToast(`Mission complete — ${mission.name}! +$${mission.reward}`);
      saveGame({ money: game.money, missionIndex: game.missions.index + 1, x: player.x, z: player.z, health: player.health, clockMinutes: game.clockMinutes });
      const next = advanceMission(game.missions);
      if (next) hud.showToast(`New mission: ${next.name} — ${next.brief}`, 5);
      else hud.showToast('Story complete! Neon Bay is yours.', 6);
    } else if (event === 'failed') {
      hud.showToast('Mission failed — try again.');
      startMission(game.missions);
    } else if (event === 'phase' && game.missions.phase === 'fight' && game.guards.length === 0) {
      spawnGuards();
      hud.showToast('The Marina crew is armed. Take them down!', 4);
    } else if (event === 'checkpoint') {
      audio.pickup();
      hud.showToast('Checkpoint!');
    }
  }

  // Tracers fade fast.
  for (let i = game.tracers.length - 1; i >= 0; i -= 1) {
    const tracer = game.tracers[i];
    tracer.userData.life -= dt;
    tracer.material.opacity = Math.max(0, tracer.userData.life / 0.09) * 0.9;
    if (tracer.userData.life <= 0) {
      renderer.scene.remove(tracer);
      tracer.geometry.dispose();
      tracer.material.dispose();
      game.tracers.splice(i, 1);
    }
  }

  // The world keeps its own time: neon flicker, the sun following the action.
  world.update(game.time);
  const focus = game.playerCar ?? player;
  world.followSun(focus.x, focus.z);

  // Audio follows the car and the nearest siren.
  audio.setEngine(game.playerCar ? Math.abs(game.playerCar.speed) / CAR.maxSpeed : 0, !!game.playerCar);
  audio.setSiren(nearestPoliceDistance());

  // Traffic tops itself back up after a theft.
  if (game.traffic.length < TRAFFIC_COUNT && game.time > game.trafficRespawnAt) {
    spawnTrafficCar(game.traffic.length);
    game.trafficRespawnAt = game.time + 10;
  }
  return null;
}

function endScreen(kind) {
  game.screen = kind;
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    text.textContent = 'The NCPD caught up with you. Press Enter to get back out there.';
  } else {
    title.textContent = 'WASTED';
    text.textContent = 'You went down in Neon Bay. Press Enter to try again.';
  }
  document.getElementById('end').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  announce(`${title.textContent}. Press Enter to try again.`);
  return kind;
}

function resetAfterFail() {
  game.wanted.stars = 0;
  game.wanted.quietTime = 0;
  game.wanted.decayTimer = 0;
  game.bustTimer = 0;
  for (const car of [...game.policeCars]) removeCarFromScene(car);
  for (const cop of [...game.cops]) {
    renderer.scene.remove(cop.mesh.group);
  }
  game.cops = [];
  for (const guard of [...game.guards]) {
    renderer.scene.remove(guard.mesh.group);
  }
  game.guards = [];
  game.guardsDown = 0;
  if (game.playerCar) {
    const car = game.playerCar;
    if (game.headlight) {
      car.mesh.group.remove(game.headlight);
      car.mesh.group.remove(game.headlightTarget);
    }
    game.playerCar = null;
  }
  game.player.dead = false;
  game.player.health = PLAYER.health;
  game.player.ammo = PISTOL.magazine;
  game.player.reserve = PISTOL.reserveStart;
  game.player.x = 4;
  game.player.z = 8;
  game.player.mesh.group.position.set(4, 0, 8);
  renderer.scene.add(game.player.mesh.group);
  game.missions.state = 'idle';
  startMission(game.missions);
  document.getElementById('end').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  game.screen = 'play';
  hud.showToast('Back on the streets.');
}

function startGame(fromSave) {
  const save = fromSave ? loadGame() : null;
  if (save) {
    game.money = save.money;
    game.missions.index = save.missionIndex;
    game.player.x = save.x;
    game.player.z = save.z;
    game.player.health = save.health;
    game.clockMinutes = save.clockMinutes;
    game.player.mesh.group.position.set(save.x, 0, save.z);
  } else {
    game.money = 0;
    game.missions.index = 0;
    game.player.x = 4;
    game.player.z = 8;
    game.player.health = PLAYER.health;
    game.player.mesh.group.position.set(4, 0, 8);
  }
  game.missions.state = 'idle';
  const mission = startMission(game.missions);
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  game.screen = 'play';
  audio.unlock();
  hud.showToast(mission ? `Mission: ${mission.name} — ${mission.brief}` : 'Free roam — the city is yours.', 5);
  announce(mission ? `Mission ${mission.name}. ${mission.brief}` : 'Free roam.');
}

function runGame() {
  buildWorld();
  const input = createInput(canvas);
  const beacon = createBeacon();
  renderer.scene.add(beacon.group);
  let accumulator = 0;
  let last = performance.now();
  const continueButton = document.getElementById('continue-button');
  if (!hasSave()) continueButton.classList.add('hidden');
  document.getElementById('new-button').addEventListener('click', () => startGame(false));
  continueButton.addEventListener('click', () => startGame(true));
  document.getElementById('resume-button').addEventListener('click', () => {
    document.getElementById('pause').classList.add('hidden');
    game.screen = 'play';
  });

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (game.screen === 'title') startGame(hasSave());
      else if (game.screen === 'busted' || game.screen === 'wasted') resetAfterFail();
      else if (game.screen === 'paused') {
        document.getElementById('pause').classList.add('hidden');
        game.screen = 'play';
      }
    } else if (actions & ACTION_PAUSE) {
      if (game.screen === 'play') {
        game.screen = 'paused';
        document.getElementById('pause').classList.remove('hidden');
        saveGame({ money: game.money, missionIndex: game.missions.index, x: game.player.x, z: game.player.z, health: game.player.health, clockMinutes: game.clockMinutes });
        announce('Paused.');
      } else if (game.screen === 'paused') {
        document.getElementById('pause').classList.add('hidden');
        game.screen = 'play';
      }
    }
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      hud.showToast(audio.isMuted() ? 'Sound muted.' : 'Sound on.');
    }
    // Gameplay actions belong to the simulation, not the menus: hand them back so the
    // fixed step below sees them.
    const gameplay = actions & (ACTION_ENTER_CAR | ACTION_PUNCH | ACTION_RELOAD);
    if (gameplay) input.press(gameplay);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.screen === 'title') {
      // Attract mode: traffic and pedestrians live while the camera drifts over Downtown.
      while (accumulator >= STEP) {
        for (const car of game.traffic) stepTraffic(car, STEP, world.colliders, game.cars);
        for (const ped of game.peds) stepPedestrian(ped, STEP, world.colliders);
        world.update(game.time);
        game.time += STEP;
        accumulator -= STEP;
      }
      const orbit = game.time * 0.05;
      renderer.setFixed({
        position: new THREE.Vector3(Math.sin(orbit) * 130, 55, Math.cos(orbit) * 130),
        look: new THREE.Vector3(0, 6, 0),
      });
    } else if (game.screen === 'play') {
      renderer.setFixed(null);
      while (accumulator >= STEP) {
        stepWorld(STEP, input);
        accumulator -= STEP;
        if (game.screen !== 'play') break;
      }
      const focus = game.playerCar ?? game.player;
      renderer.updateCamera(1 / 60, { x: focus.x, y: 0, z: focus.z }, !!game.playerCar, game.playerCar ? game.playerCar.speed : 0);
    } else {
      accumulator = 0;
    }
    if (game.screen === 'play' || game.screen === 'title') {
      beacon.update(game.screen === 'play' ? game.missions.marker : null, game.time);
      const mission = currentMission(game.missions);
      hud.update({
        health: game.player.health,
        money: game.money,
        wanted: game.wanted.stars,
        clockMinutes: game.clockMinutes,
        objectiveTitle: game.screen === 'play' && mission && game.missions.state === 'active' ? mission.name : '',
        objective: game.screen === 'play' && mission && game.missions.state === 'active' ? game.missions.objective : '',
        driving: !!game.playerCar,
        speed: game.playerCar ? game.playerCar.speed : 0,
        ammo: game.player.ammo,
        reserve: game.player.reserve,
        reloading: game.player.reloading > 0,
        screen: game.screen,
        px: game.playerCar ? game.playerCar.x : game.player.x,
        pz: game.playerCar ? game.playerCar.z : game.player.z,
        heading: game.playerCar ? game.playerCar.heading : game.player.heading,
        marker: game.missions.marker,
        police: [...game.policeCars, ...game.cops].map((u) => ({ x: u.x, z: u.z })),
        time: game.time,
      }, 1 / 60);
    }
    renderer.draw(game.time);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'play') {
      game.screen = 'paused';
      document.getElementById('pause').classList.remove('hidden');
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  buildWorld();
  stageShot(name, game, world, renderer);
  renderer.setPixelRatio(1);
  let painted = 0;
  function paint() {
    const mission = currentMission(game.missions);
    hud.update({
      health: game.player.health,
      money: game.money,
      wanted: game.wanted.stars,
      clockMinutes: game.clockMinutes,
      objectiveTitle: mission && game.missions.state === 'active' ? mission.name : '',
      objective: mission && game.missions.state === 'active' ? game.missions.objective : '',
      driving: !!game.playerCar,
      speed: game.playerCar ? game.playerCar.speed : 0,
      ammo: game.player.ammo,
      reserve: game.player.reserve,
      reloading: false,
      screen: 'play',
      px: game.playerCar ? game.playerCar.x : game.player.x,
      pz: game.playerCar ? game.playerCar.z : game.player.z,
      heading: game.playerCar ? game.playerCar.heading : game.player.heading,
      marker: game.missions.marker,
      police: [...game.policeCars, ...game.cops].map((u) => ({ x: u.x, z: u.z })),
      time: game.time,
    }, 1 / 60);
    renderer.draw(game.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  requestAnimationFrame(paint);
}

if (shotName) runShot(shotName);
else runGame();
