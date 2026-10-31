// Shared contract (docs/ARCHITECTURE.md §5–6). Change only via a PR to main.
import type { SceneId } from './state';

export type Tile = [number, number];

// ---- Maps (authored by Track A in src/content/maps/) ----

export interface Portal {
  id: string;
  tile: Tile;
  toScene: SceneId;
  toSpawn: string;
}

export interface EntityAnchor {
  /** Must match an entity known to the domain, e.g. npc:guide, shop:matsushimaya, zone:station. */
  id: string;
  kind: 'npc' | 'shop' | 'zone' | 'item' | 'building';
  tile: Tile;
  /** Footprint in tiles for buildings/zones. Defaults to [1, 1]. */
  size?: Tile;
  /**
   * Tile row where the sprite's bottom edge sits (render + Y-sort). Defaults to tile.y + size.y.
   * Use it when the collision rect is smaller than the sprite.
   */
  footRow?: number;
  assetId?: string;
  facing?: 'up' | 'down' | 'left' | 'right';
}

export interface MapDefinition {
  id: SceneId;
  tileSize: 16;
  grid: Tile; // [cols, rows]
  /** Row-major tile indices per layer; -1 means empty. */
  layers: { ground: number[]; decoration: number[]; roof: number[] };
  /** Row-major; 1 = blocked. Roads/rail blocked except authored crossings. */
  collision: number[];
  spawns: Record<string, Tile>;
  portals: Portal[];
  entities: EntityAnchor[];
}

// ---- Quests & dialogue (authored by Track B in src/content/ and content/) ----

export type QuestCondition =
  | { type: 'visited'; zoneId: string }
  | { type: 'conversationPassed'; conversationId: string }
  | { type: 'inventoryAtLeast'; itemId: string; quantity: number }
  | { type: 'delivered'; entityId: string };

export interface QuestDefinition {
  id: string;
  budgetYen: number;
  transitions: Array<{
    from: 'not_started' | 'active' | 'ready_to_return';
    to: 'active' | 'ready_to_return' | 'completed';
    when: QuestCondition[];
  }>;
}

export interface DialogueChoice {
  id: string;
  displayText: string;
  next: string | null;
}

export interface DialogueNode {
  id: string;
  speakerId: string;
  displayText: string;
  /** Matches a line id in content/dialogue.ja.json for TTS. */
  lineId?: string;
  choices?: DialogueChoice[];
  next?: string | null;
}

export interface ShopCatalog {
  shopId: string;
  items: Array<{ itemId: string; priceYen: number; fictionalPrice: true; maxQuantity: number }>;
}
