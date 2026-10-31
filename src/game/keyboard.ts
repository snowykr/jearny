// Keyboard → InputBus. Touch (#20) feeds the same bus.
import type { InputAction, InputBus } from './input';

const KEYS: Record<string, InputAction> = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
  ' ': 'interact', enter: 'interact', z: 'interact',
};

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** Wires keydown/keyup/blur to the bus. Returns a detach function. */
export function attachKeyboard(bus: InputBus, target: Window = window): () => void {
  const onDown = (e: KeyboardEvent) => {
    const action = KEYS[e.key.toLowerCase()];
    if (!action || e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
    e.preventDefault();
    if (!e.repeat) bus.press(action); // OS key-repeat must not re-fire interact or re-tap directions
  };
  const onUp = (e: KeyboardEvent) => {
    const action = KEYS[e.key.toLowerCase()];
    if (action) bus.release(action); // always release, so keys never stick
  };
  const onBlur = () => bus.reset();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', onBlur);
  };
}
