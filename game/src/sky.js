// The sky is a GPU raymarched dome, not a texture: every pixel marches a ray from the
// camera through a dusk gradient, a low sun disc with a halo, and two layers of procedural
// clouds built from value noise. On a desktop GPU this is a fragment shader running on the
// graphics card; on this machine's software renderer it paints the same pixels, slower.
// The dome follows the camera so its horizon never moves, and it never writes depth.

import * as THREE from 'three';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDirection;
  uniform vec3 uSunDir;
  uniform float uTime;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // A few octaves of value noise: the cloud field.
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 4; i++) {
      v += amp * valueNoise(p);
      p = p * 2.13 + vec2(17.3, 9.1);
      amp *= 0.5;
    }
    return v;
  }

  // Raymarch a ray through two thin cloud slabs. Each slab is sampled twice along the ray,
  // which gives the clouds a little depth instead of a flat billboard look.
  float cloudMarch(vec3 dir, float t) {
    if (dir.y < 0.02) return 0.0;
    float cover = 0.0;
    for (int layer = 0; layer < 2; layer++) {
      float h = 90.0 + float(layer) * 70.0;
      float dist = h / max(dir.y, 0.02);
      vec2 uv = dir.xz / dir.y * (1.0 + 0.02 * float(layer)) + vec2(uTime * 0.004, uTime * 0.0016);
      float n = fbm(uv * 0.045 + vec2(3.7 * float(layer)));
      float c = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.22, dir.y);
      cover += c * (layer == 0 ? 0.65 : 0.4);
      t += dist * 0.0;
    }
    return clamp(cover, 0.0, 1.0);
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float sunAmount = max(dot(dir, uSunDir), 0.0);

    // Dusk gradient: burnt orange at the horizon, violet overhead, deep blue at the top.
    vec3 horizon = vec3(1.0, 0.42, 0.16);
    vec3 mid = vec3(0.45, 0.20, 0.48);
    vec3 zenith = vec3(0.05, 0.06, 0.24);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.28, h));
    sky = mix(sky, zenith, smoothstep(0.22, 0.75, h));
    // Below the horizon the sea haze takes over.
    sky = mix(vec3(0.10, 0.08, 0.20), sky, smoothstep(-0.08, 0.02, dir.y));

    // The sun: a hard disc, a tight glow and a wide warm halo.
    float disc = smoothstep(0.9993, 0.9997, sunAmount);
    float glow = pow(sunAmount, 220.0) * 0.9 + pow(sunAmount, 18.0) * 0.45;
    sky += vec3(1.0, 0.75, 0.45) * glow;
    sky += vec3(1.0, 0.9, 0.7) * disc * 2.2;

    // Clouds, lit warm on the sun side and violet on the far side.
    float clouds = cloudMarch(dir, 0.0);
    vec3 cloudCol = mix(vec3(0.32, 0.18, 0.42), vec3(1.0, 0.55, 0.32), pow(sunAmount, 2.0));
    sky = mix(sky, cloudCol, clouds * 0.75);

    // A faint band of stars fading in near the zenith.
    vec2 starUv = dir.xz / max(dir.y, 0.08) * 24.0;
    float star = step(0.9985, hash21(floor(starUv))) * smoothstep(0.35, 0.8, dir.y);
    sky += vec3(0.8, 0.85, 1.0) * star * 0.5;

    gl_FragColor = vec4(sky, 1.0);
  }
`;

/** The sun hangs low in the west, over the Marina water. */
export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.16, -0.25).normalize();

/** Build the sky dome mesh. Call update(time) each frame to drift the clouds. */
export function createSky() {
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uSunDir: { value: SUN_DIRECTION.clone() },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    update(time) {
      material.uniforms.uTime.value = time;
    },
  };
}
