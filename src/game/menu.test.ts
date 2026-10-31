// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameSnapshot } from '../contracts';
import { ITEM, QUEST } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from '../domain';
import { ITEM_DESCRIPTIONS, MENU_TEXT, mountStartMenu } from './menu';

const labels = MENU_TEXT;

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

function mount(snap = snapshot(), isInputBlocked?: () => boolean) {
  document.body.innerHTML = '<div id="ui-root"></div><canvas id="game"></canvas>';
  const root = document.getElementById('ui-root');
  if (!root) throw new Error('missing ui root');
  const events: boolean[] = [];
  const menu = mountStartMenu(root, {
    getSnapshot: () => snap,
    ...(isInputBlocked ? { isInputBlocked } : {}),
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

  it('opens on M with the four tabs and the bag focused', () => {
    const { menu } = mount();
    const event = press('m');

    expect(event.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(true);
    expect(dialog()?.hidden).toBe(false);
    expect(buttons().map((button) => button.textContent)).toEqual([
      labels.bag,
      labels.quest,
      labels.map,
      labels.close,
    ]);
    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog()?.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe(labels.title);
    expect(buttons()[0]?.getAttribute('role')).toBe('tab');
    expect(buttons()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it('opens from the touch trigger and closes on M', () => {
    const { menu } = mount();
    trigger()?.click();
    expect(menu.isOpen()).toBe(true);

    press('m');
    expect(menu.isOpen()).toBe(false);
  });

  it('shows the wallet, items with descriptions and quest progress in バッグ', () => {
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

  it('shows the minimap placeholder in マップ', () => {
    const { menu } = mount();
    menu.open();
    click(labels.map);

    const text = dialog()?.textContent ?? '';
    expect(text).toContain(MENU_TEXT.mapPlaceholder);
    expect(text).toContain('ミニマップ');
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

  it('closes from とじる', () => {
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
    const menu = mountStartMenu(root, { getSnapshot: () => current });
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
