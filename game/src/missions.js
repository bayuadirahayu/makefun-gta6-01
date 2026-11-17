// The story: four missions, played in order, each with a waypoint beacon, an objective
// line for the HUD and a cash reward. The mission state machine owns its own timers and
// counters; the game loop feeds it the player's position, the car they drive and the
// events of the world (a car stolen, a checkpoint reached, a guard down) and it answers
// with what changed. Nothing here touches the renderer directly — it reports a marker
// position and an objective string, and the HUD and the beacon draw them.

import { MISSIONS } from './config.js';

export const MARKER_MARINA = { x: -196, z: 0, label: 'Marina' };
export const MARKER_AIRPORT = { x: 226, z: 0, label: 'Airport Rd' };

/** Checkpoints for the Courier Run: a tour through the five districts. */
const COURIER_POINTS = [
  { x: -104, z: -104, label: 'Old Town' },
  { x: 104, z: -104, label: 'Downtown' },
  { x: 104, z: 104, label: 'Beachfront' },
  { x: -104, z: 104, label: 'Marina' },
  { x: 0, z: 0, label: 'Downtown Plaza' },
];

/** Guard posts for the Marina Job, on the promenade. */
const GUARD_POSTS = [
  { x: -196, z: -24 },
  { x: -196, z: 24 },
  { x: -176, z: -12 },
  { x: -176, z: 12 },
];

export function createMissions() {
  return {
    index: 0, // which mission is active (0..3); 4 means the story is done
    state: 'idle', // idle | active | done
    checkpoint: 0,
    timeLeft: 0,
    guardsDown: 0,
    peakWanted: 0,
    phase: 'go', // marina-job phases: 'go' (reach the Marina) | 'fight' | 'escape'
    objective: '',
    marker: null,
  };
}

export function currentMission(missions) {
  return missions.index < MISSIONS.length ? MISSIONS[missions.index] : null;
}

/** Start the next mission and set its first objective and marker. */
export function startMission(missions) {
  const mission = currentMission(missions);
  if (!mission) return null;
  missions.state = 'active';
  missions.checkpoint = 0;
  missions.guardsDown = 0;
  missions.peakWanted = 0;
  missions.phase = 'go';
  if (mission.id === 'first-wheels') {
    missions.objective = 'Steal a car, then bring it to the Marina.';
    missions.marker = MARKER_MARINA;
  } else if (mission.id === 'courier-run') {
    missions.timeLeft = mission.timeLimit;
    missions.objective = 'Reach the checkpoints before time runs out.';
    missions.marker = COURIER_POINTS[0];
  } else if (mission.id === 'heat') {
    missions.objective = 'Get the heat to 3 stars — then shake it off.';
    missions.marker = null;
  } else if (mission.id === 'marina-job') {
    missions.objective = 'Get to the Marina and clear the crew.';
    missions.marker = MARKER_MARINA;
  }
  return mission;
}

/**
 * Advance the active mission one step. `ctx` carries the live game facts the mission
 * needs: player position, whether the player is driving, the wanted stars, the time
 * left and the guard count. Returns an event string ('complete' | 'failed' | 'phase' |
 * 'checkpoint' | null) for the game to react to.
 */
export function stepMission(missions, dt, ctx) {
  if (missions.state !== 'active') return null;
  const mission = currentMission(missions);
  if (!mission) return null;

  if (mission.id === 'first-wheels') {
    if (ctx.driving) {
      missions.objective = 'Deliver the car to the Marina drop-off.';
      missions.marker = MARKER_MARINA;
    }
    if (ctx.driving && near(ctx.px, ctx.pz, MARKER_MARINA.x, MARKER_MARINA.z, 8)) {
      return complete(missions);
    }
  } else if (mission.id === 'courier-run') {
    missions.timeLeft -= dt;
    if (missions.timeLeft <= 0) return fail(missions, 'Out of time.');
    const point = COURIER_POINTS[missions.checkpoint];
    missions.marker = point;
    if (near(ctx.px, ctx.pz, point.x, point.z, 9)) {
      missions.checkpoint += 1;
      missions.timeLeft += 12;
      if (missions.checkpoint >= COURIER_POINTS.length) return complete(missions);
      missions.objective = `Checkpoint ${missions.checkpoint + 1} of ${COURIER_POINTS.length} — ${COURIER_POINTS[missions.checkpoint].label}.`;
      return 'checkpoint';
    }
    missions.objective = `Checkpoint ${missions.checkpoint + 1} of ${COURIER_POINTS.length} — ${point.label}. ${Math.ceil(missions.timeLeft)}s left.`;
  } else if (mission.id === 'heat') {
    if (ctx.wanted >= 3) {
      missions.peakWanted = 3;
      missions.objective = 'Heat is on — now lose it completely.';
      missions.marker = null;
    }
    if (missions.peakWanted >= 3 && ctx.wanted === 0) {
      return complete(missions);
    }
    if (ctx.wanted === 0 && missions.peakWanted < 3) {
      missions.objective = 'Get the heat to 3 stars — steal a car in front of the police.';
    }
  } else if (mission.id === 'marina-job') {
    if (missions.phase === 'go') {
      if (near(ctx.px, ctx.pz, MARKER_MARINA.x, MARKER_MARINA.z, 14)) {
        missions.phase = 'fight';
        missions.objective = 'Clear the Marina crew — 4 guards left.';
        missions.marker = null;
        return 'phase';
      }
    } else if (missions.phase === 'fight') {
      const left = mission.guards - ctx.guardsDown;
      missions.objective = `Clear the Marina crew — ${left} guard${left === 1 ? '' : 's'} left.`;
      if (ctx.guardsDown >= mission.guards) {
        missions.phase = 'escape';
        missions.objective = 'Job done — escape to Airport Rd!';
        missions.marker = MARKER_AIRPORT;
        return 'phase';
      }
    } else if (missions.phase === 'escape') {
      if (near(ctx.px, ctx.pz, MARKER_AIRPORT.x, MARKER_AIRPORT.z, 10)) {
        return complete(missions);
      }
    }
  }
  return null;
}

function near(px, pz, mx, mz, radius) {
  const dx = px - mx;
  const dz = pz - mz;
  return dx * dx + dz * dz < radius * radius;
}

function complete(missions) {
  missions.state = 'done';
  missions.objective = '';
  missions.marker = null;
  return 'complete';
}

function fail(missions, reason) {
  missions.state = 'idle';
  missions.objective = reason;
  missions.marker = null;
  return 'failed';
}

/** Move to the next mission (after a completion) and start it. */
export function advanceMission(missions) {
  missions.index += 1;
  missions.state = 'idle';
  if (missions.index < MISSIONS.length) return startMission(missions);
  return null;
}

export function guardPosts() {
  return GUARD_POSTS;
}

export function courierPoints() {
  return COURIER_POINTS;
}
