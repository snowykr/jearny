// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInputBus } from './input';
import { mountTouchControls } from './touch';

const overlay = () => document.querySelector<HTMLElement>('[data-testid="touch-controls"]');

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('mountTouchControls', () => {
  it('mounts inside the given root and removes itself', () => {
    const root = document.createElement('div');
    root.id = 'ui-root';
    document.body.append(root);

    const unmount = mountTouchControls(root, createInputBus(), { isInputBlocked: () => false, force: true });

    expect(overlay()?.parentElement).toBe(root);
    expect(overlay()?.hidden).toBe(false);
    unmount();
    expect(overlay()).toBeNull();
  });

  it('hides the whole overlay while a dialogue is open so the dialogue owns taps', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    document.body.append(root);
    let open = false;

    mountTouchControls(root, createInputBus(), { isInputBlocked: () => open, force: true });
    expect(overlay()?.hidden).toBe(false);

    open = true;
    vi.advanceTimersByTime(150);
    expect(overlay()?.hidden).toBe(true);

    open = false;
    vi.advanceTimersByTime(150);
    expect(overlay()?.hidden).toBe(false);
  });

  it('does nothing on a non-touch device unless forced', () => {
    const root = document.createElement('div');
    document.body.append(root);

    mountTouchControls(root, createInputBus(), { isInputBlocked: () => false });

    expect(overlay()).toBeNull();
  });

  it('keeps the overlay itself click-through so it cannot swallow dialogue taps', () => {
    const root = document.createElement('div');
    document.body.append(root);
    mountTouchControls(root, createInputBus(), { isInputBlocked: () => false, force: true });

    const style = document.querySelector('style')?.textContent ?? '';
    expect(style).toContain('#ui-root > .jr-touch{pointer-events:none}');
  });
});
