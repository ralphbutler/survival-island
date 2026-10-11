// Survival Island -- phase 1: the island, the hero, and the volcano.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { buildTerrain, buildWater, VOLCANO } from './terrain.js';
import { buildVegetation } from './vegetation.js';
import { buildDeck, findSpawn } from './props.js';
import { buildVolcano } from './volcano.js';
import { loadHero } from './hero.js';
import { FollowCamera } from './camera.js';
import { startAudio } from './audio.js';
import { pressed, endFrame } from './input.js';

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcadcea, 260, 1300);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);

// ---------- sky + sun ----------
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(140));
const sky = new Sky();
sky.scale.setScalar(3000);
Object.entries({ turbidity: 3, rayleigh: 1.2, mieCoefficient: 0.004, mieDirectionalG: 0.8 })
  .forEach(([k, v]) => { sky.material.uniforms[k].value = v; });
sky.material.uniforms.sunPosition.value.copy(sunDir);

// Image-based lighting baked from the sky, so everything picks up the sky's colour.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(sky);
scene.environment = pmrem.fromScene(envScene).texture;
scene.environmentIntensity = 0.5;
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xcfe7ff, 0x5a7a3a, 0.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------- world ----------
scene.add(buildTerrain());
const water = buildWater();
scene.add(water.group);
const spawn = findSpawn();
const spawnHeading = Math.atan2(VOLCANO.x - spawn.x, VOLCANO.z - spawn.z);   // face the volcano
buildDeck(scene, spawn.x, spawn.z, spawnHeading);
const vegetation = buildVegetation(scene, { avoid: [{ x: spawn.x, z: spawn.z, r: 9 }] });
const volcano = buildVolcano(scene);
volcano.setScale(renderer, camera);

const follow = new FollowCamera(camera, renderer.domElement);
let hero = null;
let audio = null;
let started = false;

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const startBtn = $('start'), help = $('help'), hud = $('hud'), modeEl = $('mode'), toast = $('toast');
let toastTimer = 0;
function showToast(text) {
  toast.textContent = text;
  toast.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = 0; }, 1800);
}

loadHero(scene).then((h) => {
  hero = h;
  hero.placeAt(spawn.x, spawn.z, spawnHeading);
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
}).catch((err) => {
  startBtn.textContent = 'Could not load the hero model';
  console.error(err);
});

startBtn.addEventListener('click', () => {
  started = true;
  $('title').classList.add('hidden');
  hud.classList.remove('hidden');
  follow.behind(spawnHeading);
  audio = startAudio(camera, volcano.soundAnchor);   // needs the click: browsers block audio until a gesture
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  volcano.setScale(renderer, camera);
});

// ---------- loop ----------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (started && hero) {
    hero.update(dt, follow.yaw, follow.rightDrag);
    follow.update(dt, hero.pos);
    focus.copy(hero.pos);
    modeEl.textContent = hero.mode;
    if (hero.message) { showToast(hero.message); hero.message = null; }
    if (pressed('KeyM') && audio) showToast(audio.toggleMute() ? 'Muted' : 'Sound on');
  } else {
    // Title screen: slow fly-around of the island.
    const a = t * 0.05;
    camera.position.set(Math.cos(a) * 280, 120, Math.sin(a) * 280);
    camera.lookAt(0, 10, 0);
    focus.set(0, 0, 0);
  }
  if (pressed('KeyH')) help.classList.toggle('hidden');
  hero?.mixer.update(dt);

  water.update(t);
  vegetation.update(t);
  volcano.update(t);

  // Shadows only need to cover the area around the hero; the sun follows.
  sun.position.copy(focus).addScaledVector(sunDir, 200);
  sun.target.position.copy(focus);
  sky.position.copy(camera.position);

  renderer.render(scene, camera);
  endFrame();
});
