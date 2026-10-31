import { describe, expect, it } from 'vitest';
import { CONVERSATION, ENTITY, ITEM, QUEST, SHOP } from '../contracts';
import worldPlan from '../../content/world-plan.json';
import { content } from './index';
import { SPOKEN_LINES } from './dialogue';

describe('content validation', () => {
  it('resolves every dialogue next/choice target and spoken line', () => {
    for (const node of Object.values(content.nodes)) {
      if (node.next) expect(content.nodes[node.next], `next of ${node.id}`).toBeDefined();
      for (const choice of node.choices ?? [])
        if (choice.next) expect(content.nodes[choice.next], `choice ${node.id}/${choice.id}`).toBeDefined();
      if (node.lineId) {
        const line = SPOKEN_LINES[node.lineId];
        expect(line, `line ${node.lineId}`).toBeDefined();
        expect(node.displayText).toBe(line?.displayText);
      }
      expect(Object.values(ENTITY)).toContain(node.speakerId);
    }
  });

  it('keeps the six rendered audio lines and no orphans', () => {
    const lines = Object.keys(SPOKEN_LINES);
    expect(lines).toHaveLength(6);
    const referenced = new Set(
      Object.values(content.nodes)
        .map((node) => node.lineId)
        .filter((lineId): lineId is string => Boolean(lineId)),
    );
    expect([...referenced].sort()).toEqual([...lines].sort());
  });

  it('resolves conversations, shops and quest conditions', () => {
    for (const entry of Object.values(content.entries)) expect(content.nodes[entry]).toBeDefined();
    for (const conversation of Object.values(content.conversations)) {
      expect(content.nodes[conversation.startNodeId]).toBeDefined();
      expect(content.nodes[conversation.completedNodeId]).toBeDefined();
    }
    const shop = content.shops[SHOP.matsushimaya];
    expect(shop).toBeDefined();
    expect(content.nodes[shop?.orderNodeId ?? '']).toBeDefined();
    expect(content.nodes[shop?.confirmNodeId ?? '']).toBeDefined();
    expect(shop?.items).toEqual([
      { itemId: ITEM.mochi, priceYen: 300, fictionalPrice: true, maxQuantity: 5 },
    ]);

    const quest = content.quests[QUEST.firstTrip];
    expect(quest).toBeDefined();
    expect(quest?.budgetYen).toBe(worldPlan.quest.budgetYen);
    const flags = quest?.transitions.flatMap((transition) =>
      transition.when.map((condition) => condition.type),
    );
    expect(flags).toEqual([
      'conversationPassed',
      'visited',
      'conversationPassed',
      'inventoryAtLeast',
      'delivered',
    ]);
    expect(content.conversations[CONVERSATION.guideIntro]).toBeDefined();
    expect(content.conversations[CONVERSATION.shopOrder]).toBeDefined();
    expect(quest?.transitions[2]?.when).toEqual([{ type: 'delivered', entityId: ENTITY.guide }]);
  });

  it('points the guide and shop nodes at the entities Track A places', () => {
    const home = content.maps['home-interior'];
    const shop = content.maps['shop-interior'];
    const outdoor = content.maps.takanawa;
    expect(home.entities.map((entity) => entity.id)).toContain(ENTITY.guide);
    expect(shop.entities.map((entity) => entity.id)).toContain(ENTITY.shopkeeper);
    expect(outdoor.entities.map((entity) => entity.id)).toContain(ENTITY.stationZone);
  });

  it('has an objective line for every quest status', () => {
    for (const status of ['not_started', 'active', 'ready_to_return', 'completed'] as const) {
      expect(content.ui.objectives[status].ja.length).toBeGreaterThan(0);
      expect(content.ui.objectives[status].en.length).toBeGreaterThan(0);
    }
  });
});
