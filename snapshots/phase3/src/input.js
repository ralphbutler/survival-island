// Keyboard state: held keys plus one-shot presses consumed once per frame.
const held = new Set();
const pressedThisFrame = new Set();

addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  pressedThisFrame.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

export const down = (code) => held.has(code);

export function pressed(code) {
  if (!pressedThisFrame.has(code)) return false;
  pressedThisFrame.delete(code);
  return true;
}

export function endFrame() {
  pressedThisFrame.clear();
}
