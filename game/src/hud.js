// The HUD: health bar, cash, wanted stars, clock, objective panel, speedometer and a
// live 2D minimap drawn on a canvas — roads, the beach and the water, the player arrow,
// the mission marker and every police blip. The HUD is plain DOM over the WebGL canvas
// (fast, crisp text, no extra draw calls), and the minimap is a canvas so it can be
// repainted every frame for almost nothing.

import { PALETTE, ROAD_LINES, CITY } from './config.js';

const MINIMAP_SIZE = 220;

export function createHud() {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const moneyText = document.getElementById('money');
  const starsBox = document.getElementById('stars');
  const clockText = document.getElementById('clock');
  const objectiveBox = document.getElementById('objective');
  const objectiveTitle = document.getElementById('objective-title');
  const objectiveText = document.getElementById('objective-text');
  const speedBox = document.getElementById('speedo');
  const speedText = document.getElementById('speed');
  const ammoText = document.getElementById('ammo');
  const toastBox = document.getElementById('toast');
  const crosshair = document.getElementById('crosshair');
  const mapCanvas = document.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  let toastTimer = 0;

  function showToast(message, seconds = 3) {
    toastBox.textContent = message;
    toastBox.classList.add('show');
    toastTimer = seconds;
  }

  function drawMinimap(state) {
    const ctx = mapCtx;
    const size = MINIMAP_SIZE;
    const scale = size / (CITY.groundSize + 120);
    const toMap = (v) => size / 2 + v * scale;
    ctx.clearRect(0, 0, size, size);
    // The city block.
    ctx.fillStyle = '#12141d';
    ctx.fillRect(0, 0, size, size);
    // Water west and south.
    ctx.fillStyle = '#0d4258';
    ctx.fillRect(0, 0, toMap(CITY.waterWest), size);
    ctx.fillStyle = '#0d4258';
    ctx.fillRect(0, toMap(CITY.beachSouth + 56), size, size - toMap(CITY.beachSouth + 56));
    // Sand strip.
    ctx.fillStyle = '#8a744a';
    ctx.fillRect(0, toMap(CITY.beachSouth), size, toMap(CITY.beachSouth + 56) - toMap(CITY.beachSouth));
    // Roads.
    ctx.strokeStyle = '#4a4e5c';
    ctx.lineWidth = Math.max(2, CITY.roadWidth * scale);
    for (const line of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(toMap(line), toMap(-208));
      ctx.lineTo(toMap(line), toMap(208));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toMap(-208), toMap(line));
      ctx.lineTo(toMap(208), toMap(line));
      ctx.stroke();
    }
    // The mission marker.
    if (state.marker) {
      const mx = toMap(state.marker.x);
      const my = toMap(state.marker.z);
      const pulse = 6 + Math.sin(state.time * 4) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#12141d';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#3b82ff';
    for (const unit of state.police) {
      ctx.beginPath();
      ctx.arc(toMap(unit.x), toMap(unit.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player arrow, pointing along the heading.
    const px = toMap(state.px);
    const py = toMap(state.pz);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    showToast,
    /** Repaint every HUD element from the live game state. */
    update(state, dt) {
      const health = Math.max(0, Math.round(state.health));
      healthFill.style.width = `${health}%`;
      healthFill.style.background = health > 50 ? '#37d67a' : health > 25 ? '#ffb02e' : '#ff3b30';
      healthText.textContent = `${health}`;
      moneyText.textContent = `$${state.money.toLocaleString('en-US')}`;
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
      starsBox.textContent = stars;
      starsBox.classList.toggle('hot', state.wanted > 0);
      const hours = Math.floor(state.clockMinutes / 60) % 24;
      const minutes = Math.floor(state.clockMinutes % 60);
      clockText.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      if (state.objectiveTitle) {
        objectiveBox.classList.remove('hidden');
        objectiveTitle.textContent = state.objectiveTitle;
        objectiveText.textContent = state.objective;
      } else {
        objectiveBox.classList.add('hidden');
      }
      if (state.driving) {
        speedBox.classList.remove('hidden');
        speedText.textContent = `${Math.round(Math.abs(state.speed) * 3.2)}`;
      } else {
        speedBox.classList.add('hidden');
      }
      ammoText.textContent = state.reloading ? 'RELOADING…' : `${state.ammo} / ${state.reserve}`;
      crosshair.classList.toggle('hidden', state.driving || state.screen !== 'play');
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toastBox.classList.remove('show');
      }
      drawMinimap(state);
    },
  };
}
