// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSnapshot } from '../contracts';
import { ITEM, QUEST } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from '../domain';
import { createInputBus } from './input';
import { attachKeyboard } from './keyboard';
import { ITEM_DESCRIPTIONS, mountStartMenu } from './menu';
import type { TownMapPlayer } from './townmap';

const labels = { title: 'メニュー', quest: 'クエスト', map: 'マップ', close: '閉じる' } as const;
// Literal copy, so a changed constant cannot make the assertions pass by construction.
const TAB_COPY = ['持ち物', 'クエスト', 'マップ', '閉じる'] as const;

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-jr-menu]').forEach((node) => node.remove());
});

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return { ...createInitialSnapshot('menu-test', content.version), ...overrides };
}

function mount(snap = snapshot(), isInputBlocked?: () => boolean, player?: TownMapPlayer | null) {
  document.body.innerHTML = '<div id="ui-root"></div><canvas id="game"></canvas>';
  const root = document.getElementById('ui-root');
  if (!root) throw new Error('missing ui root');
  const events: boolean[] = [];
  const menu = mountStartMenu(root, {
    getSnapshot: () => snap,
    ...(isInputBlocked ? { isInputBlocked } : {}),
    getPlayer: () => player ?? null,
    onOpenChange: (open) => events.push(open),
  });
  cleanup = () => menu.dispose();
  return { root, menu, events };
}

const dialog = () => document.querySelector<HTMLElement>('[data-testid="start-menu"]');
const trigger = () => document.querySelector<HTMLButtonElement>('[data-testid="start-menu-trigger"]');
const buttons = () => [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
const click = (label: string) => {
  const button = buttons().find((node) => node.textContent === label);
  if (!button) throw new Error(`missing button ${label}`);
  button.click();
  return button;
};

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('start menu', () => {
  it('is closed by default', () => {
    const { menu } = mount();
    expect(menu.isOpen()).toBe(false);
    expect(dialog()?.hidden).toBe(true);
    expect(trigger()?.hidden).toBe(false);
  });

  it('opens on M with the four tabs and the map focused', () => {
    const { menu } = mount();
    const event = press('m');

    expect(event.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(true);
    expect(dialog()?.hidden).toBe(false);
    expect(buttons().map((button) => button.textContent)).toEqual([...TAB_COPY]);
    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog()?.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe(labels.title);
    const mapTab = buttons().find((button) => button.textContent === labels.map);
    expect(mapTab?.getAttribute('role')).toBe('tab');
    // M is the map shortcut: it must not drop the player on バッグ.
    expect(mapTab?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(mapTab);
    expect(dialog()?.querySelector('.jr-menu-panel')?.textContent).toContain(labels.map);
  });

  it('opens from the touch trigger and closes on M', () => {
    const { menu } = mount();
    trigger()?.click();
    expect(menu.isOpen()).toBe(true);

    press('m');
    expect(menu.isOpen()).toBe(false);
  });

  it('gives the scrollable panel the same focus ring as the tabs', () => {
    const { menu } = mount();
    const panel = () => document.querySelector<HTMLElement>('.jr-menu-panel');
    expect(panel()).not.toBeNull();
    menu.open();
    expect(document.activeElement).toBe(buttons().find((b) => b.textContent === TAB_COPY[0]));
    // jsdom does not resolve :focus-visible, so pin the rule that draws the ring
    // instead of the computed outline.
    const css = document.querySelector('style[data-jr-menu]')?.textContent ?? '';
    expect(css).toContain('.jr-menu-panel:focus-visible');
  });

  it('falls back to the canvas when the opener is hidden by the yield path', async () => {
    let blocked = false;
    const { menu } = mount(undefined, () => blocked);
    trigger()?.focus();
    trigger()?.click();
    expect(menu.isOpen()).toBe(true);

    // Another surface takes ownership: the menu closes and the trigger hides.
    blocked = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(menu.isOpen()).toBe(false);
    expect(trigger()?.hidden).toBe(true);
    // Focus must not land on the now-invisible trigger.
    expect(document.activeElement).toBe(document.getElementById('game'));
  });

  it('shows the wallet, items with descriptions and quest progress in 持ち物', () => {
    const description = ITEM_DESCRIPTIONS[ITEM.mochi] ?? '';
    expect(description).not.toBe('');
    const { menu } = mount(
      snapshot({
        walletYen: 750,
        inventory: { [ITEM.mochi]: 2 },
        quests: { [QUEST.firstTrip]: 'active' },
      }),
    );
    menu.open();

    const text = dialog()?.textContent ?? '';
    expect(text).toContain('所持金 ¥750');
    expect(text).toContain(content.ui.items[ITEM.mochi]);
    expect(text).toContain(description);
    expect(text).toContain('×2');
    expect(text).toContain(content.ui.objectives.active.ja);
  });

  it('shows the HUD objective wording in クエスト', () => {
    const { menu } = mount(snapshot({ quests: { [QUEST.firstTrip]: 'ready_to_return' } }));
    menu.open();
    click(labels.quest);

    const text = dialog()?.textContent ?? '';
    expect(text).toContain(content.ui.objectives.ready_to_return.ja);
    expect(text).toContain(content.ui.objectives.ready_to_return.en);
    expect(text).not.toContain('¥');
    expect(buttons().find((button) => button.textContent === labels.quest)?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('shows the full town map in マップ', () => {
    // jsdom has no canvas backend; the map panel must still mount and lay itself out.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
    try {
      const { menu } = mount(snapshot(), undefined, { sceneId: 'takanawa', tile: [64, 48], facing: 'left' });
      menu.open();
      click(labels.map);

      const map = dialog()?.querySelector('[data-testid="town-map"]');
      expect(map).not.toBeNull();
      expect(map?.querySelector('canvas')?.width).toBe(128 * 3);
      expect(dialog()?.textContent).toContain('泉岳寺');
      expect(dialog()?.textContent).not.toContain('準備中');
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it('closes on Escape and returns focus to the game canvas', () => {
    const { menu } = mount();
    menu.open();
    expect(document.activeElement).toBe(buttons()[0]);

    const event = press('Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(false);
    expect(dialog()?.hidden).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('game'));
  });

  it('closes from 閉じる', () => {
    const { menu } = mount();
    menu.open();
    click(labels.close);

    expect(menu.isOpen()).toBe(false);
    expect(dialog()?.hidden).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('game'));
  });

  it('traps Tab and Shift+Tab inside the dialog', () => {
    const { menu } = mount();
    menu.open();
    const [bag, quest, map, close] = buttons();
    const panel = dialog()?.querySelector<HTMLElement>('.jr-menu-panel');

    const forward = press('Tab');
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(quest);
    press('Tab');
    expect(document.activeElement).toBe(map);
    press('Tab');
    expect(document.activeElement).toBe(close);
    press('Tab');
    expect(document.activeElement).toBe(panel);

    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(close);
    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(map);
  });

  it('loads the snapshot again each time it opens', () => {
    let current = snapshot({ walletYen: 100 });
    document.body.innerHTML = '<div id="ui-root"></div><canvas id="game"></canvas>';
    const root = document.getElementById('ui-root');
    if (!root) throw new Error('missing ui root');
    const menu = mountStartMenu(root, { getSnapshot: () => current, getPlayer: () => null });
    cleanup = () => menu.dispose();

    menu.open();
    expect(dialog()?.textContent).toContain('¥100');
    menu.close();

    current = snapshot({ walletYen: 420 });
    menu.open();
    expect(dialog()?.textContent).toContain('¥420');
  });

  it('does not open while another surface owns input', () => {
    let blocked = true;
    const { menu } = mount(undefined, () => blocked);

    press('m');
    trigger()?.click();
    expect(menu.isOpen()).toBe(false);

    blocked = false;
    press('m');
    expect(menu.isOpen()).toBe(true);
  });

  it('reports open/close changes and removes its DOM on dispose', () => {
    const { menu, events } = mount();
    menu.toggle();
    menu.close();
    expect(events).toEqual([true, false]);

    menu.dispose();
    cleanup = null;
    expect(dialog()).toBeNull();
    expect(trigger()).toBeNull();
    expect(document.querySelector('style[data-jr-menu]')).toBeNull();
  });

  it('stops the M key before it can reach the minimap toggle', () => {
    mount();
    const bubble = vi.fn();
    window.addEventListener('keydown', bubble);
    const event = new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    window.removeEventListener('keydown', bubble);

    expect(bubble).not.toHaveBeenCalled();
  });

  it('swallows arrows while open even when focus is not on a tab', () => {
    const { menu } = mount();
    menu.open();
    const close = dialog()?.querySelector<HTMLElement>('[data-testid="start-menu-close"]');
    close?.focus();

    const event = press('ArrowRight');

    expect(event.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(true);
  });

  it('leaves game keys alone while closed', () => {
    mount();
    const event = press('ArrowLeft');
    expect(event.defaultPrevented).toBe(false);
  });

  it('applies the large-text setting from the snapshot', () => {
    const { menu } = mount(snapshot({ settings: { ...snapshot().settings, textSize: 'large' } }));
    menu.open();
    expect(dialog()?.classList.contains('jr-menu-large')).toBe(true);
    const title = dialog()?.querySelector<HTMLElement>('.jr-menu-title');
    if (!title) throw new Error('missing title');
    expect(getComputedStyle(title).fontSize).toBe('18px');
  });

  it('closes when another surface takes ownership', async () => {
    let blocked = false;
    const { menu } = mount(undefined, () => blocked);
    menu.open();
    expect(menu.isOpen()).toBe(true);

    blocked = true;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(menu.isOpen()).toBe(false);
  });
});

describe('menu edge cases', () => {
  it('shows the empty-bag copy when the inventory is empty', () => {
    const { menu } = mount(snapshot({ inventory: {} }));
    menu.open();
    expect(dialog()?.querySelector('.jr-menu-empty')?.textContent).toBe('なし');
  });

  it('swallows held M without toggling twice', () => {
    const { menu } = mount();
    const held = press('m', { repeat: true });
    expect(menu.isOpen()).toBe(false);
    expect(held.defaultPrevented).toBe(true);
    press('m');
    expect(menu.isOpen()).toBe(true);
    const repeat = press('m', { repeat: true });
    expect(menu.isOpen()).toBe(true);
    expect(repeat.defaultPrevented).toBe(true);
  });

  it('keeps every game key off the InputBus and lets Up/Down scroll natively', () => {
    const bus = createInputBus();
    const pressed: string[] = [];
    bus.onPress((action) => pressed.push(action));
    const off = attachKeyboard(bus);
    try {
      const { menu } = mount();
      menu.open();
      const tab = dialog()?.querySelector<HTMLElement>('.jr-menu-tab');
      const panel = dialog()?.querySelector<HTMLElement>('.jr-menu-panel');
      if (!tab || !panel) throw new Error('missing tab/panel');
      const dispatch = (target: HTMLElement, key: string) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event;
      };
      for (const key of ['ArrowRight', 'ArrowLeft', 'w', 'a', 's', 'd', 'z', 'Enter', ' ']) dispatch(tab, key);
      expect(pressed).toEqual([]);
      // Vertical arrows must not be prevented: the focused panel still scrolls.
      panel.focus();
      expect(dispatch(panel, 'ArrowDown').defaultPrevented).toBe(false);
      expect(dispatch(panel, 'ArrowUp').defaultPrevented).toBe(false);
      expect(pressed).toEqual([]);
    } finally {
      off();
    }
  });
});

describe('menu accessibility contracts', () => {
  it('returns focus to the trigger that opened it, not the canvas', () => {
    const { menu } = mount();
    const button = trigger();
    if (!button) throw new Error('missing trigger');
    button.focus(); // a real click focuses the button before its handler runs
    button.click();
    expect(menu.isOpen()).toBe(true);
    press('Escape');
    expect(document.activeElement).toBe(button);
  });

  it('does not restore focus to the trigger that the yield path hid', async () => {
    let blocked = false;
    const { menu } = mount(undefined, () => blocked);
    const button = trigger();
    if (!button) throw new Error('missing trigger');
    button.focus();
    button.click();
    blocked = true;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(menu.isOpen()).toBe(false);
    expect(button.hidden).toBe(true);
    expect(document.activeElement).not.toBe(button);
    expect(document.activeElement?.id).toBe('game');
  });

  it('gives the tabbed panel the same focus ring as the tabs', () => {
    mount();
    const css = document.querySelector('style[data-jr-menu]')?.textContent ?? '';
    expect(css).toContain('.jr-menu-panel:focus-visible');
  });

  it('keeps the scrolling panel in the tab order after the last button', () => {
    const { menu } = mount();
    menu.open();
    const panel = dialog()?.querySelector<HTMLElement>('.jr-menu-panel');
    expect(panel?.tabIndex).toBe(0);
    const close = dialog()?.querySelector<HTMLElement>('[data-testid="start-menu-close"]');
    close?.focus();
    press('Tab');
    expect(document.activeElement).toBe(panel);
  });

  it('reports closed when disposed while open', () => {
    const { menu, events } = mount();
    menu.open();
    menu.dispose();
    cleanup = null;
    expect(events).toEqual([true, false]);
  });
});
