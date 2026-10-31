// Pure reducer (docs/ARCHITECTURE.md §5–6). No KAPLAY, DOM, storage or network.
// Everything it needs arrives as arguments; every effect is declarative.
import type {
  Command,
  DialogueNode,
  EffectPayload,
  GameSnapshot,
  Outcome,
  QuestCondition,
  RejectReason,
} from '../contracts';
import { ENTITY, ITEM, QUEST, ZONE } from '../contracts';
import type { WorldContent } from '../content';

type Update = { snapshot: GameSnapshot } | { reason: RejectReason };

const flagVisited = (zoneId: string) => `visited:${zoneId}`;
const flagConversation = (conversationId: string) => `conversationPassed:${conversationId}`;
const flagDelivered = (entityId: string) => `delivered:${entityId}`;

/** Reads the mission quantity from the quest data so it is authored once. */
function requiredQuantity(content: WorldContent, itemId: string): number {
  for (const questId of content.questOrder) {
    for (const transition of content.quests[questId]?.transitions ?? []) {
      for (const condition of transition.when) {
        if (condition.type === 'inventoryAtLeast' && condition.itemId === itemId)
          return condition.quantity;
      }
    }
  }
  throw new Error(`No quest requires ${itemId}`);
}

function reject(reason: RejectReason, snapshot: GameSnapshot): Outcome {
  return { ok: false, reason, snapshot };
}

function setFlag(snapshot: GameSnapshot, flag: string): GameSnapshot {
  if (snapshot.flags[flag]) return snapshot;
  return { ...snapshot, flags: { ...snapshot.flags, [flag]: true } };
}

function closeDialogue(snapshot: GameSnapshot): GameSnapshot {
  return { ...snapshot, dialogue: { status: 'closed', nodeId: null, speakerId: null } };
}

/** Sets the dialogue state, emits ShowDialogue/PlayLine and records completions. */
function enterNode(
  snapshot: GameSnapshot,
  nodeId: string,
  content: WorldContent,
  effects: EffectPayload[],
): GameSnapshot {
  const node: DialogueNode | undefined = content.nodes[nodeId];
  if (!node) throw new Error(`Dialogue node ${nodeId} is not in content`);
  effects.push({ type: 'ShowDialogue', nodeId });
  if (node.lineId) effects.push({ type: 'PlayLine', lineId: node.lineId });
  let next: GameSnapshot = {
    ...snapshot,
    dialogue: {
      status: node.choices && node.choices.length > 0 ? 'choosing' : 'showing',
      nodeId,
      speakerId: node.speakerId,
    },
  };
  for (const [conversationId, conversation] of Object.entries(content.conversations)) {
    if (conversation.completedNodeId === nodeId) next = setFlag(next, flagConversation(conversationId));
  }
  return next;
}

function conditionMet(condition: QuestCondition, snapshot: GameSnapshot): boolean {
  switch (condition.type) {
    case 'visited':
      return Boolean(snapshot.flags[flagVisited(condition.zoneId)]);
    case 'conversationPassed':
      return Boolean(snapshot.flags[flagConversation(condition.conversationId)]);
    case 'inventoryAtLeast':
      return (snapshot.inventory[condition.itemId] ?? 0) >= condition.quantity;
    case 'delivered':
      return Boolean(snapshot.flags[flagDelivered(condition.entityId)]);
  }
}

/** Runs every legal transition until the quest stops moving. */
function evaluateQuests(
  snapshot: GameSnapshot,
  content: WorldContent,
  effects: EffectPayload[],
): GameSnapshot {
  let current = snapshot;
  let changed = true;
  while (changed) {
    changed = false;
    for (const questId of content.questOrder) {
      const definition = content.quests[questId];
      const status = current.quests[questId];
      if (!definition || !status || status === 'completed') continue;
      const transition = definition.transitions.find(
        (candidate) =>
          candidate.from === status &&
          candidate.when.every((condition) => conditionMet(condition, current)),
      );
      if (!transition) continue;
      current = { ...current, quests: { ...current.quests, [questId]: transition.to } };
      if (transition.to === 'completed') effects.push({ type: 'CompleteQuest', questId });
      changed = true;
    }
  }
  return current;
}

function interact(
  snapshot: GameSnapshot,
  entityId: string,
  content: WorldContent,
  effects: EffectPayload[],
): Update {
  const map = content.maps[snapshot.sceneId];
  const entity = map.entities.find((candidate) => candidate.id === entityId);
  if (!entity) return { reason: 'unknown_entity' };

  switch (entityId) {
    case ENTITY.guide: {
      const status = snapshot.quests[QUEST.firstTrip] ?? 'not_started';
      if (status === 'ready_to_return') {
        const held = snapshot.inventory[ITEM.mochi] ?? 0;
        const needed = requiredQuantity(content, ITEM.mochi);
        if (held < needed) return { reason: 'prerequisite_missing' };
        const inventory = { ...snapshot.inventory };
        const remaining = held - needed;
        if (remaining > 0) inventory[ITEM.mochi] = remaining;
        else delete inventory[ITEM.mochi];
        const delivered = setFlag({ ...snapshot, inventory }, flagDelivered(ENTITY.guide));
        return { snapshot: enterNode(delivered, content.entries.guideDelivery, content, effects) };
      }
      const node =
        status === 'not_started'
          ? content.entries.guideIntro
          : status === 'completed'
            ? content.entries.guideAfter
            : content.entries.guideReminder;
      return { snapshot: enterNode(snapshot, node, content, effects) };
    }
    case ENTITY.stationZone: {
      // A dispatches this on entering the zone; repeat entries are side-effect free.
      if (snapshot.flags[flagVisited(ZONE.station)]) return { snapshot };
      const visited = setFlag(snapshot, flagVisited(ZONE.station));
      return { snapshot: enterNode(visited, content.entries.station, content, effects) };
    }
    case ENTITY.stationStaff: {
      // The NPC stays talkative so the directions can be re-read.
      const visited = setFlag(snapshot, flagVisited(ZONE.station));
      return { snapshot: enterNode(visited, content.entries.station, content, effects) };
    }
    case ENTITY.shopkeeper:
      return { snapshot: enterNode(snapshot, content.entries.shopWelcome, content, effects) };
    default:
      return { reason: 'not_available' };
  }
}

function buy(
  snapshot: GameSnapshot,
  payload: { shopId: string; itemId: string; quantity: number },
  content: WorldContent,
  effects: EffectPayload[],
): Update {
  const shop = content.shops[payload.shopId];
  if (!shop) return { reason: 'unknown_entity' };
  // A purchase is only legal while the shop's order question is on screen.
  if (snapshot.dialogue.status === 'closed' || snapshot.dialogue.nodeId !== shop.orderNodeId)
    return { reason: 'not_available' };
  const item = shop.items.find((candidate) => candidate.itemId === payload.itemId);
  if (!item) return { reason: 'unknown_entity' };
  // The shop conversation is reachable before the quest starts; buying early
  // would skip the active objective, so the order waits for the guide.
  if ((snapshot.quests[QUEST.firstTrip] ?? 'not_started') === 'not_started')
    return { reason: 'prerequisite_missing' };
  if (!Number.isInteger(payload.quantity) || payload.quantity < 1)
    return { reason: 'invalid_choice' };
  if (payload.quantity > item.maxQuantity) return { reason: 'capacity_exceeded' };
  if (item.priceYen * payload.quantity > snapshot.walletYen) return { reason: 'insufficient_funds' };

  // Scripted clarification branch: a quantity other than the mission's does not
  // charge money, it re-asks the question (#10).
  if (payload.quantity !== shop.requiredQuantity) {
    const asked = enterNode(snapshot, shop.orderNodeId, content, effects);
    effects.push({ type: 'ShowHint', reason: 'shop_quantity_mismatch' });
    return { snapshot: asked };
  }

  const inventory = {
    ...snapshot.inventory,
    [payload.itemId]: (snapshot.inventory[payload.itemId] ?? 0) + payload.quantity,
  };
  const bought = {
    ...snapshot,
    walletYen: snapshot.walletYen - item.priceYen * payload.quantity,
    inventory,
  };
  return { snapshot: enterNode(bought, shop.confirmNodeId, content, effects) };
}

function usePortal(
  snapshot: GameSnapshot,
  portalId: string,
  content: WorldContent,
  effects: EffectPayload[],
): Update {
  const portal = content.maps[snapshot.sceneId].portals.find((candidate) => candidate.id === portalId);
  if (!portal) return { reason: 'invalid_portal' };
  const target = content.maps[portal.toScene];
  if (!target || !target.spawns[portal.toSpawn]) return { reason: 'invalid_portal' };
  effects.push({ type: 'ChangeScene', sceneId: portal.toScene, spawnId: portal.toSpawn });
  return {
    snapshot: {
      ...closeDialogue(snapshot),
      sceneId: portal.toScene,
      spawnId: portal.toSpawn,
    },
  };
}

function apply(snapshot: GameSnapshot, command: Command, content: WorldContent, effects: EffectPayload[]): Update {
  const payload = command.payload;
  switch (payload.type) {
    case 'Interact':
      return interact(snapshot, payload.entityId, content, effects);
    case 'AdvanceDialogue': {
      if (snapshot.dialogue.status !== 'showing' || snapshot.dialogue.nodeId !== payload.nodeId)
        return { reason: 'not_available' };
      const node = content.nodes[payload.nodeId];
      if (!node) return { reason: 'unknown_entity' };
      return {
        snapshot: node.next ? enterNode(snapshot, node.next, content, effects) : closeDialogue(snapshot),
      };
    }
    case 'Choose': {
      if (snapshot.dialogue.status !== 'choosing' || snapshot.dialogue.nodeId !== payload.dialogueNodeId)
        return { reason: 'invalid_choice' };
      const node = content.nodes[payload.dialogueNodeId];
      const choice = node?.choices?.find((candidate) => candidate.id === payload.choiceId);
      if (!choice) return { reason: 'invalid_choice' };
      return {
        snapshot: choice.next ? enterNode(snapshot, choice.next, content, effects) : closeDialogue(snapshot),
      };
    }
    case 'CloseDialogue': {
      if (snapshot.dialogue.status === 'closed' || snapshot.dialogue.nodeId !== payload.nodeId)
        return { reason: 'not_available' };
      return { snapshot: closeDialogue(snapshot) };
    }
    case 'Buy':
      return buy(snapshot, payload, content, effects);
    case 'UsePortal':
      return usePortal(snapshot, payload.portalId, content, effects);
    case 'Collect': {
      // Deferred: the v1 maps contain no item anchors. Reject by name instead of
      // faking a pickup; items arrive with the quest that owns them.
      const entity = content.maps[snapshot.sceneId].entities.find(
        (candidate) => candidate.id === payload.entityId,
      );
      return entity ? { reason: 'not_available' } : { reason: 'unknown_entity' };
    }
    case 'SubmitVerifiedSpeech':
      return { reason: 'not_available' };
    case 'Resume':
      return { snapshot };
  }
}

/** Effects carry `<commandId>:<index>` so a retried command cannot replay them. */
export function reduce(snapshot: GameSnapshot, command: Command, content: WorldContent): Outcome {
  if (command.expectedRevision !== snapshot.revision) return reject('stale_revision', snapshot);

  const effects: EffectPayload[] = [];
  const result = apply(snapshot, command, content, effects);
  if ('reason' in result) return reject(result.reason, snapshot);

  const next = evaluateQuests(result.snapshot, content, effects);
  if (next === snapshot) return { ok: true, snapshot, effects: [] };

  return {
    ok: true,
    snapshot: { ...next, revision: snapshot.revision + 1 },
    effects: effects.map((effect, index) => ({ ...effect, id: `${command.commandId}:${index}` })),
  };
}
