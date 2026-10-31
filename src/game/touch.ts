// On-screen D-pad + A button (#20). Pointer events feed the shared InputBus,
// the same path the keyboard uses. The pointer->bus logic is a pure state
// machine (createTouchState) so it can be tested without a DOM.
import type { Dir, InputBus } from './input';

export type TouchZone = Dir | 'interact' | null;

export interface TouchState {
  /** A pointer touched a zone (D-pad direction, A button, or nothing). */
  down(pointerId: number, zone: TouchZone): void;
  /** A pointer slid onto another zone (or off the controls). */
  move(pointerId: number, zone: TouchZone): void;
  /** Pointer released, cancelled or left. */
  up(pointerId: number): void;
  /** While false, D-pad pointers are released and ignored; A keeps working. */
  setDpadEnabled(enabled: boolean): void;
  /** Release everything (blur, unmount). */
  releaseAll(): void;
  /** Directions currently held by touch. */
  heldDirs(): Dir[];
}

export function createTouchState(input: InputBus): TouchState {
  // pointerId -> direction it currently holds (D-pad only; A is tap-style).
  const holding = new Map<number, Dir>();
  let dpadEnabled = true;

  const stillHeld = (d: Dir) => [...holding.values()].includes(d);

  function setPointerDir(id: number, next: Dir | null) {
    const prev = holding.get(id) ?? null;
    if (prev === next) return;
    if (prev) {
      holding.delete(id);
      if (!stillHeld(prev)) input.release(prev);
    }
    if (next) {
      holding.set(id, next);
      input.press(next);
    }
  }

  function apply(id: number, zone: TouchZone, isDown: boolean) {
    if (zone === 'interact') {
      // Sliding from the D-pad onto A releases the direction; only a fresh
      // touch fires the action.
      setPointerDir(id, null);
      if (isDown) {
        input.press('interact');
        input.release('interact');
      }
      return;
    }
    setPointerDir(id, zone && dpadEnabled ? zone : null);
  }

  return {
    down: (id, zone) => apply(id, zone, true),
    move: (id, zone) => apply(id, zone, false),
    up: (id) => setPointerDir(id, null),
    setDpadEnabled(enabled) {
      dpadEnabled = enabled;
      if (!enabled) for (const id of [...holding.keys()]) setPointerDir(id, null);
    },
    releaseAll() {
      for (const id of [...holding.keys()]) setPointerDir(id, null);
    },
    heldDirs: () => [...new Set(holding.values())],
  };
}

/**
 * Map a touch offset from the D-pad centre to a direction. Returns null inside
 * the dead zone or beyond `maxRadius` (finger slid off the pad).
 */
export function dirFromOffset(dx: number, dy: number, deadZone: number, maxRadius: number): Dir | null {
  const dist = Math.hypot(dx, dy);
  if (dist < deadZone || dist > maxRadius) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export interface TouchOptions {
  isDialogueOpen: () => boolean;
  force?: boolean;
}

const BTN = 56; // px; hit targets are >= 48
const PAD = BTN * 3;

const CSS = `
.jr-touch{position:fixed;inset:0;z-index:50;pointer-events:none;user-select:none;-webkit-user-select:none;
  -webkit-touch-callout:none;touch-action:none;font-family:ui-monospace,Menlo,monospace;image-rendering:pixelated}
.jr-touch *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;touch-action:none}
/* index.html sets #ui-root > * { pointer-events: auto }; the overlay itself must stay click-through. */
#ui-root > .jr-touch{pointer-events:none}
.jr-touch[hidden]{display:none}
.jr-dpad{position:absolute;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));
  width:${PAD}px;height:${PAD}px;pointer-events:auto}
.jr-dpad[hidden]{display:none}
.jr-dpad i{position:absolute;width:${BTN}px;height:${BTN}px;background:#2b2d42;border:3px solid #0b0c14;
  box-shadow:inset -3px -3px 0 #14151f,inset 3px 3px 0 #4a4e6d;opacity:.85;color:#d7d9ee;font:700 18px/${BTN - 6}px ui-monospace,monospace;text-align:center}
.jr-dpad i.on{background:#6c71a3;box-shadow:inset 3px 3px 0 #14151f}
.jr-dpad .u{left:${BTN}px;top:0}.jr-dpad .d{left:${BTN}px;top:${BTN * 2}px}
.jr-dpad .l{left:0;top:${BTN}px}.jr-dpad .r{left:${BTN * 2}px;top:${BTN}px}
.jr-dpad .c{left:${BTN}px;top:${BTN}px;opacity:.6}
.jr-a{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));
  width:${BTN + 16}px;height:${BTN + 16}px;border-radius:50%;pointer-events:auto;background:#c0392b;color:#fff;
  border:3px solid #0b0c14;box-shadow:inset -4px -4px 0 #8e2a20,inset 4px 4px 0 #e5695c;opacity:.9;
  font:700 26px/1 ui-monospace,monospace;display:flex;align-items:center;justify-content:center;padding:0}
.jr-a.on{box-shadow:inset 4px 4px 0 #8e2a20;background:#a93226}
`;

const ARROWS: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
const CLS: Record<Dir, string> = { up: 'u', down: 'd', left: 'l', right: 'r' };

function shouldShow(force?: boolean): boolean {
  if (force) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Mount the touch overlay. Returns an unmount function. No-op on non-touch devices unless `force`. */
export function mountTouchControls(root: HTMLElement, input: InputBus, opts: TouchOptions): () => void {
  if (!shouldShow(opts.force)) return () => {};

  const doc = root.ownerDocument;
  const state = createTouchState(input);

  const style = doc.createElement('style');
  style.textContent = CSS;

  const overlay = doc.createElement('div');
  overlay.className = 'jr-touch';
  overlay.dataset.testid = 'touch-controls';

  const dpad = doc.createElement('div');
  dpad.className = 'jr-dpad';
  dpad.dataset.testid = 'touch-dpad';
  const cells = {} as Record<Dir, HTMLElement>;
  for (const d of ['up', 'down', 'left', 'right'] as Dir[]) {
    const el = doc.createElement('i');
    el.className = CLS[d];
    el.textContent = ARROWS[d];
    cells[d] = el;
    dpad.appendChild(el);
  }
  const centre = doc.createElement('i');
  centre.className = 'c';
  dpad.appendChild(centre);

  const aBtn = doc.createElement('button');
  aBtn.type = 'button';
  aBtn.className = 'jr-a';
  aBtn.dataset.testid = 'touch-a';
  aBtn.textContent = 'A';
  aBtn.setAttribute('aria-label', 'Action');

  overlay.append(dpad, aBtn);
  root.append(style, overlay);

  const paint = () => {
    const held = state.heldDirs();
    for (const d of Object.keys(cells) as Dir[]) cells[d].classList.toggle('on', held.includes(d));
  };

  // --- D-pad: one element captures the pointer, so slides across directions keep working.
  const zoneAt = (e: PointerEvent): TouchZone => {
    const r = dpad.getBoundingClientRect();
    return dirFromOffset(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), BTN * 0.3, PAD * 0.9);
  };
  const dpadDown = (e: PointerEvent) => {
    e.preventDefault();
    try { dpad.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    state.down(e.pointerId, zoneAt(e));
    paint();
  };
  const dpadMove = (e: PointerEvent) => {
    e.preventDefault();
    state.move(e.pointerId, zoneAt(e));
    paint();
  };
  const dpadUp = (e: PointerEvent) => {
    state.up(e.pointerId);
    paint();
  };
  dpad.addEventListener('pointerdown', dpadDown);
  dpad.addEventListener('pointermove', (e) => { if (dpad.hasPointerCapture?.(e.pointerId) ?? true) dpadMove(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) dpad.addEventListener(t, dpadUp);

  // --- A: tap -> press + release.
  aBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.down(e.pointerId, 'interact');
    aBtn.classList.add('on');
  });
  const aOff = () => aBtn.classList.remove('on');
  for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) aBtn.addEventListener(t, aOff);

  // Block context menu / scroll gestures over the controls.
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Dialogue: the dialogue UI owns every tap while it is open, and its panel sits where the
  // A button would paint, so hide the whole overlay instead of leaving a control on top of it.
  let lastOpen: boolean | null = null;
  const syncDialogue = () => {
    const open = opts.isDialogueOpen();
    if (open === lastOpen) return;
    lastOpen = open;
    overlay.hidden = open;
    state.setDpadEnabled(!open);
    paint();
  };
  syncDialogue();
  const timer = setInterval(syncDialogue, 100);

  const onBlur = () => { state.releaseAll(); paint(); };
  const win = doc.defaultView;
  win?.addEventListener('blur', onBlur);

  return () => {
    clearInterval(timer);
    win?.removeEventListener('blur', onBlur);
    state.releaseAll();
    overlay.remove();
    style.remove();
  };
}

