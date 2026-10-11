// Asset Zoo: preview candidate models in the game's lighting, side by side with the robot for scale.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import manifest from './zoo_manifest.js';

// ---------- scene: same sky, sun and tone mapping as the game ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer({ element: document.getElementById('labels') });
labels.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcadcea, 120, 500);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(140));
const sky = new Sky();
sky.scale.setScalar(2000);
Object.entries({ turbidity: 3, rayleigh: 1.2, mieCoefficient: 0.004, mieDirectionalG: 0.8 }).forEach(([k, v]) => { sky.material.uniforms[k].value = v; });
sky.material.uniforms.sunPosition.value.copy(sunDir);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(sky);
scene.environment = pmrem.fromScene(envScene).texture;
scene.environmentIntensity = 0.5;
scene.add(sky);
scene.add(new THREE.HemisphereLight(0xcfe7ff, 0x5a7a3a, 0.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x6cb24f, roughness: 0.95 }));
ground.receiveShadow = true;
scene.add(ground);

// ---------- loading + normalising ----------
const loader = new GLTFLoader();
const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(encodeURI(url)));
  return cache.get(url);
};

// Height of a (possibly skinned) model in its rest/first-frame pose. Skinned meshes need their
// skeleton posed first or the bounding box is garbage (that bug shrank our robot to 6 cm).
function measure(obj, mixer) {
  mixer?.update(0);
  obj.updateMatrixWorld(true);
  obj.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox?.(); } });
  return new THREE.Box3().setFromObject(obj, true);
}

const idleName = (clips) => (clips.find((c) => /idle/i.test(c.name)) ?? clips.find((c) => !/death/i.test(c.name)) ?? clips[0])?.name;
const shortName = (n) => n.split('|').pop();

async function makeItem(entry) {
  const gltf = await load(entry.url);
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const actions = {};
  for (const clip of gltf.animations) actions[shortName(clip.name)] = mixer.clipAction(clip);
  const first = idleName(gltf.animations);
  if (first) actions[shortName(first)].play();

  const holder = new THREE.Group();
  holder.add(model);
  let box = measure(model, mixer);
  if (entry.height) {   // characters and animals: scale to a believable height
    model.scale.multiplyScalar(entry.height / Math.max(box.max.y - box.min.y, 1e-3));
    box = measure(model, mixer);
  }
  model.position.y -= box.min.y;   // stand on the ground
  model.position.x -= (box.min.x + box.max.x) / 2;
  model.position.z -= (box.min.z + box.max.z) / 2;
  const size = box.getSize(new THREE.Vector3());
  return { entry, holder, model, mixer, actions, current: first ? shortName(first) : null, size };
}

// ---------- stage ----------
let items = [];
let selected = null;
const stage = new THREE.Group();
scene.add(stage);
const statusEl = document.getElementById('status');

function label(text, item) {
  const el = document.createElement('div');
  el.className = 'tag';
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(0, -0.05, item.size.z / 2 + 0.3);
  obj.center.set(0.5, 0);
  item.holder.add(obj);
  item.tag = el;
}

async function show(cat) {
  document.querySelectorAll('#cats button').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
  select(null);
  stage.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
  stage.clear();
  items = [];
  const list = cat === 'characters' ? manifest.characters : [manifest.characters[0], ...manifest[cat]];   // robot for scale
  statusEl.hidden = false;
  statusEl.textContent = `Loading ${list.length} models…`;
  const loaded = [];
  for (const [i, entry] of list.entries()) {
    try { loaded.push(await makeItem(entry)); } catch (e) { console.warn('failed', entry.url, e); }
    statusEl.textContent = `Loading ${i + 1} / ${list.length}…`;
  }

  // Crops: one row per crop type (Corn_1..4, Corn_Crop...); everything else: a single row.
  const rows = new Map();
  for (const it of loaded) {
    const key = cat === 'crops' && it.entry.name !== 'Robot (hero)' ? it.entry.name.split('_')[0] : 'all';
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  // Lay rows out in columns so a big grid (crops) stays roughly square.
  const rowList = [...rows.entries()];
  const perColumn = rowList.length > 6 ? Math.ceil(rowList.length / 3) : rowList.length;
  let colX = 0, z = 0, colWidth = 0;
  rowList.forEach(([key, row], r) => {
    if (r > 0 && r % perColumn === 0) { colX += colWidth + 4; colWidth = 0; z = 0; }
    let x = colX, depth = 0;
    if (key !== 'all') {   // crop type label at the start of its row
      const el = document.createElement('div');
      el.className = 'tag sel';
      el.textContent = key;
      const obj = new CSS2DObject(el);
      obj.position.set(colX - 0.6, 0, z);
      obj.center.set(1, 0.5);
      stage.add(obj);
    }
    for (const it of row) {
      const w = Math.max(it.size.x, 0.6);
      it.holder.position.set(x + w / 2, 0, z);
      x += w + Math.max(0.8, w * 0.35);
      depth = Math.max(depth, it.size.z);
      stage.add(it.holder);
      label(key === 'all' ? it.entry.name : it.entry.name.slice(key.length + 1), it);
      items.push(it);
    }
    colWidth = Math.max(colWidth, x - colX);
    z -= Math.max(depth, 1) + 2.2;
  });
  statusEl.hidden = true;

  // Frame everything.
  const box = new THREE.Box3().setFromObject(stage);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.z, s.y * 2) * 0.75 + 2;
  controls.target.copy(c);
  const high = rows.size > 2;   // a grid (crops) reads better from above
  camera.position.set(c.x, c.y + r * (high ? 1.1 : 0.55), c.z + r * (high ? 0.55 : 1));
  sun.position.copy(c).addScaledVector(sunDir, 150);
  sun.target.position.copy(c);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -r * 1.2; sc.right = sc.top = r * 1.2; sc.near = 1; sc.far = 400;
  sc.updateProjectionMatrix();
}

// ---------- selection + animation buttons ----------
const info = document.getElementById('info'), animsEl = document.getElementById('anims');
function select(item) {
  if (selected?.tag) selected.tag.classList.remove('sel');
  selected = item;
  info.hidden = !item;
  if (!item) return;
  item.tag?.classList.add('sel');
  document.getElementById('name').textContent = item.entry.name;
  const s = item.size;
  document.getElementById('meta').textContent =
    `${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} m · ${Object.keys(item.actions).length} animations`;
  animsEl.innerHTML = '';
  for (const name of Object.keys(item.actions)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.classList.toggle('on', name === item.current);
    b.onclick = () => {
      const next = item.actions[name], prev = item.current && item.actions[item.current];
      next.reset().fadeIn(0.25).play();
      if (prev && prev !== next) prev.fadeOut(0.25);
      item.current = name;
      animsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    };
    animsEl.appendChild(b);
  }
  // Glide the orbit target to the selected model.
  const p = item.holder.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, item.size.y / 2, 0));
  const off = camera.position.clone().sub(controls.target);
  const want = Math.max(item.size.length() * 1.6, 3);
  off.setLength(want);
  flyTo = { target: p, pos: p.clone().add(off), t: 0, fromT: controls.target.clone(), fromP: camera.position.clone() };
}
let flyTo = null;

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;   // a drag, not a click
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(items.map((i) => i.holder), true)[0];
  let o = hit?.object;
  while (o && !items.some((i) => i.holder === o)) o = o.parent;   // climb to the item's holder
  select(o ? items.find((i) => i.holder === o) : null);
});

document.querySelectorAll('#cats button').forEach((b) => { b.onclick = () => show(b.dataset.cat); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const it of items) it.mixer?.update(dt);
  if (flyTo) {
    flyTo.t = Math.min(1, flyTo.t + dt / 0.6);
    const e = flyTo.t * flyTo.t * (3 - 2 * flyTo.t);
    controls.target.lerpVectors(flyTo.fromT, flyTo.target, e);
    camera.position.lerpVectors(flyTo.fromP, flyTo.pos, e);
    if (flyTo.t >= 1) flyTo = null;
  }
  controls.update();
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

window.__zoo = { get items() { return items; }, show, select };
show(new URLSearchParams(location.search).get('cat') || 'characters');
