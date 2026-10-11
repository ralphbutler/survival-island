// Campfire flames + smoke: the same stateless GPU-particle idea as the volcano, at campfire scale.
// Hidden until light() is called; then it fades up over a couple of seconds.
import * as THREE from 'three';

function seeded(count) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  return geo;
}

const flameVertex = /* glsl */`
  uniform float uTime, uScale, uStrength;
  uniform vec3 uOrigin;
  attribute vec4 aSeed;
  varying float vAge;
  void main() {
    float life = 0.6 + aSeed.w * 0.6;
    float t = mod(uTime + aSeed.x * life * 5.0, life);
    float age = t / life;
    float ang = aSeed.y * 6.28318;
    float r = (0.45 * (1.0 - age)) * aSeed.z;   // flames pull inward as they rise
    vec3 p = uOrigin + vec3(cos(ang) * r, 0.15 + t * (1.6 + aSeed.z), sin(ang) * r);
    p.x += sin(uTime * 9.0 + aSeed.y * 30.0) * 0.06 * age;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = mix(0.75, 0.15, age) * uStrength * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAge = age;
  }`;

const flameFragment = /* glsl */`
  varying float vAge;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    vec3 col = mix(vec3(1.0, 0.9, 0.5), vec3(1.0, 0.35, 0.05), smoothstep(0.0, 0.6, vAge));
    col = mix(col, vec3(0.6, 0.08, 0.02), smoothstep(0.6, 1.0, vAge));
    gl_FragColor = vec4(col * 1.6, smoothstep(0.5, 0.0, d) * (1.0 - vAge) * 0.8);
  }`;

const smokeVertex = /* glsl */`
  uniform float uTime, uScale, uStrength;
  uniform vec3 uOrigin;
  attribute vec4 aSeed;
  varying float vAge;
  void main() {
    float life = 4.0;
    float t = mod(uTime + aSeed.x * life, life);
    float age = t / life;
    float ang = aSeed.y * 6.28318;
    vec3 p = uOrigin + vec3(cos(ang) * age * 1.2 * aSeed.z, 1.4 + t * 1.1, sin(ang) * age * 1.2 * aSeed.z);
    p.x += age * age * 1.5;   // gentle drift
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = mix(0.6, 2.4, age) * uStrength * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAge = age;
  }`;

const smokeFragment = /* glsl */`
  varying float vAge;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.55), smoothstep(0.5, 0.0, d) * (1.0 - vAge) * smoothstep(0.0, 0.1, vAge) * 0.25);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function buildFire(scene, origin) {
  const shared = { uTime: { value: 0 }, uScale: { value: 800 }, uStrength: { value: 0 }, uOrigin: { value: origin.clone() } };
  const flames = new THREE.Points(seeded(450), new THREE.ShaderMaterial({
    uniforms: shared, vertexShader: flameVertex, fragmentShader: flameFragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const smoke = new THREE.Points(seeded(160), new THREE.ShaderMaterial({
    uniforms: shared, vertexShader: smokeVertex, fragmentShader: smokeFragment, transparent: true, depthWrite: false,
  }));
  flames.frustumCulled = smoke.frustumCulled = false;
  flames.visible = smoke.visible = false;
  const light = new THREE.PointLight(0xff8a3a, 0, 22, 2);
  light.position.copy(origin).add(new THREE.Vector3(0, 1.0, 0));
  light.castShadow = false;
  scene.add(flames, smoke, light);

  let lit = false, strength = 0;
  return {
    get lit() { return lit; },
    light() {
      lit = true;
      flames.visible = smoke.visible = true;
    },
    setScale(renderer, camera) {
      shared.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    update(t, dt) {
      if (!lit) return;
      strength = Math.min(1, strength + dt * 0.5);
      shared.uTime.value = t;
      shared.uStrength.value = strength;
      light.intensity = strength * (60 + 25 * Math.sin(t * 13) * Math.sin(t * 7.7) + 10 * Math.sin(t * 23));
    },
  };
}
