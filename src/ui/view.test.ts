import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from '../contracts';
import { ENTITY, PORTAL, QUEST } from '../contracts';
import { content } from '../content';
import { createInitialSnapshot } from '../domain';
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
} from './view';

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return { ...createInitialSnapshot('view-test', content.version), ...overrides };
}

describe('view model', () => {
  it('lists the catalog purchase and the dialogue choices at the shop order node', () => {
    const atOrder = snapshot({
      dialogue: { status: 'choosing', nodeId: 'shop.quantity', speakerId: ENTITY.shopkeeper },
    });
    const choices = visibleChoices(atOrder, content);
    const buys = choices.filter((choice) => choice.kind === 'buy');
    expect(buys).toHaveLength(1);
    expect(choices[0]).toEqual({
      kind: 'buy',
      id: 'mochi:2',
      label: '2こ',
      shopId: 'shop:matsushimaya',
      itemId: 'mochi',
      quantity: 2,
      priceYen: 600,
      disabled: false,
    });
    expect(choices.slice(1).map((choice) => choice.id)).toEqual(['again', 'one', 'three']);
  });

  it('has no choices when the dialogue is closed', () => {
    expect(visibleChoices(snapshot(), content)).toEqual([]);
    expect(currentNode(snapshot(), content)).toBeNull();
    expect(speakerName(snapshot(), content)).toBe('');
  });

  it('maps quest status to the localized objective', () => {
    expect(objectiveText(snapshot(), content)).toEqual(content.ui.objectives.not_started);
    expect(
      objectiveText(snapshot({ quests: { [QUEST.firstTrip]: 'ready_to_return' } }), content).ja,
    ).toContain('家に帰って');
  });

  it('labels inventory rows and hides empty stacks', () => {
    expect(inventoryRows(snapshot(), content)).toEqual([]);
    expect(inventoryRows(snapshot({ inventory: { mochi: 2, mystery: 1 } }), content)).toEqual([
      { itemId: 'mochi', label: 'おもち', count: 2 },
      { itemId: 'mystery', label: 'mystery', count: 1 },
    ]);
  });

  it('translates reject reasons and falls back to the raw code', () => {
    expect(hintText('insufficient_funds', content)).toBe('お金が足りません');
    expect(hintText('unknown_reason', content)).toBe('unknown_reason');
  });

  it('types text in steps and reports completion', () => {
    expect(typingStep('おはよう', 0, 2)).toBe(2);
    expect(typingStep('おはよう', 4, 2)).toBe(4);
    expect(typingDone('おはよう', 4)).toBe(true);
    expect(typingDone('おはよう', 3)).toBe(false);
  });

  it('maps Enter to advance or to the selected choice', () => {
    const showing = snapshot({
      dialogue: { status: 'showing', nodeId: 'station.directions', speakerId: ENTITY.stationStaff },
    });
    expect(dialogueKeyAction(showing, content, 0)).toEqual({ type: 'advance' });

    const choosing = snapshot({
      dialogue: { status: 'choosing', nodeId: 'shop.welcome', speakerId: ENTITY.shopkeeper },
    });
    const action = dialogueKeyAction(choosing, content, 0);
    expect(action.type).toBe('choose');
    if (action.type === 'choose') expect(action.choice.id).toBe('order');
  });

  it('clamps the selected choice', () => {
    const choosing = snapshot({
      dialogue: { status: 'choosing', nodeId: 'shop.welcome', speakerId: ENTITY.shopkeeper },
    });
    const action = dialogueKeyAction(choosing, content, 99);
    expect(action.type).toBe('choose');
    if (action.type === 'choose') expect(action.choice.id).toBe('order');
  });

  it('keeps the station node reachable after the portal walk', () => {
    const atStation = snapshot({
      sceneId: 'takanawa',
      spawnId: 'home-door',
      dialogue: { status: 'showing', nodeId: 'station.directions', speakerId: ENTITY.stationStaff },
    });
    expect(currentNode(atStation, content)?.lineId).toBe('station.directions');
    expect(content.maps.takanawa.portals.map((portal) => portal.id)).toContain(PORTAL.deckUp);
  });
});
