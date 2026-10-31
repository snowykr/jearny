// Start menu (#65): a pixel-styled, read-only window over the session snapshot.
// Tabs are バッグ / クエスト / マップ / とじる; no command is ever dispatched here.
// The menu owns its DOM, styles and key listener, so the game only has to OR
// `isOpen()` into its input predicate.
import type { GameSnapshot, QuestStatus } from '../contracts';
import { ITEM } from '../contracts';
import { content } from '../content';
import { mountTownMap } from './townmap';
import type { TownMap, TownMapPlayer } from './townmap';

export interface StartMenuOptions {
  getSnapshot(): GameSnapshot;
  /** Runtime player pose for the map tab; omitted in DOM-only tests. */
  getPlayer(): TownMapPlayer | null;
  /** True while another DOM surface (dialogue, settings, modal) owns input. */
  isInputBlocked?(): boolean;
  onOpenChange?(open: boolean): void;
}

export interface StartMenu {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  dispose(): void;
}

/** Menu copy lives with the menu so Track A owns every string it renders. */
export const MENU_TEXT = {
  title: 'メニュー',
  open: 'メニューを開く',
  bag: 'バッグ',
  quest: 'クエスト',
  map: 'マップ',
  close: 'とじる',
} as const;

/** Item flavour text for the bag; unknown items fall back to the bare name. */
export const ITEM_DESCRIPTIONS: Record<string, string> = {
  [ITEM.mochi]: '松島屋で買える、やわらかくて甘いおもち。旅の途中の楽しみ。',
};

type TabId = 'bag' | 'quest' | 'map';

const TAB_IDS: readonly TabId[] = ['bag', 'quest', 'map'];

/** Game keys the menu must not leak to the scene or the keyboard bus while open. */
const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'z']);

let nextId = 0;

function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    !!el.tagName &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  );
}

const CSS = `
.jr-menu-trigger{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));bottom:calc(104px + env(safe-area-inset-bottom,0px));
  z-index:60;width:44px;height:44px;padding:0;border:3px solid #0b0c14;background:#2b2d42;color:#f7f3e6;
  box-shadow:inset -3px -3px 0 #14151f,inset 3px 3px 0 #4a4e6d;font:700 20px/1 ui-monospace,Menlo,monospace;
  cursor:pointer;image-rendering:pixelated;-webkit-tap-highlight-color:transparent}
.jr-menu-trigger[hidden]{display:none}
.jr-menu{position:fixed;inset:0;z-index:70;display:grid;place-items:center;padding:12px;box-sizing:border-box;
  background:rgba(6,8,14,.78);color:#f7f3e6;image-rendering:pixelated;
  font-family:"DotGothic16","Hiragino Kaku Gothic ProN","Noto Sans JP",ui-monospace,monospace}
.jr-menu[hidden]{display:none}
.jr-menu *,.jr-menu-trigger{box-sizing:border-box}
.jr-menu-window{width:min(520px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;
  background:#171a28;border:4px solid #0b0c14;box-shadow:0 0 0 3px #d8d2c0,8px 8px 0 rgba(0,0,0,.55)}
.jr-menu-title{margin:0;padding:8px 12px;background:#2b2d42;border-bottom:3px solid #0b0c14;color:#ffd54a;
  font-size:15px;letter-spacing:.16em}
.jr-menu-bar{display:flex;align-items:stretch;gap:4px;padding:4px;background:#1c2030;border-bottom:3px solid #0b0c14}
.jr-menu-tabs{display:flex;flex:1;flex-wrap:wrap;gap:4px}
.jr-menu-tab,.jr-menu-close{min-height:44px;padding:0 12px;border:2px solid #0b0c14;background:#232636;color:#d7d9ee;
  font:700 14px/1.2 "DotGothic16","Hiragino Kaku Gothic ProN","Noto Sans JP",ui-monospace,monospace;cursor:pointer;
  image-rendering:pixelated;-webkit-tap-highlight-color:transparent}
.jr-menu-tab{flex:1 1 auto}
.jr-menu-tab[aria-selected="true"]{background:#4d5b9a;color:#fff;box-shadow:inset 0 -4px 0 #ffd54a}
.jr-menu-close{background:#5a2f39;color:#ffe1e1}
.jr-menu-tab:hover,.jr-menu-close:hover{filter:brightness(1.15)}
.jr-menu-tab:focus-visible,.jr-menu-close:focus-visible,.jr-menu-trigger:focus-visible{outline:3px solid #ffd54a;outline-offset:2px}
.jr-menu-panel{flex:1 1 auto;overflow:auto;padding:14px 16px 18px;font-size:14px;line-height:1.7}
.jr-menu-heading{margin:12px 0 6px;font-size:13px;letter-spacing:.12em;color:#ffd479}
.jr-menu-heading:first-child{margin-top:0}
.jr-menu-money{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;background:#10131e;
  border:2px solid #0b0c14;box-shadow:inset 2px 2px 0 #232636;font-weight:700}
.jr-menu-money-value{color:#ffd54a}
.jr-menu-items{list-style:none;margin:0;padding:0}
.jr-menu-item{padding:8px 2px;border-bottom:2px dotted #3a3f58}
.jr-menu-item:last-child{border-bottom:0}
.jr-menu-item-head{display:flex;justify-content:space-between;gap:8px;font-weight:700}
.jr-menu-item-count{color:#ffd479}
.jr-menu-item-desc{margin:2px 0 0;color:#b9bdd4;font-size:13px}
.jr-menu-empty{margin:6px 0;color:#8f94ad}
.jr-menu-quest{margin-top:14px;padding-top:2px;border-top:2px solid #2b2d42}
.jr-menu-objective{margin:2px 0;font-weight:700}
.jr-menu-objective-en{margin:0;color:#9ea3bc;font-size:12px}
.jr-menu-placeholder{margin:8px 0;padding:12px;background:#10131e;border:2px solid #2b2d42;color:#d7d9ee}
.jr-menu-large .jr-menu-panel{font-size:17px;line-height:1.8}
.jr-menu-large .jr-menu-title{font-size:18px}
.jr-menu-large .jr-menu-heading{font-size:15px}
.jr-menu-large .jr-menu-tab,.jr-menu-large .jr-menu-close{font-size:16px}
.jr-menu-large .jr-menu-item-desc,.jr-menu-large .jr-menu-objective-en{font-size:15px}
`;

/** Mounts the start menu and its touch trigger into `root`. */
export function mountStartMenu(root: HTMLElement, opts: StartMenuOptions): StartMenu {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const labels = content.ui.labels;
  const menuText = MENU_TEXT;
  const uid = `jr-menu-${++nextId}`;
  const panelId = `${uid}-panel`;
  const dialogId = `${uid}-dialog`;

  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const style = make('style');
  style.dataset.jrMenu = '';
  style.textContent = CSS;

  const trigger = make('button', 'jr-menu-trigger', '☰');
  trigger.type = 'button';
  trigger.dataset.testid = 'start-menu-trigger';
  trigger.setAttribute('aria-label', menuText.open);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', dialogId);
  trigger.setAttribute('aria-expanded', 'false');

  const dialog = make('div', 'jr-menu');
  dialog.hidden = true;
  dialog.dataset.testid = 'start-menu';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.id = dialogId;
  dialog.setAttribute('aria-labelledby', `${uid}-title`);

  const windowEl = make('div', 'jr-menu-window');
  const title = make('h2', 'jr-menu-title', menuText.title);
  title.id = `${uid}-title`;

  const bar = make('div', 'jr-menu-bar');
  const tablist = make('div', 'jr-menu-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', menuText.title);

  const tabLabels: Record<TabId, string> = {
    bag: menuText.bag,
    quest: menuText.quest,
    map: menuText.map,
  };
  const tabs = {} as Record<TabId, HTMLButtonElement>;
  for (const id of TAB_IDS) {
    const tab = make('button', 'jr-menu-tab', tabLabels[id]);
    tab.type = 'button';
    tab.id = `${uid}-tab-${id}`;
    tab.dataset.tab = id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    tab.setAttribute('aria-selected', 'false');
    tabs[id] = tab;
  }

  const closeButton = make('button', 'jr-menu-close', menuText.close);
  closeButton.type = 'button';
  closeButton.dataset.testid = 'start-menu-close';

  tablist.append(tabs.bag, tabs.quest, tabs.map);
  bar.append(tablist, closeButton);

  const panel = make('div', 'jr-menu-panel');
  panel.id = panelId;
  panel.tabIndex = 0;
  panel.setAttribute('role', 'tabpanel');
  windowEl.append(title, bar, panel);
  dialog.append(windowEl);

  root.append(style, trigger, dialog);

  const isBlocked = (): boolean => opts.isInputBlocked?.() ?? false;

  // --- content -------------------------------------------------------------
  const moneyRow = (snapshot: GameSnapshot): HTMLElement => {
    const row = make('div', 'jr-menu-money');
    row.append(
      make('span', 'jr-menu-money-label', `${labels.wallet} `),
      make('span', 'jr-menu-money-value', `¥${snapshot.walletYen}`),
    );
    return row;
  };

  const questSection = (snapshot: GameSnapshot, compact: boolean): HTMLElement => {
    const section = make('section', 'jr-menu-quest');
    section.append(make('h3', 'jr-menu-heading', labels.quest));
    if (content.questOrder.length === 0) {
      section.append(make('p', 'jr-menu-empty', labels.empty));
      return section;
    }
    for (const questId of content.questOrder) {
      const status: QuestStatus = snapshot.quests[questId] ?? 'not_started';
      const objective = content.ui.objectives[status];
      const row = make('div', 'jr-menu-quest-row');
      row.append(make('p', 'jr-menu-objective', objective.ja));
      if (!compact) row.append(make('p', 'jr-menu-objective-en', objective.en));
      section.append(row);
    }
    return section;
  };

  const bagView = (snapshot: GameSnapshot): DocumentFragment => {
    const frag = doc.createDocumentFragment();
    frag.append(moneyRow(snapshot), make('h3', 'jr-menu-heading', labels.bag));

    const rows = Object.entries(snapshot.inventory).filter(([, count]) => count > 0);
    if (rows.length === 0) {
      frag.append(make('p', 'jr-menu-empty', labels.empty));
    } else {
      const list = make('ul', 'jr-menu-items');
      for (const [itemId, count] of rows) {
        const item = make('li', 'jr-menu-item');
        const head = make('div', 'jr-menu-item-head');
        head.append(
          make('span', 'jr-menu-item-name', content.ui.items[itemId] ?? itemId),
          make('span', 'jr-menu-item-count', `×${count}`),
        );
        item.append(head);
        const description = ITEM_DESCRIPTIONS[itemId];
        if (description) item.append(make('p', 'jr-menu-item-desc', description));
        list.append(item);
      }
      frag.append(list);
    }
    frag.append(questSection(snapshot, true));
    return frag;
  };

  const questView = (snapshot: GameSnapshot): DocumentFragment => {
    const frag = doc.createDocumentFragment();
    frag.append(questSection(snapshot, false));
    return frag;
  };

  // Built on first use: most sessions never open マップ, and the canvas is not free.
  let townMap: TownMap | null = null;
  const getTownMap = (): TownMap => {
    townMap ??= mountTownMap(doc, { getPlayer: opts.getPlayer, getSnapshot: opts.getSnapshot });
    return townMap;
  };

  const mapView = (): DocumentFragment => {
    const frag = doc.createDocumentFragment();
    frag.append(make('h3', 'jr-menu-heading', menuText.map));
    const map = getTownMap();
    map.refresh();
    frag.append(map.el);
    return frag;
  };

  let active: TabId = 'bag';
  const render = (): void => {
    const snapshot = opts.getSnapshot();
    dialog.classList.toggle('jr-menu-large', snapshot.settings.textSize === 'large');
    for (const id of TAB_IDS) tabs[id].setAttribute('aria-selected', String(id === active));
    panel.setAttribute('aria-labelledby', tabs[active].id);
    panel.replaceChildren(active === 'bag' ? bagView(snapshot) : active === 'quest' ? questView(snapshot) : mapView());
  };

  const setActive = (id: TabId): void => {
    active = id;
    render();
  };

  // --- open / close --------------------------------------------------------
  let openState = false;
  let previousFocus: HTMLElement | null = null;

  const focusables = (): HTMLElement[] => [tabs.bag, tabs.quest, tabs.map, closeButton, panel];

  const restoreFocus = (): void => {
    // Back to whatever opened it (keyboard, the trigger button, a screen reader),
    // falling back to the canvas only when that element is gone.
    if (previousFocus && previousFocus !== doc.body && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
      return;
    }
    const game = doc.getElementById('game');
    if (!game) return;
    // Canvas is not focusable by default; -1 keeps it out of the tab order.
    if (!game.hasAttribute('tabindex')) game.setAttribute('tabindex', '-1');
    game.focus({ preventScroll: true });
  };

  const syncTrigger = (): void => {
    // If another surface takes ownership while the menu is open (dialogue, settings,
    // completion modal), yield instead of letting two dialogs fight over keys/z-order.
    if (openState && isBlocked()) close();
    trigger.hidden = openState || isBlocked();
  };

  const open = (): void => {
    if (openState || isBlocked()) return;
    previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    openState = true;
    active = 'bag';
    dialog.hidden = false;
    trigger.hidden = true;
    trigger.setAttribute('aria-expanded', 'true');
    render();
    tabs.bag.focus({ preventScroll: true });
    opts.onOpenChange?.(true);
  };

  const close = (): void => {
    if (!openState) return;
    openState = false;
    dialog.hidden = true;
    syncTrigger();
    trigger.setAttribute('aria-expanded', 'false');
    restoreFocus();
    opts.onOpenChange?.(false);
  };

  const toggle = (): void => {
    if (openState) close();
    else open();
  };

  // --- keyboard ------------------------------------------------------------
  const trapTab = (backward: boolean): void => {
    const els = focusables();
    const index = els.findIndex((el) => el === doc.activeElement);
    const nextIndex = index < 0 ? (backward ? els.length - 1 : 0) : (index + (backward ? -1 : 1) + els.length) % els.length;
    els[nextIndex]?.focus();
  };

  const focusedTab = (): TabId | null => {
    for (const id of TAB_IDS) if (doc.activeElement === tabs[id]) return id;
    return null;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTextTarget(event.target)) return;

    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'm') {
      // The menu owns M; the minimap toggle keeps its on-screen button. Swallow
      // repeats too, so holding M cannot toggle the minimap behind the menu.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (!openState && isBlocked()) return;
      toggle();
      return;
    }

    if (!openState) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopImmediatePropagation();
      trapTab(event.shiftKey);
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      // Swallow arrows even when focus is on とじる or the panel: keyboard.ts maps them
      // to the walk bus, and a held arrow must never start walking under the menu.
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = focusedTab();
      if (!current) return;
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = TAB_IDS[(TAB_IDS.indexOf(current) + step + TAB_IDS.length) % TAB_IDS.length];
      if (next) {
        setActive(next);
        tabs[next].focus();
      }
      return;
    }

    // Let Enter/Space reach the focused button, but keep the keyboard bus from
    // pressing interact behind the menu.
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.stopImmediatePropagation();
      return;
    }

    if (MOVE_KEYS.has(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  // --- wiring --------------------------------------------------------------
  for (const id of TAB_IDS) {
    tabs[id].addEventListener('click', () => {
      setActive(id);
      tabs[id].focus();
    });
  }
  closeButton.addEventListener('click', close);
  trigger.addEventListener('click', () => {
    if (openState) return;
    open();
  });
  win?.addEventListener('keydown', onKeyDown, true);
  syncTrigger();
  const timer = win?.setInterval(syncTrigger, 100) ?? 0;

  return {
    open,
    close,
    toggle,
    isOpen: () => openState,
    dispose() {
      win?.clearInterval(timer);
      win?.removeEventListener('keydown', onKeyDown, true);
      if (openState) {
        openState = false;
        opts.onOpenChange?.(false); // teardown must not leave a stale "open" belief
      }
      townMap?.dispose();
      dialog.remove();
      trigger.remove();
      style.remove();
    },
  };
}
