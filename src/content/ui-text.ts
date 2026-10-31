// Player-facing copy that is not spoken audio: HUD objectives, reject reasons,
// speaker names and labels. Kept next to the content so no sentence is inlined
// in a view.
import type { QuestStatus, RejectReason } from '../contracts';
import { ENTITY, ITEM } from '../contracts';

export interface ObjectiveText {
  ja: string;
  en: string;
}

export interface UiText {
  title: string;
  speakers: Record<string, string>;
  items: Record<string, string>;
  objectives: Record<QuestStatus, ObjectiveText>;
  hints: Record<
    | RejectReason
    | 'shop_quantity_mismatch'
    | 'content_version_mismatch'
    | 'save_corrupt'
    | 'storage_unavailable',
    string
  >;
  labels: {
    wallet: string;
    quest: string;
    bag: string;
    empty: string;
    settings: string;
    mute: string;
    volume: string;
    textSize: string;
    inputMode: string;
    normal: string;
    large: string;
    keyboard: string;
    touch: string;
    close: string;
    replay: string;
    startOver: string;
    questComplete: string;
  };
}

export const UI_TEXT: UiText = {
  title: '旅クエスト',
  speakers: {
    [ENTITY.guide]: 'ガイド',
    [ENTITY.stationStaff]: '駅員',
    [ENTITY.shopkeeper]: '店員',
  },
  items: { [ITEM.mochi]: 'おもち' },
  objectives: {
    not_started: { ja: 'ガイドに話しかける', en: 'Talk to the guide at home' },
    active: { ja: '駅で道を聞き、松島屋でおもちを2つ買う', en: 'Ask at the station, then buy 2 mochi' },
    ready_to_return: { ja: '家に帰ってガイドにおもちを渡す', en: 'Return home and deliver the mochi' },
    completed: { ja: '達成！', en: 'Complete' },
  },
  hints: {
    stale_revision: 'やり直してください',
    unknown_entity: 'それは今は使えません',
    not_available: '今はできません',
    insufficient_funds: 'お金が足りません',
    capacity_exceeded: 'これ以上は買えません',
    prerequisite_missing: 'まだ条件がそろっていません',
    invalid_choice: '選べません',
    invalid_portal: 'そこへは行けません',
    shop_quantity_mismatch: 'もう一度、数を確認しましょう',
    content_version_mismatch: '古いセーブデータです。はじめから遊べます',
    save_corrupt: 'セーブデータを読み込めませんでした',
    storage_unavailable: 'セーブできません（保存領域が使えません）',
  },
  labels: {
    wallet: '所持金',
    quest: 'クエスト',
    bag: '持ち物',
    empty: 'なし',
    settings: '設定',
    mute: '音',
    volume: '音量',
    textSize: '文字',
    inputMode: '操作',
    normal: 'ふつう',
    large: '大きい',
    keyboard: 'キーボード',
    touch: 'タッチ',
    close: '閉じる',
    replay: 'もう一度聞く',
    startOver: 'はじめから',
    questComplete: 'クエスト達成！',
  },
};
