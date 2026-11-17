// The player on foot: a low-poly figure in a neon jacket who walks, sprints, punches and
// shoots. Movement is camera-relative (W runs away from the camera), the figure turns
// toward its travel direction, and the walk cycle is procedural. Combat is hitscan: the
// pistol fires a ray from the camera through the crosshair, and the punch is a short
// forward arc. The player also carries health, the pistol's magazine and reserve ammo.

import * as THREE from 'three';
import { PLAYER, PISTOL } from './config.js';
import { buildPersonMesh, animateWalk } from './people.js';
import { clamp, wrapAngle, angleDelta } from './random.js';

export function createPlayer(x, z) {
  const mesh = buildPersonMesh(0xff2e88, 0xe8b98a);
  // The neon jacket: a bright emissive stripe across the torso.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.1, 0.32),
    new THREE.MeshBasicMaterial({ color: 0x22e6ff, toneMapped: false }),
  );
  stripe.position.y = 1.25;
  mesh.group.add(stripe);
  mesh.group.position.set(x, 0, z);
  return {
    x,
    z,
    heading: 0,
    speed: 0,
    walkPhase: 0,
    mesh,
    health: PLAYER.health,
    money: 0,
    ammo: PISTOL.magazine,
    reserve: PISTOL.reserveStart,
    reloading: 0,
    fireCooldown: 0,
    punchCooldown: 0,
    punchAnim: 0,
    invulnerable: 0,
    dead: false,
  };
}

/**
 * One step on foot. `move` is the camera-relative input {x, y}, `camYaw` the camera
 * orbit angle. Returns the distance walked this step (for the walk cycle and audio).
 */
export function stepPlayer(player, dt, move, camYaw, sprinting, colliders) {
  if (player.dead) return 0;
  const speed = sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const mx = move.x;
  const my = move.y;
  const len = Math.hypot(mx, my);
  let walked = 0;
  if (len > 0.01) {
    // Camera-relative: forward is away from the camera, right is the camera's right.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = -fz;
    const rz = fx;
    const dx = (fx * my + rx * mx) / len;
    const dz = (fz * my + rz * mx) / len;
    const wantHeading = Math.atan2(dx, dz);
    player.heading += clamp(angleDelta(player.heading, wantHeading), -8 * dt, 8 * dt);
    player.heading = wrapAngle(player.heading);
    const step = speed * dt;
    player.x += Math.sin(player.heading) * step;
    player.z += Math.cos(player.heading) * step;
    walked = step;
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  // Circle against building boxes.
  for (const box of colliders) {
    const cx = clamp(player.x, box.minX, box.maxX);
    const cz = clamp(player.z, box.minZ, box.maxZ);
    const dx = player.x - cx;
    const dz = player.z - cz;
    const d2 = dx * dx + dz * dz;
    const r = PLAYER.radius;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      player.x = cx + (dx / d) * r;
      player.z = cz + (dz / d) * r;
    }
  }
  player.x = clamp(player.x, -232, 232);
  player.z = clamp(player.z, -232, 232);
  player.walkPhase += walked * 1.9;
  animateWalk(player.mesh, player.walkPhase, player.speed > 0 ? 1 : 0);
  // The punch is a quick arm swing.
  if (player.punchAnim > 0) {
    player.punchAnim -= dt;
    player.mesh.armR.rotation.x = -1.4 * Math.sin((player.punchAnim / 0.25) * Math.PI);
  }
  player.mesh.group.position.set(player.x, 0, player.z);
  player.mesh.group.rotation.y = player.heading;
  if (player.invulnerable > 0) player.invulnerable -= dt;
  if (player.fireCooldown > 0) player.fireCooldown -= dt;
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.reloading > 0) {
    player.reloading -= dt;
    if (player.reloading <= 0 && player.reserve > 0) {
      const need = PISTOL.magazine - player.ammo;
      const take = Math.min(need, player.reserve);
      player.ammo += take;
      player.reserve -= take;
    }
  }
  return walked;
}

/** Start a reload if the magazine is short and there is reserve ammo. */
export function startReload(player) {
  if (player.reloading > 0 || player.ammo >= PISTOL.magazine || player.reserve <= 0) return false;
  player.reloading = PISTOL.reloadSeconds;
  return true;
}

/** Fire one pistol round. Returns 'shot' when a round left the barrel, else a reason. */
export function firePistol(player) {
  if (player.reloading > 0) return 'reloading';
  if (player.fireCooldown > 0) return 'cooldown';
  if (player.ammo <= 0) {
    if (startReload(player)) return 'reloading';
    return 'empty';
  }
  player.ammo -= 1;
  player.fireCooldown = PISTOL.fireCooldown;
  return 'shot';
}

/** Swing a punch. Returns true when the swing starts. */
export function punch(player) {
  if (player.punchCooldown > 0 || player.reloading > 0) return false;
  player.punchCooldown = PLAYER.punchCooldown;
  player.punchAnim = 0.25;
  return true;
}

/** Apply damage, respecting the short post-hit invulnerability window. */
export function hurtPlayer(player, amount) {
  if (player.invulnerable > 0 || player.dead) return false;
  player.health -= amount;
  player.invulnerable = 0.6;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
  }
  return true;
}

/** A tracer for a pistol shot: a short-lived glowing line from muzzle to impact. */
export function makeTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, toneMapped: false, transparent: true, opacity: 0.9 }));
  line.userData.life = 0.09;
  return line;
}
