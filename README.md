# 🏝️ Survival Island (web rebuild)

A browser rebuild of Ralph's old Unity3D teaching demo *Survival Island*. A robot castaway explores a small island with a smoking volcano, a farm, and an outpost. Solving a few small puzzles earns the power to open the Site B bunker, where the matches are, and lighting the campfire before nightfall wins. Nothing bad happens if you don't; it's a demo of how such a game might go.

Built with **three.js** (r170, loaded from a CDN). There's no build step: it's plain JavaScript modules plus a few model and voice files.

## 🌐 Play it now

**▶️ [ralphbutler.github.io/survival-island](https://ralphbutler.github.io/survival-island/)**, in any desktop browser, nothing to install. Also: the [phase snapshots](#-snapshots) and the [Asset Zoo](https://ralphbutler.github.io/survival-island/zoo.html). How it was built in a day: [WHAT_WE_DID.md](WHAT_WE_DID.md).

## ▶️ Running it

```bash
git clone https://github.com/ralphbutler/survival-island.git
cd survival-island && python3 -m http.server 8000
```

Then open **http://localhost:8000**. It has to be served, not opened as a file, because the models and voices are fetched.

**After any code change, hard-refresh (Cmd+Shift+R).** Browsers cache the JavaScript modules, so a normal refresh can quietly run the old code.

## 🎮 Controls

Press **H** in the game for the full list.

| Key | Action |
|---|---|
| Arrows / WASD | Move (relative to the camera) |
| Shift | Run (or fly faster) |
| Space | Jump |
| F, then E / C | Toggle flying, then fly up / down |
| Left-drag / right-drag / scroll | Orbit the camera / orbit and turn the hero / zoom |
| G / V | Wave / dance |
| M | Mute |

**Demo shortcuts** (always on for now; they may move behind a `?demo` URL flag later):

| Key | Action |
|---|---|
| **N** | Jump straight to night |
| **L** | Ready to light: all cells collected, door open, matches in hand, and you're placed next to the unlit campfire |
| hold **T** | Fast-forward time at 30×. Sunset arrives about 7–8 minutes into normal play. |

The fastest demo for colleagues is **N → L → walk forward** into the fire: lighting, music, a banner, and celebrating NPCs, in about 10 seconds.

## 🧩 The puzzle chain

1. **Site B** (the bunker with the satellite dish) says *"The door needs more power."*
2. **Rory** gives a voiced hint when you step on the glowing ring in front of him: you need 4 power cells, and 3 are hidden nearby.
3. The cells are **beside the bunker**, **behind it**, and **in the gap between the bunker and the booth**. The battery meter in the bottom-left fills as you collect them.
4. **Raleigh** points you to the carnival booth. Stand on the **yellow mat** to get an aiming view, then click to throw coconuts. Knock the target down and cell 4 appears on the striped stand.
5. With all 4 cells, the door opens. The **MATCHES** are on the desk inside.
6. Walk into the **campfire** to light it.

## 📸 Snapshots

Each finished phase is frozen and still playable:

| URL | What it shows |
|---|---|
| `/snapshots/phase1/` | The island, robot hero, GPU-particle volcano, synthesized sound |
| `/snapshots/phase2/` | The puzzle chain, voiced hints, the coconut game, the fire with *Ode to Joy* |
| `/snapshots/phase3/` | Palms, the farm (wandering donkeys, code-built chickens), human NPCs, sunset to a starry night |

The main copy (`/`) is where new work happens.

## 🦙 The Asset Zoo (`zoo.html`)

**http://localhost:8000/zoo.html** is a preview page for candidate 3D models. **Use it before putting any new model into the game.** It shows each model:

- **in the game's own lighting and sky**, so you judge it as it will really look, not as it looks on a store page;
- **next to the robot hero** (1.8 m), so sizes and style mismatches are obvious;
- **with every animation playable**: click a model to see its size and a button for each animation clip.

Categories: **Characters** (robot plus 12 human variants: 2 skin tones × 3 outfits × man/woman), **Animals** (12), **Farm buildings** (13), **Crops** (102 models: 18 plants at each growth stage). You can jump straight to one with `zoo.html?cat=animals` (or `characters`, `farm`, `crops`).

It's also the quickest way to answer "does this model have a walk cycle?", "what are its animations called?", and "will this model come out the right size?" Those questions turned out to matter: converted models often come out with the wrong scale or missing materials, and the Zoo makes that visible immediately.

**To add more models to the Zoo:** put the `.glb` / `.gltf` files under `assets/` and add entries to `src/zoo_manifest.js`. It's a plain list of `{ name, url, height? }`; `height` scales characters and animals to a real-world size.

## 🔄 Adding models (Quaternius CC0 packs)

The models come from **[quaternius.com](https://quaternius.com)**. Everything there is **CC0**, meaning public domain: free to use for anything, with no credit required. This repo includes only the models the game and Zoo use (`assets/converted/`, `assets/animals/`). To convert more, download the packs from quaternius.com into `assets/quaternius/` (that folder is git-ignored; it's ~300 MB).

Only the animal pack ships in web format (glTF). Everything else is FBX/Blend and gets converted with Blender, run headless:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python tools/blender_convert.py -- assets/converted/farm "assets/quaternius/Farm Buildings - Sept 2018/FBX/"*.fbx
```

The script already fixes the three problems we hit:
- **FBX import zeroes material opacity**, which makes models invisible. The script forces materials opaque.
- **Old "Diffuse" shaders are dropped on export.** The script rebuilds them as standard shaders.
- **The people's `.blend` files point to textures on the creator's computer.** Set `TEX=<png>` to point them at a texture in the pack, and `NAME=<name>` to name the output.

After converting, check the result in the Zoo.

## 🎙️ Voices

Rory and Raleigh's lines live in **`voices/lines.json`**, the single source for both the subtitles and the voice clips. To change a line, edit it there, then regenerate the clip with Gemini TTS:

```bash
uv run tools/make_voices.py rory_intro     # remake one line
uv run tools/make_voices.py --force        # remake all of them
uv run tools/make_voices.py                # make only the missing ones
```

This uses `GEMINI_API_KEY`. The free tier allows about 3 voice requests per minute, so the script waits between lines. If a clip is missing, the game simply shows the subtitle.

## 🗂️ Code map

| File | What it does |
|---|---|
| `src/main.js` | Renderer, sky, lights, the main loop, camera swoops, demo keys |
| `src/terrain.js` | The island: `heightAt(x, z)` is the single source of truth for the ground, including the leveled outpost and farm clearings |
| `src/world.js` | Walkable ground (`groundAt`), colliders, seeded random numbers |
| `src/hero.js` / `src/camera.js` | Hero movement and animation / the orbiting follow camera |
| `src/characters.js` | Loading rigged models (robot, people, animals) and crossfading their animations |
| `src/vegetation.js` | Palms (Quaternius), code-built pines, rocks, fallen coconuts, wind sway |
| `src/volcano.js` / `src/fire.js` | GPU particle smoke, embers, and flames (night glow on the volcano plume) |
| `src/outpost.js` / `src/puzzle.js` | Site B, the booth, the campfire / the puzzle logic, NPC hints, door, matches |
| `src/coconut.js` | Aiming mode and coconut physics |
| `src/farm.js` / `src/wander.js` | The farm / gentle wandering for the donkeys and chickens |
| `src/daynight.js` | The 12-minute clock: sun, sunset, stars, moon, moonlight |
| `src/audio.js` / `src/dialogue.js` | Synthesized sound (no audio files) / voice playback and subtitles |
| `src/textures.js` | Signs, wood, concrete, and stripes, all painted in code on canvases |

**Debugging:** in the browser console, `window.__game` exposes the hero, camera, puzzle state, and day/night clock. For example, `__game.puzzle.state` shows progress, and `__game.dayNight.seconds = 700` jumps the clock.

## 📜 Credits

- 3D models: **Quaternius** ([quaternius.com](https://quaternius.com), CC0). The robot is RobotExpressive by Tomás Laulhé (Quaternius), with modifications by Don McCurdy (CC0).
- Voices: **Gemini TTS** (voices Puck and Aoede).
- *Ode to Joy*: Beethoven (public domain), played by a small synthesizer in code.
- Everything else (terrain, pines, buildings, chickens, particles, sounds, textures) is generated in code.
