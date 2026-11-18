// GTA 6-style HUD: bare-text stars/cash/clock top-right, circular player-centred
// minimap bottom-left with health/armor bars, weapon + ammo bottom-right.
import { PALETTE, ROAD_LINES, CITY, DISTRICTS } from './config.js';

const SIZE = 220, R = 150, HALF = SIZE / 2;

export function createHud() {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const armorBar = document.getElementById('armorbar');
  const armorFill = document.getElementById('armor-fill');
  const moneyText = document.getElementById('money');
  const starsBox = document.getElementById('stars');
  const clockText = document.getElementById('clock');
  const objectiveBox = document.getElementById('objective');
  const objectiveTitle = document.getElementById('objective-title');
  const objectiveText = document.getElementById('objective-text');
  const speedBox = document.getElementById('speedo');
  const speedText = document.getElementById('speed');
  const weaponName = document.getElementById('weapon-name');
  const ammoText = document.getElementById('ammo');
  const toastBox = document.getElementById('toast');
  const crosshair = document.getElementById('crosshair');
  const mapCanvas = document.getElementById('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  let toastTimer = 0;
  let cx = null, cz = null;
  weaponName.textContent = 'PISTOL'; // the only weapon in the game

  function showToast(message, seconds = 3) {
    toastBox.textContent = message;
    toastBox.classList.add('show');
    toastTimer = seconds;
  }

  function drawMinimap(state) {
    const ctx = mapCtx;
    if (cx === null) { cx = state.px; cz = state.pz; }
    cx += (state.px - cx) * 0.2; // smooth follow, no snapping
    cz += (state.pz - cz) * 0.2;
    const scale = HALF / R;
    const mx = (v) => HALF + (v - cx) * scale;
    const my = (v) => HALF + (v - cz) * scale;
    const x0 = cx - R, x1 = cx + R, z0 = cz - R, z1 = cz + R;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(HALF, HALF, HALF, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#12141d';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Water west, sand strip + water south.
    ctx.fillStyle = '#0d4258';
    ctx.fillRect(0, 0, mx(CITY.waterWest), SIZE);
    ctx.fillStyle = '#8a744a';
    ctx.fillRect(0, my(CITY.beachSouth), SIZE, 56 * scale);
    ctx.fillStyle = '#0d4258';
    ctx.fillRect(0, my(CITY.beachSouth + 56), SIZE, SIZE);
    // Roads, clipped to the view.
    ctx.strokeStyle = '#4a4e5c';
    ctx.lineWidth = Math.max(2, CITY.roadWidth * scale);
    for (const line of ROAD_LINES) {
      if (line >= x0 && line <= x1) {
        ctx.beginPath(); ctx.moveTo(mx(line), my(z0)); ctx.lineTo(mx(line), my(z1)); ctx.stroke();
      }
      if (line >= z0 && line <= z1) {
        ctx.beginPath(); ctx.moveTo(mx(x0), my(line)); ctx.lineTo(mx(x1), my(line)); ctx.stroke();
      }
    }
    // District labels, small caps with a dark outline.
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const dx = d.centre[0], dz = d.centre[1];
      if (dx < x0 || dx > x1 || dz < z0 || dz > z1) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(d.name.toUpperCase(), mx(dx), my(dz));
      ctx.fillStyle = '#fff';
      ctx.fillText(d.name.toUpperCase(), mx(dx), my(dz));
    }
    // Mission marker: yellow diamond with a pulsing ring.
    if (state.marker) {
      const px = mx(state.marker.x), py = my(state.marker.z);
      const pulse = 9 + Math.sin(state.time * 4) * 3;
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(px, py - 7); ctx.lineTo(px + 7, py); ctx.lineTo(px, py + 7); ctx.lineTo(px - 7, py);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#12141d'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Police blips: blue circles with a white outline.
    for (const unit of state.police) {
      ctx.beginPath();
      ctx.arc(mx(unit.x), my(unit.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82ff'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Player arrow, white with a dark outline, along the heading.
    ctx.save();
    ctx.translate(mx(state.px), my(state.pz));
    ctx.rotate(state.heading);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
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
      if (state.armor) {
        armorBar.classList.remove('hidden');
        armorFill.style.width = `${Math.max(0, Math.round(state.armor))}%`;
      } else armorBar.classList.add('hidden');
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
