// Quest data for the first journey (docs/ARCHITECTURE.md §6, content/world-plan.json).
import type { QuestDefinition } from '../contracts';
import { CONVERSATION, ENTITY, ITEM, QUEST, ZONE } from '../contracts';

export const QUESTS: Record<string, QuestDefinition> = {
  [QUEST.firstTrip]: {
    id: QUEST.firstTrip,
    budgetYen: 1000,
    transitions: [
      {
        from: 'not_started',
        to: 'active',
        when: [{ type: 'conversationPassed', conversationId: CONVERSATION.guideIntro }],
      },
      {
        from: 'active',
        to: 'ready_to_return',
        when: [
          { type: 'visited', zoneId: ZONE.station },
          { type: 'conversationPassed', conversationId: CONVERSATION.shopOrder },
          { type: 'inventoryAtLeast', itemId: ITEM.mochi, quantity: 2 },
        ],
      },
      {
        from: 'ready_to_return',
        to: 'completed',
        when: [{ type: 'delivered', entityId: ENTITY.guide }],
      },
    ],
  },
};

/** Evaluation order; a later quest may depend on an earlier one. */
export const QUEST_ORDER: string[] = [QUEST.firstTrip];
