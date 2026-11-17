// Neon Bay, the city: a road grid with five districts, instanced towers wearing lit
// windows, neon signs, palms on the Beachfront, water at the Marina and a runway on
// Airport Rd. The streets are wet: one planar Reflector covers the ground and a road-mask
// texture blends its mirror image in only where the asphalt is, so the neon city glows in
// the streets. Everything is built from the seeded random stream, so the same seed builds
// the same city. The file also exports the collision boxes and the traffic loops the other
// systems drive on.

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CITY, ROAD_LINES, DISTRICTS, PALETTE } from './config.js';
import { clamp } from './random.js';

const NEON_COLORS = [0xff2e88, 0x22e6ff, 0xffb02e, 0x9dff2e, 0xff5a3c, 0xb46bff];

/** A canvas texture of a tower face: dark cladding, a grid of windows, a few lit warm. */
function makeFacadeTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20242f';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const lit = random.chance(0.34);
      const warm = random.chance(0.75);
      ctx.fillStyle = lit ? (warm ? '#ffd27a' : '#7de8ff') : '#12151d';
      ctx.fillRect(6 + col * 15, 8 + row * 15, 10, 9);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  // The emissive twin: black everywhere except the lit windows.
  const glow = document.createElement('canvas');
  glow.width = 128;
  glow.height = 256;
  const gtx = glow.getContext('2d');
  gtx.fillStyle = '#000000';
  gtx.fillRect(0, 0, 128, 256);
  const litCells = [];
  for (let row = 0; row < 16; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (random.chance(0.34)) litCells.push([col, row, random.chance(0.75)]);
    }
  }
  for (const [col, row, warm] of litCells) {
    gtx.fillStyle = warm ? '#ffca6a' : '#6fd8ff';
    gtx.fillRect(6 + col * 15, 8 + row * 15, 10, 9);
  }
  const emissiveMap = new THREE.CanvasTexture(glow);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

/**
 * The road mask for the wet-street reflector: white where a road runs, black under the
 * blocks. Canvas row 0 is the north edge (world z = -380), so horizontal roads map to
 * canvas y = (380 - z) / 760 * size.
 */
function makeRoadMaskTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  const toPx = (v) => ((v + CITY.groundSize / 2) / CITY.groundSize) * size;
  const half = (CITY.roadWidth / 2 / CITY.groundSize) * size;
  for (const line of ROAD_LINES) {
    ctx.fillRect(toPx(line) - half, 0, half * 2, size);
    ctx.fillRect(0, toPx(-line) - half, size, half * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** The Reflector's shader: mirror the city where the mask is white, dark asphalt elsewhere. */
const WetStreetShader = {
  name: 'WetStreetShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tMask: { value: null },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vMaskUv;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vMaskUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    varying vec4 vUv;
    varying vec2 vMaskUv;
    void main() {
      vec4 reflection = texture2DProj(tDiffuse, vUv);
      float mask = texture2D(tMask, vMaskUv).r;
      vec3 asphalt = vec3(0.075, 0.08, 0.10);
      vec3 wet = reflection.rgb * vec3(0.55, 0.6, 0.8);
      vec3 col = mix(asphalt, wet, mask * 0.45);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

function districtAt(x, z) {
  let best = DISTRICTS[1];
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const dx = x - d.centre[0];
    const dz = z - d.centre[1];
    const dist = dx * dx + dz * dz;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

export function createWorld(random) {
  const group = new THREE.Group();
  const colliders = [];
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Dusk light: a low warm sun from the west, a violet sky fill, and a few warm pools
  // of street light at the big intersections.
  const sun = new THREE.DirectionalLight(0xff9a4d, 2.4);
  sun.position.set(-180, 90, -70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0x8a6cff, 0x1a1426, 1.15));
  const lampLights = [];
  for (const [lx, lz] of [[-104, -104], [104, -104], [-104, 104], [104, 104], [0, 0], [-208, 0]]) {
    const lamp = new THREE.PointLight(0xffb46a, 30, 46, 1.8);
    lamp.position.set(lx, 7, lz);
    group.add(lamp);
    lampLights.push(lamp);
  }

  // The base ground, then the wet-street mirror laid just above it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.groundSize, CITY.groundSize),
    new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  group.add(ground);

  const roadMask = makeRoadMaskTexture();
  const wetStreets = new Reflector(new THREE.PlaneGeometry(CITY.groundSize, CITY.groundSize), {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 512,
    color: 0x889099,
    shader: WetStreetShader,
  });
  wetStreets.rotation.x = -Math.PI / 2;
  wetStreets.position.y = 0.0;
  wetStreets.material.uniforms.tMask.value = roadMask;
  group.add(wetStreets);

  // Marina water to the west and the Beachfront sand to the south.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(220, CITY.groundSize),
    new THREE.MeshStandardMaterial({ color: 0x0d4258, roughness: 0.12, metalness: 0.55 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CITY.waterWest - 108, 0.02, 0);
  group.add(water);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.groundSize, 60),
    new THREE.MeshStandardMaterial({ color: 0xb99a62, roughness: 1, metalness: 0 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, CITY.beachSouth + 28);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.groundSize, 220),
    new THREE.MeshStandardMaterial({ color: 0x0d4258, roughness: 0.12, metalness: 0.55 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, CITY.beachSouth + 168);
  group.add(sea);

  // Sidewalk slabs: one per block, hiding the mirror under the buildings.
  const sidewalkGeo = new THREE.BoxGeometry(CITY.blockSize + 4, 0.24, CITY.blockSize + 4);
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x33363f, roughness: 0.9 });
  const sidewalks = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, 64);
  let sidewalkIndex = 0;

  // Towers: one instanced box per building, tinted by district, heights seeded.
  const facade = makeFacadeTexture(random);
  const buildingMat = new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.82,
    metalness: 0.12,
  });
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  buildingGeo.translate(0, 0.5, 0);
  const buildings = [];
  for (let i = -4; i < 4; i += 1) {
    for (let j = -4; j < 4; j += 1) {
      const cx = (i + 0.5) * CITY.pitch;
      const cz = (j + 0.5) * CITY.pitch;
      const district = districtAt(cx, cz);
      const count = random.int(1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = random.range(11, 17);
        const d = random.range(11, 17);
        const h = district.tall ? random.range(22, 64) : random.range(7, 22);
        const ox = count === 1 ? 0 : random.range(-9, 9);
        const oz = count === 1 ? 0 : random.range(-9, 9);
        const x = clamp(cx + ox, cx - 11, cx + 11);
        const z = clamp(cz + oz, cz - 11, cz + 11);
        buildings.push({ x, z, w, d, h, district });
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      dummy.position.set(cx, 0.12, cz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sidewalks.setMatrixAt(sidewalkIndex, dummy.matrix);
      sidewalkIndex += 1;
    }
  }
  sidewalks.count = sidewalkIndex;
  sidewalks.receiveShadow = true;
  group.add(sidewalks);

  const towerMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, buildings.length);
  buildings.forEach((b, index) => {
    dummy.position.set(b.x, 0.24, b.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    towerMesh.setMatrixAt(index, dummy.matrix);
    tmpColor.setHSL(b.district.hue, 0.32, random.range(0.55, 0.8));
    towerMesh.setColorAt(index, tmpColor);
  });
  towerMesh.castShadow = true;
  towerMesh.receiveShadow = true;
  group.add(towerMesh);

  // Neon signs: bright flat boxes on a few tower faces, picked up by the bloom pass.
  const signGeo = new THREE.BoxGeometry(1, 1, 0.3);
  const signs = [];
  for (let s = 0; s < 26; s += 1) {
    const b = random.pick(buildings);
    if (b.h < 12) continue;
    const color = random.pick(NEON_COLORS);
    const sign = new THREE.Mesh(
      signGeo,
      new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    );
    const face = random.int(0, 3);
    const y = random.range(6, b.h - 3);
    if (face === 0) sign.position.set(b.x, y, b.z - b.d / 2 - 0.2);
    else if (face === 1) sign.position.set(b.x, y, b.z + b.d / 2 + 0.2);
    else if (face === 2) sign.position.set(b.x - b.w / 2 - 0.2, y, b.z);
    else sign.position.set(b.x + b.w / 2 + 0.2, y, b.z);
    sign.scale.set(random.range(4, 9), random.range(1.2, 2.4), 1);
    if (face >= 2) sign.rotation.y = Math.PI / 2;
    group.add(sign);
    signs.push(sign);
  }

  // Street lights along every road, instanced poles with glowing heads.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6);
  poleGeo.translate(0, 3.2, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.6, metalness: 0.7 });
  const polePositions = [];
  for (const line of ROAD_LINES) {
    for (let t = -182; t <= 182; t += 52) {
      polePositions.push([line + 7.2, t]);
      polePositions.push([line - 7.2, t + 26]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, polePositions.length);
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, polePositions.length);
  polePositions.forEach(([x, z], index) => {
    dummy.position.set(x, 0.24, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    dummy.position.set(x, 6.7, z);
    dummy.updateMatrix();
    lamps.setMatrixAt(index, dummy.matrix);
  });
  group.add(poles);
  group.add(lamps);

  // Road centre dashes, instanced so the whole network is two draw calls.
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3.2);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xb9b25e, roughness: 0.7 });
  const dashes = [];
  for (const line of ROAD_LINES) {
    for (let t = -208; t <= 208; t += 13) {
      dashes.push([line, t, 0]);
      dashes.push([t, line, 1]);
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  dashes.forEach(([x, z, rot], index) => {
    dummy.position.set(x, 0.06, z);
    dummy.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(index, dummy.matrix);
  });
  group.add(dashMesh);

  // Palms along the Beachfront and the Marina promenade.
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 5, 6);
  trunkGeo.translate(0, 2.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const canopyGeo = new THREE.IcosahedronGeometry(1.7, 0);
  canopyGeo.scale(1, 0.55, 1);
  canopyGeo.translate(0, 5.4, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e7d46, roughness: 1 });
  const palmSpots = [];
  for (let x = -200; x <= 200; x += 26) {
    palmSpots.push([x, CITY.beachSouth - 6]);
    if (random.chance(0.6)) palmSpots.push([x + 13, CITY.beachSouth + 12]);
  }
  for (let z = -180; z <= 180; z += 34) {
    palmSpots.push([CITY.waterWest + 8, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach(([x, z], index) => {
    dummy.position.set(x, 0.24, z);
    dummy.rotation.set(0, random.angle(), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    canopies.setMatrixAt(index, dummy.matrix);
  });
  trunks.castShadow = true;
  group.add(trunks);
  group.add(canopies);

  // Airport Rd: a runway strip, two hangars and a parked jet built from primitives.
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 300),
    new THREE.MeshStandardMaterial({ color: 0x23242c, roughness: 0.9 }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(238, 0.05, 0);
  runway.receiveShadow = true;
  group.add(runway);
  for (const [hx, hz] of [[252, -60], [252, 60]]) {
    const hangar = new THREE.Mesh(
      new THREE.BoxGeometry(24, 12, 30),
      new THREE.MeshStandardMaterial({ color: 0x4a4e5c, roughness: 0.7, metalness: 0.4 }),
    );
    hangar.position.set(hx, 6.24, hz);
    hangar.castShadow = true;
    group.add(hangar);
    colliders.push({ minX: hx - 12, maxX: hx + 12, minZ: hz - 15, maxZ: hz + 15 });
  }
  const jet = new THREE.Group();
  const jetMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.35, metalness: 0.5 });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 22, 10), jetMat);
  fuselage.rotation.x = Math.PI / 2;
  jet.add(fuselage);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 4), jetMat);
  jet.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.3), jetMat);
  tail.position.set(0, 1.6, -10);
  jet.add(tail);
  jet.position.set(238, 2.2, 120);
  jet.rotation.y = Math.PI / 2;
  group.add(jet);

  // Traffic loops: rectangles around blocks, driven on the right-hand lane.
  const loops = [];
  const loopRects = [
    [-104, -104, 104, 104],
    [-156, -156, 156, 156],
    [-52, -52, 52, 52],
    [-208, -52, -52, 156],
    [52, -208, 208, 52],
  ];
  for (const [x0, z0, x1, z1] of loopRects) {
    loops.push([
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ]);
  }

  // Parked cars line the kerbs of a few roads.
  const parkedSpots = [];
  const parkedRoads = [-104, 0, 104, -52, 52];
  for (let p = 0; p < 14; p += 1) {
    const road = parkedRoads[p % parkedRoads.length];
    const along = -180 + p * 28;
    const side = p % 2 === 0 ? 1 : -1;
    parkedSpots.push({
      x: road + side * 4.4,
      z: along,
      heading: side > 0 ? Math.PI / 2 : -Math.PI / 2,
      alongRoad: 'z',
    });
  }

  return {
    group,
    colliders,
    loops,
    parkedSpots,
    districtAt,
    /** The sun follows the player so shadows stay crisp near the action. */
    followSun(px, pz) {
      sun.position.set(px - 180, 90, pz - 70);
      sun.target.position.set(px, 0, pz);
      sun.target.updateMatrixWorld();
    },
    /** A gentle neon flicker so the signs feel alive. */
    update(time) {
      for (let i = 0; i < signs.length; i += 1) {
        const s = Math.sin(time * 2.1 + i * 1.7) * 0.5 + 0.5;
        signs[i].material.color.setHex(NEON_COLORS[i % NEON_COLORS.length]);
        signs[i].material.color.multiplyScalar(0.75 + s * 0.45);
      }
    },
  };
}
