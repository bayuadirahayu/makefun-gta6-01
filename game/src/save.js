// Saving to localStorage: money, the mission reached, the player's position and health,
// and the clock. Loading never trusts the file blindly — every field is checked and a
// bad save falls back to a fresh game. The save is written on mission completion and
// when the player pauses, so quitting mid-chase still keeps the progress.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: Math.round(state.money),
      missionIndex: state.missionIndex,
      x: Math.round(state.x * 10) / 10,
      z: Math.round(state.z * 10) / 10,
      health: Math.round(state.health),
      clockMinutes: Math.round(state.clockMinutes),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    if (typeof data.x !== 'number' || typeof data.z !== 'number') return null;
    return {
      money: Math.max(0, data.money),
      missionIndex: Math.min(4, Math.max(0, Math.floor(data.missionIndex))),
      x: Math.max(-232, Math.min(232, data.x)),
      z: Math.max(-232, Math.min(232, data.z)),
      health: Math.max(1, Math.min(100, data.health || 100)),
      clockMinutes: typeof data.clockMinutes === 'number' ? data.clockMinutes : 18 * 60 + 40,
    };
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off; nothing to clear then.
  }
}
