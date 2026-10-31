// Dialogue graph (docs/ARCHITECTURE.md §6). Nodes with a `lineId` take their
// Japanese text from content/dialogue.ja.json so the TTS line and the on-screen
// text can never drift apart.
import type { DialogueNode } from '../contracts';
import { ENTITY } from '../contracts';
import linesFile from '../../content/dialogue.ja.json';

interface SpokenLine {
  id: string;
  speaker: string;
  displayText: string;
  spokenText: string;
}

export const SPOKEN_LINES: Record<string, SpokenLine> = Object.fromEntries(
  (linesFile.lines as SpokenLine[]).map((line) => [line.id, line]),
);

const SPEAKER_BY_ROLE: Record<string, string> = {
  guide: ENTITY.guide,
  station_staff: ENTITY.stationStaff,
  shopkeeper: ENTITY.shopkeeper,
};

function spoken(lineId: string): Pick<DialogueNode, 'speakerId' | 'displayText' | 'lineId'> {
  const line = SPOKEN_LINES[lineId];
  if (!line) throw new Error(`Unknown dialogue line ${lineId}`);
  const speakerId = SPEAKER_BY_ROLE[line.speaker];
  if (!speakerId) throw new Error(`Unknown speaker ${line.speaker} on ${lineId}`);
  return { speakerId, displayText: line.displayText, lineId: line.id };
}

function node(id: string, speakerId: string, displayText: string, rest: Partial<DialogueNode> = {}): DialogueNode {
  return { id, speakerId, displayText, ...rest };
}

export const DIALOGUE_NODES: Record<string, DialogueNode> = {
  // --- guide -----------------------------------------------------------------
  'guide.intro': node('guide.intro', ENTITY.guide, '', {
    ...spoken('home.welcome'),
    choices: [
      { id: 'accept', displayText: 'お願いします。', next: 'guide.depart' },
      { id: 'retry', displayText: 'もう一度お願いします。', next: 'guide.clarify' },
    ],
  }),
  'guide.clarify': node('guide.clarify', ENTITY.guide, '', {
    ...spoken('guide.clarify'),
    choices: [{ id: 'back', displayText: 'わかりました。', next: 'guide.intro' }],
  }),
  'guide.depart': node(
    'guide.depart',
    ENTITY.guide,
    '駅で案内の人に道を聞いて、松島屋でお昼を買ってきてください。いってらっしゃい。',
  ),
  'guide.reminder': node(
    'guide.reminder',
    ENTITY.guide,
    '駅の案内の人に道を聞いて、松島屋でお昼を買ってきてくださいね。',
  ),
  'guide.delivery': node(
    'guide.delivery',
    ENTITY.guide,
    'おかえりなさい。お昼を買ってきてくれたんですね。ありがとう！',
  ),
  'guide.after': node('guide.after', ENTITY.guide, '今日はありがとう。また一緒に出かけましょう。'),

  // --- station staff ----------------------------------------------------------
  'station.directions': node('station.directions', ENTITY.stationStaff, '', {
    ...spoken('station.directions'),
  }),

  // --- shopkeeper -------------------------------------------------------------
  'shop.welcome': node('shop.welcome', ENTITY.shopkeeper, '', {
    ...spoken('shop.welcome'),
    choices: [{ id: 'order', displayText: 'はい、お願いします。', next: 'shop.quantity' }],
  }),
  'shop.quantity': node('shop.quantity', ENTITY.shopkeeper, '', {
    ...spoken('shop.quantity'),
    // Quantity buttons are rendered from the catalog and dispatch `Buy`;
    // this choice only asks the shopkeeper to repeat the question.
    choices: [{ id: 'again', displayText: 'もう一度お願いします。', next: 'shop.quantity' }],
  }),
  'shop.confirm': node('shop.confirm', ENTITY.shopkeeper, '', {
    ...spoken('shop.confirm'),
  }),
};

/** Which conversation a node completes when it is entered. */
export const CONVERSATIONS: Record<string, { startNodeId: string; completedNodeId: string }> = {
  guide_intro: { startNodeId: 'guide.intro', completedNodeId: 'guide.depart' },
  shop_order: { startNodeId: 'shop.welcome', completedNodeId: 'shop.confirm' },
};

/** Entry node for an interaction that is not chosen by quest state. */
export const GUIDE_NODES = {
  intro: 'guide.intro',
  reminder: 'guide.reminder',
  delivery: 'guide.delivery',
  after: 'guide.after',
} as const;

export const STATION_NODE = 'station.directions';
export const SHOP_NODES = { welcome: 'shop.welcome', order: 'shop.quantity', confirm: 'shop.confirm' } as const;
