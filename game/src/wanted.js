// The wanted system: five stars, earned by crimes the police can see and lost by staying
// quiet and out of sight. Each level names how many police cars and foot cops hunt the
// player. The heat only decays when no crime happened recently and no police unit is
// close enough to keep eyes on the player.

import { WANTED } from './config.js';

export function createWanted() {
  return {
    stars: 0,
    quietTime: 0,
    decayTimer: 0,
    lastCrime: -100,
  };
}

/** How many police cars and foot cops a wanted level sends after the player. */
export function policeForLevel(stars) {
  if (stars <= 0) return { cars: 0, cops: 0 };
  if (stars === 1) return { cars: 1, cops: 0 };
  if (stars === 2) return { cars: 2, cops: 0 };
  if (stars === 3) return { cars: 2, cops: 2 };
  if (stars === 4) return { cars: 3, cops: 3 };
  return { cars: 4, cops: 4 };
}

/** Raise the heat by `amount` stars (capped at 5) and stamp the crime time. */
export function addCrime(wanted, amount, time) {
  wanted.stars = Math.min(WANTED.max, wanted.stars + amount);
  wanted.lastCrime = time;
  wanted.quietTime = 0;
  wanted.decayTimer = 0;
}

/**
 * One step: if the player has been crime-free for a while and no police unit is within
 * sight range, the heat ticks down one star at a time.
 */
export function stepWanted(wanted, dt, time, nearestPoliceDistance) {
  if (wanted.stars <= 0) return;
  if (time - wanted.lastCrime < WANTED.decayQuietSeconds) {
    wanted.quietTime = 0;
    return;
  }
  if (nearestPoliceDistance < WANTED.sightRange) {
    wanted.quietTime = 0;
    return;
  }
  wanted.quietTime += dt;
  wanted.decayTimer += dt;
  if (wanted.decayTimer >= WANTED.decayStepSeconds) {
    wanted.decayTimer = 0;
    wanted.stars -= 1;
  }
}
