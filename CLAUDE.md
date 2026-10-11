# 🏝️ SURVIVAL_ISLAND_WEB

Browser rebuild of Ralph's old Unity3D teaching demo "Survival Island" (walkthrough video: `~/Desktop/marioSurvivalWalkThru.mp4`; Gemini breakdown + key frames in `../WATCH_SKILL/watch_output/` and `../WATCH_SKILL/frames/`). Purpose: show colleagues (who saw the old video) what modern web techniques can do. Not a work-critical project; build a piece, look, then extend. Started 2026-10-11 in `~/Desktop/DEMO/`; published 2026-10-11 as github.com/ralphbutler/survival-island (this copy, `~/GitHub/survival-island`, is now the working copy; animal glTFs moved to `assets/animals/`; raw packs not in the repo).

## 🎯 Decisions (2026-10-11)
- three.js r170 via CDN import map, plain ES modules, no build step. Stylized low-poly look, mostly procedural.
- Original hero (not Mario): CC0 RobotExpressive (Quaternius) from the three.js examples, `assets/`.
- CC0 asset packs OK. Voices for Rory & Raleigh: Gemini TTS (phase 2). No phone support needed.
- All audio synthesized with Web Audio (no files) except NPC voices (Gemini TTS wavs).
- Phase 2 decisions: Rory & Raleigh = recoloured robots (blue / magenta); Claude drafts dialogue, Ralph edits; NO objective list (discovery only); outpost near the deck. Coconut physics hand-written (no Rapier).
- Snapshots: `snapshots/phase1/`, `phase2/` (with voices), `phase3/` (lean: only the assets the game loads -- robot, `assets/converted/`, Donkey.gltf; ~28 MB, not the 292 MB raw packs). Later work builds on the main copy.

## 🪜 Phases
1. **(built 2026-10-11; Ralph: "good", lighting + movement OK)** island terrain + sea + sky, hero (walk/run/jump/fly/wave/dance), orbit camera, volcano GPU smoke/embers + lava glow + positional sound, starting deck, title fly-around, help panel.
2. **(DONE 2026-10-11: Ralph played the full chain -- cells, coconut game, matches, fire, music all good; 8 voice clips still to generate)** Puzzle chain: Site B ("The Door Needs More Power"), Rory & Raleigh trigger spots with voiced hints + subtitles, 3 hidden power cells, battery HUD, coconut-throw minigame (physics, maybe Rapier) for cell 4, matches, light campfire + music.
3. **(DONE 2026-10-11 -- Ralph: "wonderful"; snapshot at `snapshots/phase3/`)** Farm at `FARM` clearing (Quaternius barn, coop, fence pen, Corn_4/Corn_3 field; farmer Man_ClothedDarkSkin2 + son Man_ClothedLightSkin2 @1.3 m playing Working; donkey mom + 2 foals wandering in the pen via `src/wander.js`; 6 code-built chickens pecking by the coop). Trees: Quaternius palms (PalmTree_4 with coconuts / _Harvested) on coast & low ground + code pines inland, round trees gone, fallen coconuts. Rory = Man_ClothedLightSkin1, Raleigh = Woman_LightSkin2 (no wave/dance clips: celebrate = Jump / Jump2). Day->night `src/daynight.js`: 12-min clock, sunset ~7-8 min, night ~9 min, stars + moon, same directional light becomes moonlight; hold T = 30x; `__game.dayNight.seconds = N` to jump. Demo keys (always on for now, maybe behind `?demo` later): N = night, L = `puzzle.readyToLight` (all cells, door open, matches, placed by the unlit fire). Publishing (GitHub Pages) still to do.

- **Style feedback (2026-10-11):** low-poly OK for now but Ralph prefers closer to the old game; main gripe was jagged trees (fixed). Decide the overall look BEFORE phase 2 props get built.

## 🔧 Run
`cd ~/GitHub/survival-island && python3 -m http.server 8000` then open http://localhost:8000 (needs a server: the .glb is fetched).

Voices: edit `voices/lines.json` (single source for subtitles + TTS), then `uv run tools/make_voices.py` (`--force` to remake all, or pass ids). Game falls back to subtitles-only if a .wav is missing.

## 🗺️ Code map
- `src/terrain.js` -- `heightAt(x,z)` is the single source of truth (island mask + fbm hills + volcano cone/crater + lagoon + pond); mesh is non-indexed with per-face colors; animated faceted sea.
- `src/world.js` -- `groundAt` (terrain + platforms), cylinder colliders, seeded RNG.
- `src/hero.js` -- model load/scale, animation crossfades, camera-relative movement, step/slope/deep-water rules, flying.
- `src/camera.js` -- orbit follow cam (left-drag orbit, right-drag orbit + hero faces camera, wheel zoom).
- `src/volcano.js` -- stateless GPU particles (positions computed in the vertex shader from seed + time).
- `src/vegetation.js` -- instanced trees (with shader wind sway) and faceted rocks. Trees default to smooth lumpy canopies (welded icospheres/cones + noise + smooth normals + vertical colour gradient) since Ralph disliked the jagged low-poly ones; `?trees=lowpoly` shows the originals.
- `src/audio.js` -- synthesized volcano (positional, linear falloff), waves/wind/birds bed.
- `src/characters.js` -- shared RobotExpressive load, SkeletonUtils clone per character, recolour via the "Main" material, `crossfade`.
- `src/outpost.js` -- clearing at `OUTPOST` (terrain flattened there): Site B (box-collider walls, sliding door, interior lamp/desk/matches), booth (hinged target, stand, bolt mat), campfire. `world.groundAt(x,z,y)` ignores platforms more than 1 m above y (so you aren't on the roof while inside).
- `src/puzzle.js` -- state machine, NPC hint spots (rings fade in when near), cells, door label (CSS2DRenderer), matches, fire + Ode to Joy + dances.
- `src/coconut.js` -- mat → over-shoulder aim cam (blend in main.js), click to throw, exact ballistic launch to the mouse-ray point + small wobble, 4 physics sub-steps, box/ground bounces.
- `src/dialogue.js`, `src/fire.js`, `src/textures.js` (all canvas-painted, no image files).
- Original game's controls (from its help screen, for reference): WASD/arrows, Shift run, Space jump, F fly, E/C up/down, LMB-drag orbit, RMB-drag orbit + turn char, wheel zoom, Shift+LMB pick orbit point, P return to orbiting player, H help.

## 🐞 Lessons (2026-10-11, phase 2 first run)
- Flattening the outpost made it the "flattest spot" so `findSpawn` put the deck inside the booth (camera in the booth, walls everywhere). `findSpawn` now excludes OUTPOST.r + 8.
- A fresh `SkeletonUtils.clone` of the robot measured 149 units tall in the browser (6 cm hero, invisible). `loadRobot` now measures the original once and every clone reuses that fit.
- `hero.placeAt(x, z, h, fromY)`: default counts all platforms (spawn onto the deck); pass current y to stay at ground level (else you land on a roof).
- Browsers cache the ES modules: after code changes, hard-refresh (Cmd+Shift+R).
- **Headless check recipe** (Claude can run this itself): system Chrome `--headless=new --remote-debugging-port=9333 --user-data-dir=<scratch> --enable-unsafe-swiftshader`, a ~40-line Node CDP driver (built-in WebSocket; `Network.setCacheDisabled`), `window.__game` exposes hero/camera/follow/coconut/outpost/puzzle. Teleport with placeAt, read `__game.puzzle.state`, `Page.captureScreenshot`. Full chain passed this way 2026-10-11, no console errors. Use port 8765 for a throwaway server so Ralph's 8000 is untouched.

## 🦙 Phase 3 asset exploration (2026-10-11)
- Ralph downloaded Quaternius CC0 packs into `assets/quaternius/` (Ultimate Animated Animals [has glTF], Farm Buildings, Nature Crops, Man Animated, Woman Animated [FBX/Blend only]).
- Converted with Blender 5.2 headless via `tools/blender_convert.py` into `assets/converted/{people,farm,crops}` (.glb). Gotchas fixed in the script: FBX import zeroes material alpha (models invisible) -> force opaque; people use old Diffuse BSDF (texture dropped on export) -> rebuilt as Principled; people .blend texture paths broken -> TEX env var. People textures are tiny palette PNGs; 6 variants each (skin tone x outfit colour).
- No pig or chicken in these packs (animals: Alpaca, Bull, Cow, Deer, Donkey, Fox, Horse x2, Husky, ShibaInu, Stag, Wolf). Poly Pizza has a CC0 animated Quaternius chicken.
- **Asset Zoo** preview: `zoo.html` (+ `src/zoo.js`, generated `src/zoo_manifest.js`) -- categories, click a model for size + animation buttons, robot for scale. `?cat=characters|animals|farm|crops`.
- **Voices fixed 2026-10-11:** the original clips began with the style direction spoken aloud (sounded like foreign mumbling / a second line). gemini-3.8-flash-tts reads ANY prefix aloud ("Say cheerfully:" too) and rejects system instructions; free tier = 10 clips/day. Clips were trimmed using local Whisper word timestamps (mlx-whisper, whisper-small.en) and verified; `make_voices.py` now sends only the line text and warns on suspiciously long clips. Untrimmed originals remain in the DEMO backup.
- **Audio mix 2026-10-11:** volcano base gain 0.7 (was 1.4; too loud on arrival; Ralph tuned it); drops to ~45% inside the outpost clearing (`setVolcanoZone` from main.js, smooth over 30 m) and the volcano/ambience duck while a voice line plays (`duckFor` in audio.js, called by dialogue.js). Ralph found voices hard to hear over the volcano.
