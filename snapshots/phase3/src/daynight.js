// Day -> sunset -> night over DAY_SECONDS of play. The physical sky shader does the sunset colours;
// we steer the sun angle, light colour/strength, fog, ambient, and fade in stars and a moon.
// At night the same directional light becomes moonlight (so moon shadows come for free).
import * as THREE from 'three';
import { smoothstep } from './terrain.js';

export const DAY_SECONDS = 12 * 60;
const START_ELEV = 38, END_ELEV = -14, AZIMUTH = 140;     // degrees
const MOON_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 35), THREE.MathUtils.degToRad(320));

const C = (hex) => new THREE.Color(hex);
const FOG_DAY = C(0xcadcea), FOG_DUSK = C(0xd9a27c), FOG_NIGHT = C(0x0c1628);
const SUN_DAY = C(0xfff1dc), SUN_DUSK = C(0xff9a4a), MOON = C(0x9fb6ff);
const HEMI_SKY_DAY = C(0xcfe7ff), HEMI_SKY_NIGHT = C(0x2a3a66);

export function buildDayNight(scene, renderer, { sky, sun, hemi, sunDir }) {
  // Stars: points on a big dome that follows the camera.
  const N = 1800, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.95 + 0.05;
    v.normalize().multiplyScalar(1300);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const starGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
  }));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xf4f1e0, transparent: true, opacity: 0, fog: false }));
  stars.frustumCulled = moon.frustumCulled = false;
  scene.add(stars, moon);

  let seconds = 0;
  const state = {
    get seconds() { return seconds; },
    set seconds(v) { seconds = v; },   // jump the clock (debugging: __game.dayNight.seconds = 700)
    night: 0,
    update(dt, cameraPos, running, fast) {
      if (running) seconds = Math.min(DAY_SECONDS * 1.1, seconds + dt * (fast ? 30 : 1));
      const k = smoothstep(0, 1, seconds / DAY_SECONDS);
      const elev = THREE.MathUtils.lerp(START_ELEV, END_ELEV, k);
      sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(AZIMUTH));
      sky.material.uniforms.sunPosition.value.copy(sunDir);
      sky.material.uniforms.turbidity.value = THREE.MathUtils.lerp(3, 8, smoothstep(25, 0, elev));

      const dusk = smoothstep(22, 0, elev);          // 0 by day -> 1 at the horizon
      const night = smoothstep(2, -9, elev);          // 0 -> 1 after sunset
      this.night = night;

      if (night < 0.5) {   // the sun
        sun.color.copy(SUN_DAY).lerp(SUN_DUSK, dusk);
        sun.intensity = 3 * (1 - dusk * 0.6) * (1 - night * 2);
      } else {             // the same light, now from the moon
        sunDir.copy(MOON_DIR);
        sun.color.copy(MOON);
        sun.intensity = 0.55 * (night - 0.5) * 2;
      }
      hemi.intensity = THREE.MathUtils.lerp(0.6, 0.18, night);
      hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, night);
      scene.environmentIntensity = THREE.MathUtils.lerp(0.5, 0.05, night);
      scene.fog.color.copy(FOG_DAY).lerp(FOG_DUSK, dusk * (1 - night)).lerp(FOG_NIGHT, night);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(0.7, 0.9, night);

      stars.material.opacity = night;
      moon.material.opacity = night;
      stars.position.copy(cameraPos);
      moon.position.copy(cameraPos).addScaledVector(MOON_DIR, 1200);
      return night;
    },
  };
  return state;
}
