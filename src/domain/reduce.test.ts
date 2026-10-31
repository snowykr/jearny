import { describe, expect, it } from 'vitest';
import type { Command, CommandPayload, Effect, GameSnapshot } from '../contracts';
import { CONVERSATION, ENTITY, ITEM, PORTAL, QUEST } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from './initial';
import { reduce } from './reduce';

let sequence = 0;

function command(snapshot: GameSnapshot, payload: CommandPayload): Command {
  return { commandId: `test-${++sequence}`, expectedRevision: snapshot.revision, payload };
}

function step(snapshot: GameSnapshot, payload: CommandPayload): { snapshot: GameSnapshot; effects: Effect[] } {
  const outcome = reduce(snapshot, command(snapshot, payload), content);
  if (!outcome.ok) throw new Error(`unexpected ${outcome.reason}`);
  return { snapshot: outcome.snapshot, effects: outcome.effects };
}

function initial(): GameSnapshot {
  return createInitialSnapshot('test-session', content.version);
}

function atShopOrder(): GameSnapshot {
  let s = initial();
  s = step(s, { type: 'Interact', entityId: ENTITY.guide }).snapshot;
  s = step(s, { type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' }).snapshot;
  s = step(s, { type: 'AdvanceDialogue', nodeId: 'guide.depart' }).snapshot;
  s = step(s, { type: 'UsePortal', portalId: PORTAL.homeExit }).snapshot;
  s = step(s, { type: 'Interact', entityId: ENTITY.stationZone }).snapshot;
  s = step(s, { type: 'AdvanceDialogue', nodeId: 'station.directions' }).snapshot;
  s = step(s, { type: 'UsePortal', portalId: PORTAL.shopDoor }).snapshot;
  s = step(s, { type: 'Interact', entityId: ENTITY.shopkeeper }).snapshot;
  return step(s, { type: 'Choose', dialogueNodeId: 'shop.welcome', choiceId: 'order' }).snapshot;
}

/** Reaches the shop while the guide quest is still `not_started`. */
function atShopOrderBeforeGuide(): GameSnapshot {
  let s = initial();
  s = step(s, { type: 'UsePortal', portalId: PORTAL.homeExit }).snapshot;
  s = step(s, { type: 'Interact', entityId: ENTITY.stationZone }).snapshot;
  s = step(s, { type: 'AdvanceDialogue', nodeId: 'station.directions' }).snapshot;
  s = step(s, { type: 'UsePortal', portalId: PORTAL.shopDoor }).snapshot;
  s = step(s, { type: 'Interact', entityId: ENTITY.shopkeeper }).snapshot;
  return step(s, { type: 'Choose', dialogueNodeId: 'shop.welcome', choiceId: 'order' }).snapshot;
}

describe('reduce: revisions and illegal transitions', () => {
  it('rejects a stale expectedRevision without touching the snapshot', () => {
    const snapshot = initial();
    const outcome = reduce(
      snapshot,
      { commandId: 'stale', expectedRevision: 99, payload: { type: 'Interact', entityId: ENTITY.guide } },
      content,
    );
    expect(outcome).toEqual({ ok: false, reason: 'stale_revision', snapshot });
  });

  it('returns a named reason and no effects for an illegal choice', () => {
    const snapshot = initial();
    const outcome = reduce(
      snapshot,
      command(snapshot, { type: 'Choose', dialogueNodeId: 'shop.quantity', choiceId: 'again' }),
      content,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('invalid_choice');
    expect(outcome.snapshot).toBe(snapshot);
  });

  it('rejects advancing a choosing node and closing a closed dialogue', () => {
    let s = atShopOrder();
    const advance = reduce(s, command(s, { type: 'AdvanceDialogue', nodeId: 'shop.quantity' }), content);
    expect(advance.ok).toBe(false);
    if (!advance.ok) expect(advance.reason).toBe('not_available');

    s = step(s, { type: 'CloseDialogue', nodeId: 'shop.quantity' }).snapshot;
    const close = reduce(s, command(s, { type: 'CloseDialogue', nodeId: 'shop.quantity' }), content);
    expect(close.ok).toBe(false);
    if (!close.ok) expect(close.reason).toBe('not_available');
  });
});

describe('reduce: quest prerequisites', () => {
  it('cannot complete before the station and the shop are done', () => {
    let s = initial();
    s = step(s, { type: 'Interact', entityId: ENTITY.guide }).snapshot;
    s = step(s, { type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' }).snapshot;
    s = step(s, { type: 'AdvanceDialogue', nodeId: 'guide.depart' }).snapshot;
    expect(s.quests[QUEST.firstTrip]).toBe('active');

    // Delivering before the quest is ready only opens the reminder.
    const early = step(s, { type: 'Interact', entityId: ENTITY.guide });
    expect(early.snapshot.quests[QUEST.firstTrip]).toBe('active');
    expect(early.snapshot.dialogue.nodeId).toBe('guide.reminder');

    s = step(s, { type: 'UsePortal', portalId: PORTAL.homeExit }).snapshot;
    s = step(s, { type: 'Interact', entityId: ENTITY.stationZone }).snapshot;
    expect(s.quests[QUEST.firstTrip]).toBe('active');
    expect(s.flags['visited:station']).toBe(true);
  });

  it('activates the quest only after the guide conversation completes', () => {
    let s = initial();
    const opened = step(s, { type: 'Interact', entityId: ENTITY.guide });
    expect(opened.snapshot.quests[QUEST.firstTrip]).toBe('not_started');
    expect(opened.snapshot.dialogue.status).toBe('choosing');

    s = step(opened.snapshot, {
      type: 'Choose',
      dialogueNodeId: 'guide.intro',
      choiceId: 'accept',
    }).snapshot;
    expect(s.quests[QUEST.firstTrip]).toBe('active');
    expect(s.flags[`conversationPassed:${CONVERSATION.guideIntro}`]).toBe(true);
  });
});

describe('reduce: purchases', () => {
  it('never lets money go negative', () => {
    const s = atShopOrder();
    const outcome = reduce(
      s,
      command(s, { type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 4 }),
      content,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('insufficient_funds');
    expect(outcome.snapshot).toBe(s);
    expect(outcome.snapshot.walletYen).toBe(1000);
  });

  it('rejects a quantity past the shop cap', () => {
    const s = atShopOrder();
    const outcome = reduce(
      s,
      command(s, { type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 6 }),
      content,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('capacity_exceeded');
  });

  it('rejects a purchase outside the shop conversation', () => {
    const s = initial();
    const outcome = reduce(
      s,
      command(s, { type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 2 }),
      content,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('not_available');
  });

  it('refuses an early purchase before the guide quest is active', () => {
    const s = atShopOrderBeforeGuide();
    expect(s.quests[QUEST.firstTrip]).toBe('not_started');
    const outcome = reduce(
      s,
      command(s, { type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 2 }),
      content,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('prerequisite_missing');
    expect(outcome.snapshot.walletYen).toBe(1000);
    expect(outcome.snapshot.dialogue.nodeId).toBe('shop.quantity');
  });

  it('re-asks without charging when the quantity is not the mission quantity', () => {
    const s = atShopOrder();
    const outcome = reduce(
      s,
      command(s, { type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 1 }),
      content,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.snapshot.walletYen).toBe(1000);
    expect(outcome.snapshot.inventory[ITEM.mochi]).toBeUndefined();
    expect(outcome.snapshot.dialogue.nodeId).toBe('shop.quantity');
    expect(outcome.effects).toContainEqual(
      expect.objectContaining({ type: 'ShowHint', reason: 'shop_quantity_mismatch' }),
    );
    // The question is re-announced, audio included.
    expect(outcome.effects.map((effect) => effect.type)).toEqual([
      'ShowDialogue',
      'PlayLine',
      'ShowHint',
    ]);
  });

  it('charges exactly 600 yen for two mochi and completes the order', () => {
    const s = atShopOrder();
    const outcome = reduce(
      s,
      command(s, { type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 2 }),
      content,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.snapshot.walletYen).toBe(400);
    expect(outcome.snapshot.inventory[ITEM.mochi]).toBe(2);
    expect(outcome.snapshot.dialogue.nodeId).toBe('shop.confirm');
    expect(outcome.snapshot.flags[`conversationPassed:${CONVERSATION.shopOrder}`]).toBe(true);
    expect(outcome.snapshot.quests[QUEST.firstTrip]).toBe('ready_to_return');
  });
});

describe('reduce: quest happy path', () => {
  it('plays home -> station -> shop -> home and completes exactly once', () => {
    let s = initial();
    const completed: Effect[] = [];
    const run = (payload: CommandPayload) => {
      const result = step(s, payload);
      s = result.snapshot;
      completed.push(...result.effects.filter((effect) => effect.type === 'CompleteQuest'));
      return result;
    };

    run({ type: 'Interact', entityId: ENTITY.guide });
    run({ type: 'Choose', dialogueNodeId: 'guide.intro', choiceId: 'accept' });
    run({ type: 'AdvanceDialogue', nodeId: 'guide.depart' });
    run({ type: 'UsePortal', portalId: PORTAL.homeExit });
    run({ type: 'Interact', entityId: ENTITY.stationZone });
    run({ type: 'AdvanceDialogue', nodeId: 'station.directions' });
    run({ type: 'UsePortal', portalId: PORTAL.shopDoor });
    run({ type: 'Interact', entityId: ENTITY.shopkeeper });
    run({ type: 'Choose', dialogueNodeId: 'shop.welcome', choiceId: 'order' });
    run({ type: 'Buy', shopId: 'shop:matsushimaya', itemId: ITEM.mochi, quantity: 2 });
    run({ type: 'AdvanceDialogue', nodeId: 'shop.confirm' });
    run({ type: 'UsePortal', portalId: PORTAL.shopExit });
    run({ type: 'UsePortal', portalId: PORTAL.homeDoor });

    expect(s.sceneId).toBe('home-interior');
    const delivery = run({ type: 'Interact', entityId: ENTITY.guide });

    expect(s.quests[QUEST.firstTrip]).toBe('completed');
    expect(s.walletYen).toBe(400);
    expect(s.inventory[ITEM.mochi]).toBeUndefined();
    expect(s.flags[`delivered:${ENTITY.guide}`]).toBe(true);
    expect(completed).toHaveLength(1);
    expect(delivery.effects.filter((effect) => effect.type === 'CompleteQuest')).toHaveLength(1);

    // Talking again is a quiet epilogue, never a second completion.
    const after = step(s, { type: 'Interact', entityId: ENTITY.guide });
    expect(after.snapshot.dialogue.nodeId).toBe('guide.after');
    expect(after.effects.some((effect) => effect.type === 'CompleteQuest')).toBe(false);
  });
});

describe('reduce: portals and effects', () => {
  it('moves the snapshot and emits ChangeScene, including same-scene portals', () => {
    let s = step(initial(), { type: 'UsePortal', portalId: PORTAL.homeExit }).snapshot;
    expect(s.sceneId).toBe('takanawa');
    expect(s.spawnId).toBe('home-door');

    const deck = step(s, { type: 'UsePortal', portalId: PORTAL.deckUp });
    expect(deck.snapshot.sceneId).toBe('takanawa');
    expect(deck.snapshot.spawnId).toBe('station-deck');
    expect(deck.effects).toContainEqual(
      expect.objectContaining({ type: 'ChangeScene', sceneId: 'takanawa', spawnId: 'station-deck' }),
    );

    s = deck.snapshot;
    const back = step(s, { type: 'UsePortal', portalId: PORTAL.deckDown });
    expect(back.snapshot.spawnId).toBe('plaza');
  });

  it('rejects an unknown portal or entity by name', () => {
    const s = initial();
    const portal = reduce(s, command(s, { type: 'UsePortal', portalId: 'portal:nope' }), content);
    expect(portal.ok).toBe(false);
    if (!portal.ok) expect(portal.reason).toBe('invalid_portal');

    const entity = reduce(s, command(s, { type: 'Interact', entityId: 'npc:nobody' }), content);
    expect(entity.ok).toBe(false);
    if (!entity.ok) expect(entity.reason).toBe('unknown_entity');
  });

  it('stamps effect ids with the command id and keeps ShowDialogue before PlayLine', () => {
    const s = initial();
    const cmd = command(s, { type: 'Interact', entityId: ENTITY.guide });
    const outcome = reduce(s, cmd, content);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.effects.map((effect) => effect.type)).toEqual(['ShowDialogue', 'PlayLine']);
    expect(outcome.effects.map((effect) => effect.id)).toEqual([`${cmd.commandId}:0`, `${cmd.commandId}:1`]);
  });

  it('does not repeat the station visit on re-entry', () => {
    let s = step(initial(), { type: 'UsePortal', portalId: PORTAL.homeExit }).snapshot;
    s = step(s, { type: 'Interact', entityId: ENTITY.stationZone }).snapshot;
    s = step(s, { type: 'AdvanceDialogue', nodeId: 'station.directions' }).snapshot;
    const again = step(s, { type: 'Interact', entityId: ENTITY.stationZone });
    expect(again.effects).toHaveLength(0);
    expect(again.snapshot).toBe(s);
  });
});

describe('reduce: dialogue branches', () => {
  it('routes a wrong quantity through the clarification node', () => {
    const s = atShopOrder();
    const wrong = step(s, { type: 'Choose', dialogueNodeId: 'shop.quantity', choiceId: 'one' });
    expect(wrong.snapshot.dialogue.nodeId).toBe('shop.wrong');
    expect(wrong.snapshot.walletYen).toBe(1000);

    const back = step(wrong.snapshot, {
      type: 'Choose',
      dialogueNodeId: 'shop.wrong',
      choiceId: 'back',
    });
    expect(back.snapshot.dialogue.nodeId).toBe('shop.quantity');
    expect(back.effects.map((effect) => effect.type)).toEqual(['ShowDialogue', 'PlayLine']);
  });
});

describe('reduce: station staff and collect', () => {
  it('lets the player re-read the directions from the station staff', () => {
    let s = step(initial(), { type: 'UsePortal', portalId: PORTAL.homeExit }).snapshot;
    s = step(s, { type: 'Interact', entityId: ENTITY.stationStaff }).snapshot;
    expect(s.flags['visited:station']).toBe(true);
    s = step(s, { type: 'AdvanceDialogue', nodeId: 'station.directions' }).snapshot;

    const again = step(s, { type: 'Interact', entityId: ENTITY.stationStaff });
    expect(again.snapshot.dialogue.nodeId).toBe('station.directions');
    expect(again.effects.length).toBeGreaterThan(0);
  });

  it('rejects Collect until item anchors exist', () => {
    const s = initial();
    const known = reduce(s, command(s, { type: 'Collect', entityId: ENTITY.guide }), content);
    expect(known.ok).toBe(false);
    if (!known.ok) expect(known.reason).toBe('not_available');

    const unknown = reduce(s, command(s, { type: 'Collect', entityId: 'item:nope' }), content);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown_entity');
  });
});
