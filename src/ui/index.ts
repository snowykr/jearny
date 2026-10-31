// DOM UI (docs/ARCHITECTURE.md §4). Renders the snapshot and submits commands;
// it owns no quest or inventory state. No KAPLAY imports.
import type { Effect, GameSession, GameSnapshot } from '../contracts';
import { content as gameContent } from '../content';
import { applyAudioSettings, replayAudio, stopAudio } from '../audio';
import { UI_STYLES } from './styles';
import {
  currentNode,
  dialogueKeyAction,
  hintText,
  inventoryRows,
  objectiveText,
  speakerName,
  typingDone,
  typingStep,
  visibleChoices,
  type ChoiceView,
} from './view';

const TYPE_STEP_MS = 24;
const TOAST_MS = 2400;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function injectStyles(root: HTMLElement): HTMLStyleElement {
  const existing = root.ownerDocument.querySelector<HTMLStyleElement>('style[data-jq-ui]');
  if (existing) return existing;
  const style = document.createElement('style');
  style.dataset.jqUi = '';
  style.textContent = UI_STYLES;
  document.head.append(style);
  return style;
}

export function mountUi(root: HTMLElement, session: GameSession): () => void {
  const labels = gameContent.ui.labels;
  const style = injectStyles(root);
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- HUD -----------------------------------------------------------------
  const hud = element('div', 'jq-hud');
  const hudTitle = element('div', 'jq-hud-title', gameContent.ui.title);
  const walletRow = element('div', 'jq-hud-row');
  const wallet = element('span');
  const bag = element('div', 'jq-bag');
  const quest = element('div');
  const settingsButton = element('button', undefined, labels.settings);
  settingsButton.type = 'button';
  walletRow.append(wallet);
  hud.append(hudTitle, walletRow, bag, quest, settingsButton);

  // --- dialogue ------------------------------------------------------------
  const dialogue = element('div', 'jq-dialogue');
  dialogue.setAttribute('role', 'dialog');
  const speaker = element('div', 'jq-speaker');
  speaker.id = 'jq-dialogue-speaker';
  dialogue.setAttribute('aria-labelledby', speaker.id);
  const textEl = element('p', 'jq-text');
  const choicesEl = element('div', 'jq-choices');
  const cue = element('span', 'jq-cue', '▼');
  const replay = element('button', 'jq-replay', labels.replay);
  replay.type = 'button';
  const live = element('p', 'jq-sr');
  live.setAttribute('aria-live', 'polite');
  dialogue.append(speaker, textEl, replay, choicesEl, cue, live);
  dialogue.hidden = true;

  // --- toast / settings / modal -------------------------------------------
  const toast = element('div', 'jq-toast');
  toast.hidden = true;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const settings = element('div', 'jq-settings');
  settings.hidden = true;
  const muteLabel = element('label');
  const mute = element('input');
  mute.type = 'checkbox';
  muteLabel.append(element('span', undefined, labels.mute), mute);
  const volumeLabel = element('label');
  const volume = element('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.1';
  volumeLabel.append(element('span', undefined, labels.volume), volume);
  const textSizeLabel = element('label');
  const textSize = element('select');
  for (const [value, label] of [
    ['normal', labels.normal],
    ['large', labels.large],
  ] as const) {
    const option = element('option', undefined, label);
    option.value = value;
    textSize.append(option);
  }
  textSizeLabel.append(element('span', undefined, labels.textSize), textSize);
  const inputModeLabel = element('label');
  const inputMode = element('select');
  for (const [value, label] of [
    ['keyboard', labels.keyboard],
    ['touch', labels.touch],
  ] as const) {
    const option = element('option', undefined, label);
    option.value = value;
    inputMode.append(option);
  }
  inputModeLabel.append(element('span', undefined, labels.inputMode), inputMode);
  const settingsClose = element('button', undefined, labels.close);
  settingsClose.type = 'button';
  settings.append(muteLabel, volumeLabel, textSizeLabel, inputModeLabel, settingsClose);

  const modal = element('div', 'jq-modal');
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const modalCard = element('div', 'jq-modal-card');
  const modalTitle = element('h2');
  modalTitle.id = 'jq-modal-title';
  modal.setAttribute('aria-labelledby', modalTitle.id);
  const modalBody = element('p');
  const modalButton = element('button');
  modalButton.type = 'button';
  modalCard.append(modalTitle, modalBody, modalButton);
  modal.append(modalCard);

  root.append(hud, dialogue, toast, settings, modal);

  // --- state ---------------------------------------------------------------
  let nodeId: string | null = null;
  let text = '';
  let shown = 0;
  let selected = 0;
  let announced = '';
  let modalOpen = false;
  let modalAction: (() => void) | null = null;
  let modalDismissable = true;
  let toastTimer = 0;

  const renderText = (): void => {
    textEl.textContent = text.slice(0, shown);
    cue.hidden = !typingDone(text, shown);
    if (typingDone(text, shown) && announced !== text) {
      live.textContent = text;
      announced = text;
    }
  };

  const renderChoices = (snapshot: GameSnapshot): void => {
    const choices = visibleChoices(snapshot, gameContent);
    if (selected >= choices.length) selected = Math.max(0, choices.length - 1);
    choicesEl.replaceChildren();
    choices.forEach((choice, index) => {
      const label = choice.kind === 'buy' ? `${choice.label} ¥${choice.priceYen}` : choice.label;
      const button = element('button', 'jq-choice', label);
      button.type = 'button';
      button.disabled = choice.kind === 'buy' && choice.disabled;
      button.setAttribute('aria-current', String(index === selected));
      button.addEventListener('focus', () => {
        // The keyboard cursor follows DOM focus so Enter activates what is focused.
        selected = index;
        for (const [childIndex, child] of [...choicesEl.children].entries()) {
          child.setAttribute('aria-current', String(childIndex === selected));
        }
      });
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        activate(choice);
      });
      choicesEl.append(button);
    });
  };

  const syncDialogue = (snapshot: GameSnapshot, effects: Effect[]): void => {
    const node = currentNode(snapshot, gameContent);
    if (!node) {
      dialogue.hidden = true;
      nodeId = null;
      text = '';
      shown = 0;
      return;
    }
    dialogue.hidden = false;
    const reentered = effects.some(
      (effect) => effect.type === 'ShowDialogue' && effect.nodeId === node.id,
    );
    if (nodeId !== node.id || reentered) {
      nodeId = node.id;
      text = node.displayText;
      shown = reducedMotion ? text.length : 0;
      selected = 0;
      announced = '';
    }
    speaker.textContent = speakerName(snapshot, gameContent);
    replay.hidden = !node.lineId;
    replay.onclick = (event) => {
      // The button lives inside the click-to-advance box; never advance it.
      event.stopPropagation();
      if (node.lineId) replayAudio(node.lineId);
    };
    renderText();
    renderChoices(snapshot);
  };

  const render = (snapshot: GameSnapshot, effects: Effect[]): void => {
    applyAudioSettings(snapshot.settings);
    root.classList.toggle('jq-root-large', snapshot.settings.textSize === 'large');
    wallet.textContent = `${labels.wallet} ¥${snapshot.walletYen}`;
    const rows = inventoryRows(snapshot, gameContent);
    bag.textContent = `${labels.bag}: ${
      rows.length > 0 ? rows.map((row) => `${row.label}×${row.count}`).join('  ') : labels.empty
    }`;
    const objective = objectiveText(snapshot, gameContent);
    quest.textContent = `${labels.quest}: ${objective.ja}`;
    quest.title = objective.en;
    mute.checked = snapshot.settings.muted;
    volume.value = String(snapshot.settings.volume);
    textSize.value = snapshot.settings.textSize;
    inputMode.value = snapshot.settings.inputMode;
    syncDialogue(snapshot, effects);
    for (const effect of effects) handleEffect(effect, snapshot);
  };

  const showToast = (message: string): void => {
    toast.hidden = false;
    // Fill after the live region becomes visible, otherwise it is not announced.
    queueMicrotask(() => {
      toast.textContent = message;
    });
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, TOAST_MS);
  };

  const openModal = (
    title: string,
    body: string,
    action: string,
    onAction?: () => void,
    dismissable = true,
  ): void => {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modalButton.textContent = action;
    modalAction = onAction ?? closeModal;
    modalDismissable = dismissable;
    modal.hidden = false;
    modalOpen = true;
    modalButton.focus();
  };

  const closeModal = (): void => {
    modal.hidden = true;
    modalOpen = false;
  };

  const handleEffect = (effect: Effect, snapshot: GameSnapshot): void => {
    if (effect.type === 'ShowHint') {
      if (effect.reason === 'content_version_mismatch' || effect.reason === 'save_corrupt') {
        openModal(labels.startOver, hintText(effect.reason, gameContent), labels.startOver, () => {
          void session.reset?.();
        }, false);
      } else {
        showToast(hintText(effect.reason, gameContent));
      }
      return;
    }
    if (effect.type === 'CompleteQuest') {
      openModal(labels.questComplete, objectiveText(snapshot, gameContent).ja, labels.close);
    }
  };

  const advance = (snapshot: GameSnapshot): void => {
    const node = currentNode(snapshot, gameContent);
    if (!node) return;
    stopAudio();
    void session.dispatch({ type: 'AdvanceDialogue', nodeId: node.id });
  };

  const activate = (choice: ChoiceView): void => {
    if (choice.kind === 'buy' && choice.disabled) return;
    if (choice.kind === 'choice') {
      stopAudio();
      void session.dispatch({
        type: 'Choose',
        dialogueNodeId: nodeId ?? '',
        choiceId: choice.id,
      });
      return;
    }
    void session.dispatch({
      type: 'Buy',
      shopId: choice.shopId,
      itemId: choice.itemId,
      quantity: choice.quantity,
    });
  };

  const intercept = (event: KeyboardEvent): void => {
    const snapshot = session.snapshot;
    if (modalOpen) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        const run = modalAction;
        closeModal();
        run?.();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // A save-policy prompt is the only way to unblock saving; keep it open.
        if (modalDismissable) closeModal();
      }
      return;
    }
    if (!settings.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        settings.hidden = true;
      }
      return;
    }
    if (!currentNode(snapshot, gameContent)) return;
    // The replay control owns its own activation; the dialogue must not eat it.
    if (event.target instanceof Node && replay.contains(event.target)) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') return;
    }

    const navigation = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!navigation.includes(event.key) && !['Enter', ' ', 'Spacebar', 'Escape'].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      const node = currentNode(snapshot, gameContent);
      if (node) {
        stopAudio();
        void session.dispatch({ type: 'CloseDialogue', nodeId: node.id });
      }
      return;
    }
    if (!typingDone(text, shown)) {
      shown = text.length;
      renderText();
      return;
    }
    const choices = visibleChoices(snapshot, gameContent);
    if (choices.length > 0) {
      const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
      if (navigation.includes(event.key)) {
        selected = (selected + delta + choices.length) % choices.length;
        renderChoices(snapshot);
        return;
      }
    }
    const action = dialogueKeyAction(snapshot, gameContent, selected);
    if (action.type === 'advance') advance(snapshot);
    else if (action.type === 'choose') activate(action.choice);
  };

  const onKeyDown = (event: KeyboardEvent): void => intercept(event);

  // --- wiring --------------------------------------------------------------
  settingsButton.addEventListener('click', () => {
    settings.hidden = !settings.hidden;
  });
  settingsClose.addEventListener('click', () => {
    settings.hidden = true;
  });
  mute.addEventListener('change', () => session.updateSettings({ muted: mute.checked }));
  volume.addEventListener('change', () => session.updateSettings({ volume: Number(volume.value) }));
  textSize.addEventListener('change', () => {
    session.updateSettings({ textSize: textSize.value === 'large' ? 'large' : 'normal' });
  });
  inputMode.addEventListener('change', () => {
    session.updateSettings({ inputMode: inputMode.value === 'touch' ? 'touch' : 'keyboard' });
  });
  modalButton.addEventListener('click', () => {
    const run = modalAction;
    closeModal();
    run?.();
  });
  dialogue.addEventListener('click', () => {
    const snapshot = session.snapshot;
    const node = currentNode(snapshot, gameContent);
    if (!node) return;
    if (!typingDone(text, shown)) {
      shown = text.length;
      renderText();
      return;
    }
    if (visibleChoices(snapshot, gameContent).length === 0) advance(snapshot);
  });
  root.addEventListener(
    'touchstart',
    () => {
      if (session.snapshot.settings.inputMode !== 'touch') session.updateSettings({ inputMode: 'touch' });
    },
    { once: true, passive: true },
  );
  window.addEventListener('keydown', onKeyDown, true);

  const timer = window.setInterval(() => {
    if (!text || typingDone(text, shown)) return;
    shown = typingStep(text, shown, 2);
    renderText();
  }, TYPE_STEP_MS);

  const unsubscribe = session.subscribe(render);

  return () => {
    unsubscribe();
    window.clearInterval(timer);
    window.clearTimeout(toastTimer);
    window.removeEventListener('keydown', onKeyDown, true);
    for (const node of [hud, dialogue, toast, settings, modal]) node.remove();
    style.remove();
  };
}
