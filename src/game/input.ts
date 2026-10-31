// Single input path. Keyboard (#7) and touch (#20) both feed this bus;
// movement and interaction (#7, #19) only read from it.
export type Dir = 'up' | 'down' | 'left' | 'right';
export type InputAction = Dir | 'interact';

export interface InputBus {
  press(action: InputAction): void;
  release(action: InputAction): void;
  isHeld(action: InputAction): boolean;
  /** Most recently pressed direction that is still held. */
  heldDir(): Dir | null;
  onPress(cb: (action: InputAction) => void): () => void;
  /** Release everything (scene change, dialogue open, blur). */
  reset(): void;
}

export function createInputBus(): InputBus {
  const held: InputAction[] = [];
  const listeners = new Set<(a: InputAction) => void>();
  return {
    press(a) {
      if (!held.includes(a)) held.push(a);
      listeners.forEach((cb) => cb(a));
    },
    release(a) {
      const i = held.indexOf(a);
      if (i >= 0) held.splice(i, 1);
    },
    isHeld: (a) => held.includes(a),
    heldDir() {
      for (let i = held.length - 1; i >= 0; i--) if (held[i] !== 'interact') return held[i] as Dir;
      return null;
    },
    onPress(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    reset() {
      held.length = 0;
    },
  };
}
