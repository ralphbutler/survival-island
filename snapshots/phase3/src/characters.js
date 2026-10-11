// One rigged robot model (RobotExpressive, CC0, Quaternius) shared by the hero and the NPCs.
// Each character gets its own skeleton clone, animation mixer, and optional body colour.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const HEIGHT = 1.8;
const ONE_SHOT = ['Jump', 'WalkJump', 'Wave', 'Yes', 'No', 'ThumbsUp', 'Punch'];

// Measure the ORIGINAL model once and reuse the fit for every clone: a fresh skinned clone can
// report a wildly wrong bounding box (seen 2026-10-11: 149 units instead of 4.8 -> a 6 cm hero).
let gltfPromise = null;
export function loadRobot() {
  gltfPromise ??= new GLTFLoader().loadAsync('assets/RobotExpressive.glb').then((gltf) => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const scale = HEIGHT / (box.max.y - box.min.y);
    gltf.userData.fit = { scale, footOffset: -box.min.y * scale };
    return gltf;
  });
  return gltfPromise;
}

// Returns { root, pivot, mixer, actions }:
// root (position + heading) -> pivot at mid-body (for leaning) -> model with feet at the root origin.
export function makeRobot(gltf, scene, bodyColor = null) {
  const model = SkeletonUtils.clone(gltf.scene);
  const { scale, footOffset } = gltf.userData.fit;
  model.scale.setScalar(scale);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (bodyColor !== null) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => recolor(m, bodyColor)) : recolor(o.material, bodyColor);
    }
  });

  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = HEIGHT / 2;
  model.position.y = -HEIGHT / 2 + footOffset;
  pivot.add(model);
  root.add(pivot);
  scene.add(root);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  for (const name of ONE_SHOT) {
    actions[name].setLoop(THREE.LoopOnce);
    actions[name].clampWhenFinished = true;
  }
  return { root, pivot, mixer, actions };
}

// The robot's orange body uses the material named "Main"; everything else keeps its colour.
const recolored = new Map();
function recolor(material, color) {
  if (material.name !== 'Main') return material;
  const key = color;
  if (!recolored.has(key)) {
    const m = material.clone();
    m.color.set(color);
    recolored.set(key, m);
  }
  return recolored.get(key);
}

// Small helper for anything with { actions, current }: crossfade to a clip.
export function crossfade(char, name, fade = 0.25) {
  if (!name || char.current === name || !char.actions[name]) return;
  char.actions[name].reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fade).play();
  if (char.current) char.actions[char.current].fadeOut(fade);
  char.current = name;
}

// ---------- any other rigged glTF (Quaternius people, animals) ----------
// Measured AFTER posing the skeleton (an unposed skinned clone gives a garbage bounding box),
// scaled to `height`, feet on the ground, clips keyed by short name ("Human Armature|Walk" -> "Walk").
const gltfCache = new Map();
const loader = new GLTFLoader();
export function loadGLTF(url) {
  if (!gltfCache.has(url)) gltfCache.set(url, loader.loadAsync(encodeURI(url)));
  return gltfCache.get(url);
}

export function makeCharacter(gltf, scene, { height, firstClip = 'Idle' } = {}) {
  const model = SkeletonUtils.clone(gltf.scene);
  model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name.split('|').pop()] = mixer.clipAction(clip);

  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(model);
  root.add(pivot);
  scene.add(root);

  const char = { root, pivot, mixer, actions, current: null };
  if (actions[firstClip]) crossfade(char, firstClip, 0);
  mixer.update(0);
  const box = posedBox(model);
  if (height) {
    model.scale.multiplyScalar(height / Math.max(box.max.y - box.min.y, 1e-3));
    const b2 = posedBox(model);
    model.position.y -= b2.min.y;
  } else model.position.y -= box.min.y;
  return char;
}

function posedBox(model) {
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox?.(); } });
  return new THREE.Box3().setFromObject(model, true);
}
