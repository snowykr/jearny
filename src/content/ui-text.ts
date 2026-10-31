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
  /**
   * Legal note for the demo: the shop exists, the offer does not. The chip carries
   * `disclaimerShort` on every screen, so a recorded walkthrough cannot ship
   * without a notice; the full text is one button away on the same chip.
   */
  disclaimer: ObjectiveText;
  /** One-line form of `disclaimer` that stays visible while walking. Japanese only:
   * the chip has no room for two languages and the full note keeps the English. */
  disclaimerShort: string;
  /** Visual for the demo: a coupon that explicitly cannot be redeemed at the real shop. */
  coupon: {
    title: string;
    shop: string;
    note: string;
    noteEn: string;
  };
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
    note: string;
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
  disclaimer: {
    ja: '松島屋は実在の店舗ですが本作とは無関係です。作中の価格・割引は架空で、利用できません。',
    en: 'Matsushimaya is a real shop, unaffiliated with this demo. Prices and offers shown are fictional.',
  },
  // Short enough for one chip line: names both facts (unaffiliated, fictional offer).
  disclaimerShort: '※松島屋は本作と無関係・価格は架空です',
  coupon: {
    title: 'デモクーポン（見本）',
    shop: '松島屋',
    note: 'デモ用です。実店舗では利用できません。本作とは無関係です。',
    noteEn: 'Demo only — cannot be redeemed at the real shop. Unaffiliated.',
  },
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
    note: 'ご注意',
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
