// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createInputBus } from './input';
import { attachKeyboard } from './keyboard';

let detach: (() => void) | null = null;

afterEach(() => {
  detach?.();
  detach = null;
  document.body.innerHTML = '';
});

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function mount() {
  const bus = createInputBus();
  const pressed: string[] = [];
  bus.onPress((action) => pressed.push(action));
  detach = attachKeyboard(bus);
  return { bus, pressed };
}

describe('keyboard bus', () => {
  it('maps Enter and Space on the page to interact', () => {
    const { pressed } = mount();
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(press(' ').defaultPrevented).toBe(true);
    expect(pressed).toEqual(['interact', 'interact']);
  });

  it('leaves Enter and Space on a native button to the browser', () => {
    const { pressed } = mount();
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();

    expect(press('Enter', button).defaultPrevented).toBe(false);
    expect(press(' ', button).defaultPrevented).toBe(false);
    expect(pressed).toEqual([]);
  });

  it('still maps movement and z on a focused button', () => {
    const { pressed } = mount();
    const button = document.createElement('button');
    document.body.append(button);

    expect(press('ArrowRight', button).defaultPrevented).toBe(true);
    expect(press('z', button).defaultPrevented).toBe(true);
    expect(pressed).toEqual(['right', 'interact']);
  });
});
