// Pure view-model helpers: the DOM code below stays free of content lookups.
import type { DialogueNode, GameSnapshot, RejectReason } from '../contracts';
import { QUEST } from '../contracts';
import type { WorldContent } from '../content';

export interface ObjectiveText {
  ja: string;
  en: string;
}

export type ChoiceView =
  | { kind: 'choice'; id: string; label: string }
  | {
      kind: 'buy';
      id: string;
      label: string;
      shopId: string;
      itemId: string;
      quantity: number;
      priceYen: number;
    };

export function currentNode(snapshot: GameSnapshot, content: WorldContent): DialogueNode | null {
  const nodeId = snapshot.dialogue.nodeId;
  if (snapshot.dialogue.status === 'closed' || !nodeId) return null;
  return content.nodes[nodeId] ?? null;
}

export function speakerName(snapshot: GameSnapshot, content: WorldContent): string {
  const speakerId = snapshot.dialogue.speakerId;
  if (!speakerId) return '';
  return content.ui.speakers[speakerId] ?? speakerId;
}

export function objectiveText(snapshot: GameSnapshot, content: WorldContent): ObjectiveText {
  const status = snapshot.quests[QUEST.firstTrip] ?? 'not_started';
  return content.ui.objectives[status];
}

export function inventoryRows(
  snapshot: GameSnapshot,
  content: WorldContent,
): Array<{ itemId: string; label: string; count: number }> {
  return Object.entries(snapshot.inventory)
    .filter(([, count]) => count > 0)
    .map(([itemId, count]) => ({
      itemId,
      label: content.ui.items[itemId] ?? itemId,
      count,
    }));
}

export function hintText(reason: string, content: WorldContent): string {
  return content.ui.hints[reason as RejectReason] ?? reason;
}

/** Node choices plus, at a shop's order node, catalog-driven purchase choices. */
export function visibleChoices(snapshot: GameSnapshot, content: WorldContent): ChoiceView[] {
  const node = currentNode(snapshot, content);
  if (!node) return [];
  const views: ChoiceView[] = (node.choices ?? []).map((choice) => ({
    kind: 'choice',
    id: choice.id,
    label: choice.displayText,
  }));
  for (const shop of Object.values(content.shops)) {
    if (shop.orderNodeId !== node.id) continue;
    for (const item of shop.items) {
      for (let quantity = 1; quantity <= item.maxQuantity; quantity++) {
        views.push({
          kind: 'buy',
          id: `${item.itemId}:${quantity}`,
          label: `${quantity}こ`,
          shopId: shop.shopId,
          itemId: item.itemId,
          quantity,
          priceYen: item.priceYen * quantity,
        });
      }
    }
  }
  return views;
}

/** Reveals `text` up to `shown` characters; returns the next shown count. */
export function typingStep(text: string, shown: number, step = 1): number {
  return Math.min(text.length, shown + step);
}

export function typingDone(text: string, shown: number): boolean {
  return shown >= text.length;
}

/** What Enter/Space means at this moment. */
export type DialogueKeyAction =
  | { type: 'skip-typing' }
  | { type: 'advance'; nodeId: string }
  | { type: 'choose'; nodeId: string; choice: ChoiceView }
  | { type: 'none' };

export function dialogueKeyAction(
  snapshot: GameSnapshot,
  content: WorldContent,
  selected: number,
): DialogueKeyAction {
  const node = currentNode(snapshot, content);
  if (!node) return { type: 'none' };
  const choices = visibleChoices(snapshot, content);
  if (choices.length === 0) return { type: 'advance', nodeId: node.id };
  const choice = choices[Math.min(Math.max(selected, 0), choices.length - 1)];
  return choice ? { type: 'choose', nodeId: node.id, choice } : { type: 'none' };
}
