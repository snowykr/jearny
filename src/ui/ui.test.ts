// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandPayload, Effect } from '../contracts';
import { ENTITY, ITEM, PORTAL } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from '../domain';
import { createSession } from '../session';
import { createMemoryStore } from '../storage';
import { mountUi } from './index';

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-jq-ui]').forEach((node) => node.remove());
});

function mount(options: { bootEffects?: Effect[] } = {}) {
  document.body.innerHTML = '<div id="ui-root"></div>';
  const root = document.getElementById('ui-root');
  if (!root) throw new Error('missing root');
  const session = createSession({
    content,
    store: createMemoryStore(),
    initial: createInitialSnapshot('ui-test', content.version),
    ...options,
  });
  const ui = mountUi(root, session);
  cleanup = ui.unmount;
  return { root, session, ui, unmount: ui.unmount };
}

const dialogueBox = (root: HTMLElement) => root.querySelector<HTMLElement>('.jq-dialogue');
const buttons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.jq-choice')];

function press(key: string, init: { repeat?: boolean } = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('dialogue overlay', () => {
  it('renders the HUD from the snapshot', () => {
    const { root } = mount();
    expect(root.textContent).toContain('¥1000');
    expect(root.textContent).toContain('ガイドに話しかける');
    expect(root.textContent).toContain('Talk to the guide at home');
    expect(dialogueBox(root)?.hidden).toBe(true);
  });

  it('opens on Interact, shows the speaker and choices, and submits Choose', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });

    const box = dialogueBox(root);
    expect(box?.hidden).toBe(false);
    expect(box?.querySelector('.jq-speaker')?.textContent).toBe('ガイド');
    const choose = buttons(root);
    expect(choose.map((button) => button.textContent)).toEqual([
      'お願いします。',
      'もう一度お願いします。',
    ]);

    choose[0]?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.quests['first-neighborhood-trip']).toBe('active');
    expect(session.snapshot.dialogue.nodeId).toBe('guide.depart');
    dialogueBox(root)?.click(); // finish the typewriter
    expect(box?.querySelector('.jq-text')?.textContent).toContain('いってらっしゃい');
  });

  it('owns the keyboard while the dialogue is open', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });

    // First Enter completes the typewriter, the second advances.
    expect(press('Enter').defaultPrevented).toBe(true);
    press('Enter');
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.nodeId).toBe('guide.depart');

    // Closing the dialogue releases the keyboard back to KAPLAY.
    press('Escape');
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.status).toBe('closed');
    expect(press('Enter').defaultPrevented).toBe(false);
    expect(dialogueBox(root)?.hidden).toBe(true);
  });

  it('moves the choice cursor with arrows', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    press('Enter'); // finish typing
    press('ArrowDown');
    const selected = buttons(root).find((button) => button.getAttribute('aria-current') === 'true');
    expect(selected?.textContent).toBe('もう一度お願いします。');
    press('Enter');
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.nodeId).toBe('guide.clarify');
  });

  it('advances a plain line on click when the typewriter is finished', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await session.dispatch({ type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' });
    dialogueBox(root)?.click(); // finish typing
    dialogueBox(root)?.click(); // advance
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.status).toBe('closed');
  });

  it('shows a toast for a rejected command', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'UsePortal', portalId: 'portal:nope' });
    expect(root.querySelector('.jq-toast')?.textContent).toBe('そこへは行けません');
  });

  it('shows the completion notice and the final wallet after the whole quest', async () => {
    const { root, session } = mount();
    const dispatch = (payload: CommandPayload) => session.dispatch(payload);
    await dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await dispatch({ type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' });
    await dispatch({ type: 'AdvanceDialogue', nodeId: 'guide.depart' });
    await dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit });
    await dispatch({ type: 'Interact', entityId: ENTITY.stationZone });
    await dispatch({ type: 'AdvanceDialogue', nodeId: 'station.directions' });
    await dispatch({ type: 'UsePortal', portalId: PORTAL.shopDoor });
    await dispatch({ type: 'Interact', entityId: ENTITY.shopkeeper });
    await dispatch({ type: 'Choose', dialogueNodeId: 'shop.welcome', choiceId: 'order' });
    await dispatch({ type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 2 });
    await dispatch({ type: 'AdvanceDialogue', nodeId: 'shop.confirm' });
    await dispatch({ type: 'UsePortal', portalId: PORTAL.shopExit });
    await dispatch({ type: 'UsePortal', portalId: PORTAL.homeDoor });
    await dispatch({ type: 'Interact', entityId: ENTITY.guide });

    const modal = root.querySelector<HTMLElement>('.jq-modal');
    expect(modal?.hidden).toBe(false);
    expect(modal?.querySelector('h2')?.textContent).toBe('クエスト達成！');
    expect(root.textContent).toContain('¥400');
    modal?.querySelector('button')?.click();
    expect(modal?.hidden).toBe(true);
  });

  it('shows the start-over prompt for an unreadable save and resets on confirm', async () => {
    const { root, session } = mount({
      bootEffects: [{ type: 'ShowHint', reason: 'save_corrupt', id: 'boot:0' }],
    });
    const modal = root.querySelector<HTMLElement>('.jq-modal');
    expect(modal?.hidden).toBe(false);
    expect(modal?.querySelector('h2')?.textContent).toBe('はじめから');

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(session.snapshot.revision).toBe(1);
    press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(modal?.hidden).toBe(true);
    expect(session.snapshot.revision).toBe(0);
  });

  it('offers only the mission quantity plus the clarification choices', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await session.dispatch({ type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' });
    await session.dispatch({ type: 'AdvanceDialogue', nodeId: 'guide.depart' });
    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.stationZone });
    await session.dispatch({ type: 'AdvanceDialogue', nodeId: 'station.directions' });
    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.shopDoor });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.shopkeeper });
    await session.dispatch({ type: 'Choose', dialogueNodeId: 'shop.welcome', choiceId: 'order' });

    expect(buttons(root).map((button) => button.textContent)).toEqual([
      '2こ ¥600',
      'もう一度お願いします。',
      'ひとつで。',
      'みっつで。',
    ]);
    buttons(root)[2]?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.nodeId).toBe('shop.wrong');
  });

  it('shows the replay button only for nodes with a published line', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    const replay = root.querySelector<HTMLButtonElement>('.jq-replay');
    expect(replay?.hidden).toBe(false);

    await session.dispatch({ type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' });
    expect(replay?.hidden).toBe(true);
  });

  it('replays without advancing or closing the dialogue', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.stationStaff });
    const replay = root.querySelector<HTMLButtonElement>('.jq-replay');
    expect(replay?.hidden).toBe(false);

    replay?.click();
    await Promise.resolve();
    expect(session.snapshot.dialogue.nodeId).toBe('station.directions');
    expect(session.snapshot.dialogue.status).toBe('showing');
  });

  it('does not reset the save when the prompt is dismissed with Escape', async () => {
    const { root, session } = mount({
      bootEffects: [{ type: 'ShowHint', reason: 'save_corrupt', id: 'boot:0' }],
    });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(session.snapshot.revision).toBe(1);

    press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The only way to unblock saving is the explicit restart, so it stays up.
    expect(root.querySelector<HTMLElement>('.jq-modal')?.hidden).toBe(false);
    expect(session.snapshot.revision).toBe(1);
  });

  it('activates the focused choice instead of the arrow cursor', async () => {
    const { root, session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    await session.dispatch({ type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' });
    await session.dispatch({ type: 'AdvanceDialogue', nodeId: 'guide.depart' });
    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.homeExit });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.stationZone });
    await session.dispatch({ type: 'AdvanceDialogue', nodeId: 'station.directions' });
    await session.dispatch({ type: 'UsePortal', portalId: PORTAL.shopDoor });
    await session.dispatch({ type: 'Interact', entityId: ENTITY.shopkeeper });
    await session.dispatch({ type: 'Choose', dialogueNodeId: 'shop.welcome', choiceId: 'order' });

    buttons(root)[3]?.focus();
    press('Enter'); // finish the typewriter
    press('Enter'); // activate the focused "みっつで。"
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.nodeId).toBe('shop.wrong');
    expect(session.snapshot.walletYen).toBe(1000);
  });

  it('toggles settings and applies the large text class', () => {
    const { root, session } = mount();
    root.querySelector<HTMLButtonElement>('.jq-hud button')?.click();
    const settings = root.querySelector<HTMLElement>('.jq-settings');
    expect(settings?.hidden).toBe(false);
    const textSize = settings?.querySelector<HTMLSelectElement>('select');
    if (textSize) {
      textSize.value = 'large';
      textSize.dispatchEvent(new Event('change'));
    }
    expect(session.snapshot.settings.textSize).toBe('large');
    expect(root.classList.contains('jq-root-large')).toBe(true);
  });

  it('keeps game keys inside the settings panel', () => {
    const { root } = mount();
    root.querySelector<HTMLButtonElement>('.jq-hud button')?.click();
    const settings = root.querySelector<HTMLElement>('.jq-settings');
    expect(settings?.hidden).toBe(false);
    (document.activeElement as HTMLElement | null)?.blur();

    const gameSaw = vi.fn();
    window.addEventListener('keydown', gameSaw);
    try {
      press('ArrowDown');
      press(' ');
      expect(gameSaw).not.toHaveBeenCalled();
      // Non-game keys (tab navigation) still reach the page.
      press('Tab');
      expect(gameSaw).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', gameSaw);
    }
    expect(settings?.hidden).toBe(false);
  });

  it('ignores auto-repeat while the dialogue owns the keyboard', async () => {
    const { session } = mount();
    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    press('Enter'); // finish the typewriter
    press('Enter', { repeat: true });
    await Promise.resolve();
    // A held Enter must not pick the first choice on its own.
    expect(session.snapshot.dialogue.nodeId).toBe('guide.intro');

    press('Enter');
    await Promise.resolve();
    await Promise.resolve();
    expect(session.snapshot.dialogue.nodeId).toBe('guide.depart');
  });

  it('does not dismiss the version-mismatch restart prompt with Escape', () => {
    const { root } = mount({
      bootEffects: [
        { type: 'ShowHint', reason: 'content_version_mismatch', id: 'boot:version' },
      ],
    });
    const modal = root.querySelector<HTMLElement>('.jq-modal');
    expect(modal?.hidden).toBe(false);

    press('Escape');
    expect(modal?.hidden).toBe(false);

    // Only the explicit restart leaves the prompt.
    press('Enter');
    expect(modal?.hidden).toBe(true);
  });

  it('owns input while a dialogue, the settings panel or a modal is open', async () => {
    const { root, session, ui } = mount();
    expect(ui.ownsInput()).toBe(false);

    root.querySelector<HTMLButtonElement>('.jq-hud button')?.click();
    expect(ui.ownsInput()).toBe(true);
    root.querySelector<HTMLButtonElement>('.jq-hud button')?.click();
    expect(ui.ownsInput()).toBe(false);

    await session.dispatch({ type: 'Interact', entityId: ENTITY.guide });
    expect(ui.ownsInput()).toBe(true);
    press('Escape');
    await Promise.resolve();
    await Promise.resolve();
    expect(ui.ownsInput()).toBe(false);
  });

  it('owns input while the completion notice is open', async () => {
    const { ui } = mount({
      bootEffects: [{ type: 'ShowHint', reason: 'save_corrupt', id: 'boot:corrupt' }],
    });
    expect(ui.ownsInput()).toBe(true);
  });

  it('removes its DOM and style on unmount', () => {
    const { root, unmount } = mount();
    expect(root.children.length).toBeGreaterThan(0);
    unmount();
    cleanup = null;
    expect(root.children.length).toBe(0);
    expect(document.head.querySelector('style[data-jq-ui]')).toBeNull();
  });
});
