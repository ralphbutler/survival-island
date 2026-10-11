// Survival Island -- phase 3: island, hero, volcano, campfire puzzle, farm, and day-to-night.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildTerrain, buildWater, VOLCANO, OUTPOST, FARM, smoothstep } from './terrain.js';
import { buildVegetation } from './vegetation.js';
import { buildDeck, findSpawn } from './props.js';
import { buildVolcano } from './volcano.js';
import { loadHero } from './hero.js';
import { loadGLTF } from './characters.js';
import { buildFarm } from './farm.js';
import { buildDayNight, DAY_SECONDS } from './daynight.js';
import { buildOutpost } from './outpost.js';
import { Puzzle } from './puzzle.js';
import { CoconutGame } from './coconut.js';
import { Dialogue, loadLines } from './dialogue.js';
import { FollowCamera } from './camera.js';
import { startAudio, setVolcanoZone } from './audio.js';
import { pressed, down, endFrame } from './input.js';

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(innerWidth, innerHeight);

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

const hemi = new THREE.HemisphereLight(0xcfe7ff, 0x5a7a3a, 0.6);
scene.add(hemi);
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
const vegetation = await buildVegetation(scene, {
  avoid: [{ x: spawn.x, z: spawn.z, r: 9 }, { x: OUTPOST.x, z: OUTPOST.z, r: OUTPOST.r }, { x: FARM.x, z: FARM.z, r: FARM.r }],
});
const volcano = buildVolcano(scene);
volcano.setScale(renderer, camera);
const outpost = buildOutpost(scene);
const farm = await buildFarm(scene);
const dayNight = buildDayNight(scene, renderer, { sky, sun, hemi, sunDir });

const follow = new FollowCamera(camera, renderer.domElement);
let hero = null;
let puzzle = null;
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

const banner = $('banner');
let bannerTimer = 0;
const ui = {
  toast: showToast,
  setCells: (n) => { $('battery').dataset.n = n; },
  setMatches: (on) => $('matchesBadge').classList.toggle('hidden', !on),
  banner(title, sub) {
    banner.querySelector('h2').textContent = title;
    banner.querySelector('p').textContent = sub;
    banner.style.opacity = 1;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.style.opacity = 0; }, 6000);
  },
};

const coconut = new CoconutGame(scene, camera, renderer.domElement, outpost, { onHit: () => puzzle?.wonCoconutGame() });

const NPC_MODELS = { Rory: 'assets/converted/people/Man_ClothedLightSkin1.glb', Raleigh: 'assets/converted/people/Woman_LightSkin2.glb' };
Promise.all([loadHero(scene), loadGLTF(NPC_MODELS.Rory), loadGLTF(NPC_MODELS.Raleigh), loadLines()]).then(([h, rory, raleigh, lines]) => {
  hero = h;
  hero.placeAt(spawn.x, spawn.z, spawnHeading);
  puzzle = new Puzzle(scene, outpost, { Rory: rory, Raleigh: raleigh }, new Dialogue(lines, $('subtitle')), ui);
  puzzle.setScale(renderer, camera);
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
}).catch((err) => {
  startBtn.textContent = 'Could not load the game (see console)';
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
  labelRenderer.setSize(innerWidth, innerHeight);
  volcano.setScale(renderer, camera);
  puzzle?.setScale(renderer, camera);
});

// Smooth camera swoops between follow mode and the coconut-aiming view.
const blend = { t: 1, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion() };
function startBlend() {
  blend.t = 0;
  blend.fromPos.copy(camera.position);
  blend.fromQuat.copy(camera.quaternion);
}
function applyBlend(dt) {
  if (blend.t >= 1) return;
  blend.t = Math.min(1, blend.t + dt / 0.7);
  const e = blend.t * blend.t * (3 - 2 * blend.t);
  const toPos = camera.position.clone(), toQuat = camera.quaternion.clone();
  camera.position.lerpVectors(blend.fromPos, toPos, e);
  camera.quaternion.slerpQuaternions(blend.fromQuat, toQuat, e);
}
const EXIT_KEYS = ['Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// Handle for debugging from the browser console (and automated checks): window.__game.hero.pos etc.
window.__game = { camera, follow, coconut, outpost, dayNight, get hero() { return hero; }, get puzzle() { return puzzle; } };

// ---------- loop ----------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (started && hero && coconut.active) {
    if (EXIT_KEYS.some((k) => pressed(k))) {
      coconut.exit();
      follow.enabled = true;
      follow.behind(hero.heading);
      startBlend();
      follow.update(dt, hero.pos);
    } else {
      camera.position.copy(coconut.aimPos);
      camera.lookAt(coconut.aimLook);
    }
    applyBlend(dt);
    focus.copy(hero.pos);
  } else if (started && hero) {
    hero.update(dt, follow.yaw, follow.rightDrag);
    if (coconut.shouldEnter(hero)) {
      coconut.enter(hero);
      follow.enabled = false;
      startBlend();
      camera.position.copy(coconut.aimPos);
      camera.lookAt(coconut.aimLook);
    } else {
      follow.update(dt, hero.pos);
    }
    applyBlend(dt);
    focus.copy(hero.pos);
    modeEl.textContent = hero.mode;
    if (hero.message) { showToast(hero.message); hero.message = null; }
    if (pressed('KeyM') && audio) showToast(audio.toggleMute() ? 'Muted' : 'Sound on');
    // Demo shortcuts (always on for now; may move behind a ?demo flag later).
    if (pressed('KeyL') && puzzle) { puzzle.readyToLight(hero); follow.behind(hero.heading); }
    if (pressed('KeyN')) { dayNight.seconds = DAY_SECONDS; showToast('Night'); }
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
  farm.update(dt, t);
  dayNight.update(dt, camera.position, started, down('KeyT'));   // hold T to fast-forward time
  volcano.update(t, dayNight.night);
  coconut.update(dt);
  if (started && hero) {
    puzzle?.update(dt, t, hero);
    // Volcano at about half volume inside the outpost clearing, back to full ~30 m beyond it.
    const dOut = Math.hypot(hero.pos.x - OUTPOST.x, hero.pos.z - OUTPOST.z);
    setVolcanoZone(0.45 + 0.55 * smoothstep(OUTPOST.r, OUTPOST.r + 30, dOut));
  }

  // Shadows only need to cover the area around the hero; the sun follows.
  sun.position.copy(focus).addScaledVector(sunDir, 200);
  sun.target.position.copy(focus);
  sky.position.copy(camera.position);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  endFrame();
});
