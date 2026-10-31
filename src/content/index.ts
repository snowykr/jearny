// Assembled, validated game content. Track A owns the map registry in
// `./maps`; this module is the only place that joins maps with logic data.
import type { DialogueNode, MapDefinition, QuestDefinition, SceneId } from '../contracts';
import { maps } from './maps';
import { CONVERSATIONS, DIALOGUE_NODES, GUIDE_NODES, SHOP_NODES, STATION_NODE } from './dialogue';
import { QUEST_ORDER, QUESTS } from './quests';
import { SHOPS, type ShopDefinition } from './shops';
import { UI_TEXT, type UiText } from './ui-text';

/** Bumped whenever content changes shape or meaning; saved sessions pin it. */
export const CONTENT_VERSION = 'takanawa-v1';

export interface ConversationDefinition {
  startNodeId: string;
  completedNodeId: string;
}

export interface EntryNodes {
  guideIntro: string;
  guideReminder: string;
  guideDelivery: string;
  guideAfter: string;
  station: string;
  shopWelcome: string;
}

export interface WorldContent {
  version: string;
  maps: Record<SceneId, MapDefinition>;
  quests: Record<string, QuestDefinition>;
  questOrder: string[];
  nodes: Record<string, DialogueNode>;
  conversations: Record<string, ConversationDefinition>;
  shops: Record<string, ShopDefinition>;
  entries: EntryNodes;
  ui: UiText;
}

export const content: WorldContent = {
  version: CONTENT_VERSION,
  maps,
  quests: QUESTS,
  questOrder: QUEST_ORDER,
  nodes: DIALOGUE_NODES,
  conversations: CONVERSATIONS,
  shops: SHOPS,
  entries: {
    guideIntro: GUIDE_NODES.intro,
    guideReminder: GUIDE_NODES.reminder,
    guideDelivery: GUIDE_NODES.delivery,
    guideAfter: GUIDE_NODES.after,
    station: STATION_NODE,
    shopWelcome: SHOP_NODES.welcome,
  },
  ui: UI_TEXT,
};

export type { ShopDefinition } from './shops';
