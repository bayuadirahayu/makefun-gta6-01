// The renderer: a WebGL renderer with ACES tone mapping and soft shadows, a bloom
// composer (the neon signs and headlights glow), and a third-person camera rig that
// orbits on foot and chases the car while driving. The camera is smoothed every frame
// so it never snaps, and in shot mode it holds a fixed cinematic angle instead.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSky } from './sky.js';
import { clamp, lerp } from './random.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x3a2a55, 0.0038);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 8, 14);

  const sky = createSky();
  scene.add(sky.mesh);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.55, 0.65, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  }
  window.addEventListener('resize', resize);

  // Camera rig state: orbit angles, smoothed position and look target.
  const rig = {
    yaw: 0,
    pitch: 0.32,
    distance: 8.5,
    position: new THREE.Vector3(0, 8, 14),
    look: new THREE.Vector3(0, 1.5, 0),
    fixed: null, // shot mode: { position, look } held exactly
  };

  function updateCamera(dt, target, driving, speed) {
    if (rig.fixed) {
      camera.position.copy(rig.fixed.position);
      camera.lookAt(rig.fixed.look);
      return;
    }
    const desiredDistance = driving ? 11 + Math.abs(speed) * 0.08 : 8.5;
    const desiredHeight = driving ? 4.2 : 3.1;
    const tx = target.x - Math.sin(rig.yaw) * desiredDistance;
    const tz = target.z - Math.cos(rig.yaw) * desiredDistance;
    const ty = target.y + desiredHeight + Math.sin(rig.pitch) * 3;
    const k = Math.min(1, dt * (driving ? 5 : 8));
    rig.position.x = lerp(rig.position.x, tx, k);
    rig.position.y = lerp(rig.position.y, ty, k);
    rig.position.z = lerp(rig.position.z, tz, k);
    rig.look.x = lerp(rig.look.x, target.x, Math.min(1, dt * 10));
    rig.look.y = lerp(rig.look.y, target.y + 1.4, Math.min(1, dt * 10));
    rig.look.z = lerp(rig.look.z, target.z, Math.min(1, dt * 10));
    camera.position.copy(rig.position);
    camera.lookAt(rig.look);
  }

  return {
    scene,
    camera,
    rig,
    /** Orbit the camera by mouse deltas (pixels). */
    orbit(dx, dy) {
      rig.yaw -= dx * 0.0042;
      rig.pitch = clamp(rig.pitch + dy * 0.003, -0.12, 0.85);
    },
    /** Snap the rig behind a heading (used when entering a car). */
    snapBehind(heading) {
      rig.yaw = heading;
    },
    /** Hold a fixed cinematic camera (shot mode) or release it with null. */
    setFixed(fixed) {
      rig.fixed = fixed;
    },
    updateCamera,
    /** Paint one frame: advance the sky clock and render through the bloom composer. */
    draw(time) {
      sky.update(time);
      // A fixed cinematic camera (shot mode, title orbit) is applied here, so every
      // caller that draws gets the right view without remembering to move the camera.
      if (rig.fixed) {
        camera.position.copy(rig.fixed.position);
        camera.lookAt(rig.fixed.look);
      }
      sky.mesh.position.copy(camera.position);
      composer.render();
    },
    setPixelRatio(ratio) {
      renderer.setPixelRatio(ratio);
      composer.setPixelRatio(ratio);
    },
  };
}
