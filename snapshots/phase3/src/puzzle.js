// The puzzle chain: Rory & Raleigh give hints from their spots, 3 hidden power cells + 1 won at the
// coconut booth power the Site B door, the matches inside light the campfire.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { makeCharacter, crossfade } from './characters.js';
import { colliders } from './world.js';
import { buildFire } from './fire.js';
import { sfx, playOdeToJoy, crackleNode, positional } from './audio.js';
import { turnToward } from './hero.js';
import { smoothstep } from './terrain.js';

const SPOT_OFFSET = 2.2, SPOT_RADIUS = 1.0, PICKUP_RADIUS = 1.1, CELEBRATE_JUMPS = 5;

// Which line each NPC says, given progress so far.
function roryLine(s) {
  if (s.fireLit) return 'rory_fire';
  if (s.matches) return 'rory_matches';
  if (s.doorOpen) return 'rory_door_open';
  if (s.cells === 4) return 'rory_four';
  if (s.cells === 3) return 'rory_three';
  if (s.cells > 0) return 'rory_progress';
  return 'rory_intro';
}
function raleighLine(s) {
  if (s.fireLit) return 'raleigh_fire';
  if (s.doorOpen) return 'raleigh_door_open';
  if (s.cell4Taken) return 'raleigh_four';
  if (s.cell4Won) return 'raleigh_won';
  return 'raleigh_intro';
}

function makeCell(scene, pos) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 20), metal);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.16, 20), new THREE.MeshBasicMaterial({ color: 0x48f0ff }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12), metal);
  cap.position.y = 0.29;
  g.add(body, band, cap);
  g.traverse((o) => { o.castShadow = true; });
  const glow = new THREE.PointLight(0x48f0ff, 4, 4, 2);
  g.add(glow);
  g.position.copy(pos);
  scene.add(g);
  return { group: g, base: pos.clone(), taken: false };
}

export class Puzzle {
  // npcGltfs: { Rory, Raleigh } -- Quaternius CC0 people (Man / Woman packs)
  constructor(scene, outpost, npcGltfs, dialogue, ui) {
    Object.assign(this, { scene, outpost, dialogue, ui });
    this.state = { cells: 0, cell4Won: false, cell4Taken: false, doorOpen: false, matches: false, fireLit: false };

    // NPCs facing the clearing, each with a glowing spot in front of them. The people packs have no
    // wave or dance, so: no gesture while talking, and a celebration clip of their own at the fire.
    const looks = { Rory: { height: 1.8, celebrate: 'Jump' }, Raleigh: { height: 1.7, celebrate: 'Jump2' } };
    this.npcs = Object.entries(looks).map(([name, look]) => {
      const char = makeCharacter(npcGltfs[name], scene, { height: look.height });
      const pos = outpost.npcs[name];
      char.root.position.copy(pos);
      const toCentre = Math.atan2(outpost.center.x - pos.x, outpost.center.z - pos.z);
      char.heading = char.homeHeading = toCentre;
      char.root.rotation.y = toCentre;
      char.celebrate = look.celebrate;
      // Celebrate with 5 jumps, then settle back to idle.
      char.actions[look.celebrate]?.setLoop(THREE.LoopRepeat, CELEBRATE_JUMPS);
      char.mixer.addEventListener('finished', (e) => {
        if (e.action === char.actions[char.celebrate]) crossfade(char, 'Idle', 0.4);
      });
      colliders.push({ x: pos.x, z: pos.z, r: 0.5, top: pos.y + 1.8 });

      const spotPos = pos.clone().add(new THREE.Vector3(Math.sin(toCentre) * SPOT_OFFSET, 0.04, Math.cos(toCentre) * SPOT_OFFSET));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 0.98, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x8fffe0, transparent: true, opacity: 0, depthWrite: false }),
      );
      ring.position.copy(spotPos);
      scene.add(ring);
      return { name, char, spot: spotPos, ring, inside: false, line: name === 'Rory' ? roryLine : raleighLine };
    });

    this.cells = outpost.cellSpots.map((p) => makeCell(scene, p.clone().add(new THREE.Vector3(0, 0.6, 0))));
    this.cell4 = null;

    // Floating label over the dead door (HTML, positioned in 3D by CSS2DRenderer).
    const el = document.createElement('div');
    el.className = 'world-label hidden';
    el.textContent = 'The door needs more power';
    this.doorLabel = new CSS2DObject(el);
    this.doorLabel.position.copy(outpost.door.labelAnchor);
    scene.add(this.doorLabel);
    this.doorLabelEl = el;

    this.fire = buildFire(scene, outpost.campfire);
    this.fireAnchor = new THREE.Object3D();
    this.fireAnchor.position.copy(outpost.campfire);
    scene.add(this.fireAnchor);
    this.campfireHintShown = false;
  }

  npc(name) { return this.npcs.find((n) => n.name === name); }

  // Called by the coconut game when the target goes down.
  wonCoconutGame() {
    this.state.cell4Won = true;
    this.cell4 = makeCell(this.scene, this.outpost.standTop);
    this.cell4.group.scale.setScalar(0.01);
    this.cell4.spawn = 0;
    sfx.bigChime();
    this.ui.toast('You won a power cell! It’s on the stand.');
    setTimeout(() => this.dialogue.say('raleigh_won', this.npc('Raleigh').char.pivot), 900);
  }

  update(dt, t, hero) {
    const s = this.state;
    const hp = hero.pos;

    // NPCs: animate, turn to face the hero when nearby, trigger hints from their spots.
    for (const n of this.npcs) {
      const c = n.char;
      c.mixer.update(dt);
      const dx = hp.x - c.root.position.x, dz = hp.z - c.root.position.z;
      const near = Math.hypot(dx, dz) < 7;
      c.heading = turnToward(c.heading, near ? Math.atan2(dx, dz) : c.homeHeading, dt * 3);
      c.root.rotation.y = c.heading;

      const dSpot = Math.hypot(hp.x - n.spot.x, hp.z - n.spot.z);
      n.ring.material.opacity = smoothstep(10, 4, dSpot) * (0.45 + 0.25 * Math.sin(t * 3));
      const onSpot = dSpot < SPOT_RADIUS && hero.onGround;
      if (onSpot && !n.inside && !this.dialogue.busy) {
        this.dialogue.say(n.line(s), c.pivot);
      }
      if (onSpot) n.inside = true; else if (dSpot > SPOT_RADIUS + 0.5) n.inside = false;
    }

    // Power cells: bob, spin, collect.
    const allCells = this.cell4 ? [...this.cells, this.cell4] : this.cells;
    for (const cell of allCells) {
      if (cell.taken) continue;
      const g = cell.group;
      if (cell.spawn !== undefined && cell.spawn < 1) {
        cell.spawn = Math.min(1, cell.spawn + dt * 2);
        g.scale.setScalar(Math.max(0.01, cell.spawn));
      }
      g.rotation.y += dt * 1.5;
      g.position.y = cell.base.y + Math.sin(t * 2.2 + cell.base.x) * 0.12;
      if (Math.hypot(hp.x - g.position.x, hp.z - g.position.z) < PICKUP_RADIUS && Math.abs(hp.y + 0.8 - g.position.y) < 1.5) {
        cell.taken = true;
        this.scene.remove(g);
        s.cells++;
        if (cell === this.cell4) s.cell4Taken = true;
        sfx.chime();
        this.ui.setCells(s.cells);
        this.ui.toast(s.cells === 4 ? 'All 4 power cells!' : `Power cell ${s.cells} of 4`);
      }
    }

    // Site B door: label while underpowered, opens with 4 cells.
    this.outpost.door.update(dt);
    const dDoor = hp.distanceTo(this.outpost.door.front);
    if (!s.doorOpen) {
      if (s.cells >= 4 && dDoor < 3.5) {
        s.doorOpen = true;
        this.outpost.door.open();
        sfx.door();
        this.doorLabelEl.classList.add('hidden');
      } else {
        const show = dDoor < 4;
        if (show && this.doorLabelEl.classList.contains('hidden')) sfx.denied();
        this.doorLabelEl.classList.toggle('hidden', !show);
      }
    }

    // Matches on the desk.
    const m = this.outpost.matches;
    if (!s.matches && m.parent && Math.hypot(hp.x - m.position.x, hp.z - m.position.z) < 1.2) {
      s.matches = true;
      m.parent.remove(m);
      sfx.chime();
      this.ui.setMatches(true);
      this.ui.toast('You found the matches!');
    }

    // Campfire.
    const dFire = Math.hypot(hp.x - this.outpost.campfire.x, hp.z - this.outpost.campfire.z);
    if (!s.fireLit && dFire < 2.4) {
      if (s.matches) this.lightFire(hero);
      else if (!this.campfireHintShown) { this.campfireHintShown = true; this.ui.toast('You need something to light it with.'); }
    }
    if (dFire > 4) this.campfireHintShown = false;
    this.fire.update(t, dt);
  }

  // Cheat (L): finish everything except the fire -- all cells, target down, door open, matches in
  // hand -- and stand the hero a few steps from the campfire so they can walk in and light it.
  readyToLight(hero) {
    const s = this.state;
    if (s.fireLit) return;
    for (const cell of [...this.cells, this.cell4].filter(Boolean)) {
      if (!cell.taken) { cell.taken = true; this.scene.remove(cell.group); }
    }
    this.outpost.target.down = true;
    Object.assign(s, { cells: 4, cell4Won: true, cell4Taken: true });
    if (!s.doorOpen) { s.doorOpen = true; this.outpost.door.open(); this.doorLabelEl.classList.add('hidden'); }
    const m = this.outpost.matches;
    if (m.parent) m.parent.remove(m);
    s.matches = true;
    this.ui.setCells(4);
    this.ui.setMatches(true);
    const f = this.outpost.campfire;
    hero.placeAt(f.x + 4.5, f.z + 1.5, Math.atan2(-4.5, -1.5));
    this.ui.toast('Ready to light: walk into the campfire');
  }

  lightFire(hero) {
    const s = this.state;
    s.fireLit = true;
    this.fire.light();
    sfx.ignite();
    positional(crackleNode(), this.fireAnchor, { ref: 4, max: 60 });
    this.ui.setMatches(false);
    setTimeout(() => {
      playOdeToJoy();
      this.ui.banner('You lit the campfire!', 'You won’t freeze tonight.');
      for (const n of this.npcs) crossfade(n.char, n.char.celebrate, 0.4);
      hero.startEmote('Dance');
    }, 1200);
    setTimeout(() => this.dialogue.say('rory_fire', this.npc('Rory').char.pivot), 12000);
  }

  setScale(renderer, camera) { this.fire.setScale(renderer, camera); }
}
