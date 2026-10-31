import { describe, expect, it } from 'vitest';
import { createInputBus } from './input';
import { createTouchState, dirFromOffset } from './touch';

function setup() {
  const bus = createInputBus();
  const presses: string[] = [];
  bus.onPress((a) => presses.push(a));
  return { bus, presses, touch: createTouchState(bus) };
}

describe('createTouchState', () => {
  it('press and release a direction', () => {
    const { bus, touch } = setup();
    touch.down(1, 'up');
    expect(bus.isHeld('up')).toBe(true);
    expect(bus.heldDir()).toBe('up');
    touch.up(1);
    expect(bus.isHeld('up')).toBe(false);
  });

  it('sliding across directions switches direction', () => {
    const { bus, touch } = setup();
    touch.down(1, 'left');
    touch.move(1, 'up');
    expect(bus.isHeld('left')).toBe(false);
    expect(bus.heldDir()).toBe('up');
    touch.move(1, null);
    expect(bus.heldDir()).toBeNull();
  });

  it('moving within the same zone does not re-press', () => {
    const { touch, presses } = setup();
    touch.down(1, 'left');
    touch.move(1, 'left');
    touch.move(1, 'left');
    expect(presses).toEqual(['left']);
  });

  it('A taps interact while a direction is held (multi-touch)', () => {
    const { bus, touch, presses } = setup();
    touch.down(1, 'right');
    touch.down(2, 'interact');
    expect(presses).toEqual(['right', 'interact']);
    expect(bus.isHeld('right')).toBe(true);
    expect(bus.isHeld('interact')).toBe(false);
    touch.up(2); // lifting the A finger must not affect the held direction
    expect(bus.isHeld('right')).toBe(true);
  });

  it('two pointers on the same direction keep it held until both lift', () => {
    const { bus, touch } = setup();
    touch.down(1, 'down');
    touch.down(2, 'down');
    touch.up(1);
    expect(bus.isHeld('down')).toBe(true);
    touch.up(2);
    expect(bus.isHeld('down')).toBe(false);
  });

  it('sliding from the D-pad onto A releases the direction without firing', () => {
    const { bus, touch, presses } = setup();
    touch.down(1, 'up');
    touch.move(1, 'interact');
    expect(bus.isHeld('up')).toBe(false);
    expect(presses).toEqual(['up']);
  });

  it('disabling the D-pad (dialogue) releases directions, ignores new ones, keeps A', () => {
    const { bus, touch, presses } = setup();
    touch.down(1, 'left');
    touch.setDpadEnabled(false);
    expect(bus.isHeld('left')).toBe(false);
    touch.down(2, 'up');
    expect(bus.isHeld('up')).toBe(false);
    touch.down(3, 'interact');
    expect(presses).toEqual(['left', 'interact']);
    touch.setDpadEnabled(true);
    touch.down(4, 'down');
    expect(bus.heldDir()).toBe('down');
  });

  it('cancel/leave (up) and releaseAll clear everything', () => {
    const { bus, touch } = setup();
    touch.down(1, 'left');
    touch.down(2, 'up');
    touch.releaseAll();
    expect(bus.heldDir()).toBeNull();
    expect(touch.heldDirs()).toEqual([]);
    touch.up(99); // unknown pointer is harmless
  });
});

describe('dirFromOffset', () => {
  it('picks the dominant axis', () => {
    expect(dirFromOffset(20, 5, 5, 100)).toBe('right');
    expect(dirFromOffset(-20, 5, 5, 100)).toBe('left');
    expect(dirFromOffset(3, 20, 5, 100)).toBe('down');
    expect(dirFromOffset(3, -20, 5, 100)).toBe('up');
  });
  it('dead zone and out-of-range are null', () => {
    expect(dirFromOffset(1, 1, 5, 100)).toBeNull();
    expect(dirFromOffset(200, 0, 5, 100)).toBeNull();
  });
});
