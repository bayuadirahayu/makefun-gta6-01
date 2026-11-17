// A tiny seeded random source (mulberry32) so the city, the traffic and every screenshot
// staging are exactly repeatable from ?seed=N. Nothing here reads Math.random: the world is
// built from one stream, so the same seed always builds the same Neon Bay.

export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + (max - min) * next();
    },
    /** An integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One element of an array, uniformly. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with the given probability. */
    chance(p) {
      return next() < p;
    },
    /** A unit-ish 2D direction. */
    angle() {
      return next() * Math.PI * 2;
    },
  };
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle `from` toward angle `to`, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
