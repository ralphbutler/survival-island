// Volcano effects: GPU smoke and embers (each particle's path is computed in the vertex shader
// from its seed and the clock, so the CPU never touches them), a lava glow, and a sound anchor.
import * as THREE from 'three';
import { heightAt, VOLCANO } from './terrain.js';

const SMOKE_COUNT = 5000;
const EMBER_COUNT = 600;

function seededPoints(count) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));   // unused; shader builds positions
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  return geo;
}

const smokeVertex = /* glsl */`
  uniform float uTime, uLife, uScale;
  uniform vec3 uOrigin, uWind;
  attribute vec4 aSeed;
  varying float vAge, vShade;
  void main() {
    float t = mod(uTime + aSeed.x * uLife, uLife);
    float age = t / uLife;
    float ang = aSeed.y * 6.28318 + t * 0.25;
    float rad = (0.4 + aSeed.z * 3.0) + age * age * (8.0 + aSeed.z * 14.0);
    vec3 p = uOrigin + vec3(cos(ang) * rad, t * (3.2 + aSeed.w * 2.4), sin(ang) * rad);
    p += uWind * t * t * 0.05;
    p.x += sin(t * 1.7 + aSeed.y * 20.0) * age * 2.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float size = mix(2.5, 15.0, sqrt(age)) * (0.6 + aSeed.w * 0.8);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAge = age;
    vShade = aSeed.w;
  }`;

// Colour over life: glowing orange -> deep red -> black smoke -> grey haze (the original's red-to-black shift).
// At night (uNight -> 1) the lava lights the plume from below: the lower smoke glows red-orange.
const smokeFragment = /* glsl */`
  uniform float uNight;
  varying float vAge, vShade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 col = mix(vec3(1.0, 0.38, 0.08), vec3(0.45, 0.06, 0.03), smoothstep(0.0, 0.12, vAge));
    col = mix(col, vec3(0.09, 0.08, 0.08), smoothstep(0.08, 0.4, vAge));
    col = mix(col, vec3(0.34, 0.32, 0.32), smoothstep(0.5, 1.0, vAge) * vShade);
    float lowPlume = 1.0 - smoothstep(0.05, 0.6, vAge);
    col += vec3(0.9, 0.10, 0.03) * lowPlume * uNight * 1.1;                          // lava glow on the plume
    col += vec3(0.32, 0.04, 0.02) * (1.0 - smoothstep(0.4, 1.0, vAge)) * uNight;     // faint red underlight higher up
    float a = soft * (1.0 - smoothstep(0.6, 1.0, vAge)) * smoothstep(0.0, 0.03, vAge) * (0.5 + 0.15 * uNight * lowPlume);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const emberVertex = /* glsl */`
  uniform float uTime, uScale;
  uniform vec3 uOrigin;
  attribute vec4 aSeed;
  varying float vAge;
  void main() {
    float life = 1.6 + aSeed.w * 1.6;
    float t = mod(uTime + aSeed.x * life * 7.0, life);
    float ang = aSeed.y * 6.28318;
    float spread = 1.0 + aSeed.z * 4.0;
    vec3 p = uOrigin + vec3(cos(ang) * spread * t, (9.0 + aSeed.z * 10.0) * t - 4.9 * t * t, sin(ang) * spread * t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (0.35 + aSeed.w * 0.4) * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAge = t / life;
  }`;

const emberFragment = /* glsl */`
  varying float vAge;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    vec3 col = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.25, 0.05), vAge);
    gl_FragColor = vec4(col * 2.0, smoothstep(0.5, 0.1, d) * (1.0 - vAge));
  }`;

export function buildVolcano(scene) {
  const floorY = heightAt(VOLCANO.x, VOLCANO.z);
  const origin = new THREE.Vector3(VOLCANO.x, floorY + 1, VOLCANO.z);
  const shared = { uTime: { value: 0 }, uScale: { value: 800 }, uOrigin: { value: origin } };
  const night = { value: 0 };

  const smoke = new THREE.Points(seededPoints(SMOKE_COUNT), new THREE.ShaderMaterial({
    uniforms: { ...shared, uLife: { value: 14 }, uWind: { value: new THREE.Vector3(3, 0, 1.5) }, uNight: night },
    vertexShader: smokeVertex, fragmentShader: smokeFragment,
    transparent: true, depthWrite: false,
  }));
  const embers = new THREE.Points(seededPoints(EMBER_COUNT), new THREE.ShaderMaterial({
    uniforms: shared, vertexShader: emberVertex, fragmentShader: emberFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  smoke.frustumCulled = embers.frustumCulled = false;   // positions live in the shader, not the geometry
  scene.add(smoke, embers);

  // Lava pool and a flickering glow that lights the crater rim.
  const lava = new THREE.Mesh(
    new THREE.CircleGeometry(VOLCANO.craterR * 0.55, 18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff5a14, toneMapped: false }),
  );
  lava.position.set(VOLCANO.x, floorY + 0.35, VOLCANO.z);
  const glow = new THREE.PointLight(0xff5a1f, 3000, 80, 2);
  glow.position.set(VOLCANO.x, floorY + 5, VOLCANO.z);
  scene.add(lava, glow);

  // Empty object at the crater for positional audio to hang on.
  const soundAnchor = new THREE.Object3D();
  soundAnchor.position.copy(origin);
  scene.add(soundAnchor);

  return {
    soundAnchor,
    setScale(renderer, camera) {
      shared.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    update(t, nightAmount = 0) {
      shared.uTime.value = t;
      night.value = nightAmount;
      glow.intensity = (2600 + 700 * Math.sin(t * 7.3) * Math.sin(t * 3.1)) * (1 + nightAmount);
    },
  };
}
