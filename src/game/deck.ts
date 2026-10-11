// deck.ts — 牌与洗牌（纯函数，随机仅经 Rng 接口）
//
// 编码：单副牌用 0..53 的连续整数；两副牌时「副」维在前（copy * 54 + singleId）。
//   - 普通点数 3..15（3=3 … 15=2）：singleId = (rank - 3) * 4 + suit（0..51）
//   - 小王 = 52，大王 = 53

import type { Card, ModeConfig, Rank, Suit } from './types.js';
import type { Rng } from './fairness.js';

export const SMALL_JOKER = 16;
export const BIG_JOKER = 17;
export const RANK_2 = 15;
export const RANK_ACE = 14;

const SINGLE_SIZE = 54;
const SINGLE_SMALL_JOKER = 52;
const SINGLE_BIG_JOKER = 53;

export const SUIT_SYMBOLS = ['♠', '♥', '♣', '♦'] as const;

export function encodeCard(rank: number, suit: number, copy = 0): Card {
  let single: number;
  if (rank === SMALL_JOKER) single = SINGLE_SMALL_JOKER;
  else if (rank === BIG_JOKER) single = SINGLE_BIG_JOKER;
  else single = (rank - 3) * 4 + suit;
  return copy * SINGLE_SIZE + single;
}

export function rankOf(card: Card): Rank {
  const single = card % SINGLE_SIZE;
  if (single === SINGLE_SMALL_JOKER) return SMALL_JOKER;
  if (single === SINGLE_BIG_JOKER) return BIG_JOKER;
  return Math.floor(single / 4) + 3;
}

export function suitOf(card: Card): Suit {
  const single = card % SINGLE_SIZE;
  if (single >= SINGLE_SMALL_JOKER) return 0; // 王无花色
  return (single % 4) as Suit;
}

export function rankLabel(rank: number): string {
  switch (rank) {
    case SMALL_JOKER:
      return '小王';
    case BIG_JOKER:
      return '大王';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case RANK_ACE:
      return 'A';
    case RANK_2:
      return '2';
    default:
      return String(rank);
  }
}

export function cardToString(card: Card): string {
  const r = rankOf(card);
  if (r >= SMALL_JOKER) return rankLabel(r);
  return `${rankLabel(r)}${SUIT_SYMBOLS[suitOf(card)]}`;
}

export function createDeck(mode: ModeConfig): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < mode.decks; copy++) {
    for (let rank = 3; rank <= RANK_2; rank++) {
      for (let suit = 0; suit < 4; suit++) deck.push(encodeCard(rank, suit, copy));
    }
    deck.push(encodeCard(SMALL_JOKER, 0, copy));
    deck.push(encodeCard(BIG_JOKER, 0, copy));
  }
  return deck;
}

/** Fisher–Yates 洗牌，使用传入的 Rng（可复现） */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 发牌：按座位顺序逐人发满，剩余为底牌 */
export function deal(mode: ModeConfig, rng: Rng): { hands: Card[][]; bottom: Card[] } {
  const deck = shuffle(createDeck(mode), rng);
  const hands: Card[][] = Array.from({ length: mode.players }, () => []);
  let idx = 0;
  for (let i = 0; i < mode.players; i++) {
    for (let c = 0; c < mode.cardsPerHand; c++) hands[i].push(deck[idx++]);
  }
  const bottom = deck.slice(idx, idx + mode.bottomCount);
  return { hands, bottom };
}

/** 按点数（降序）、花色（降序）、牌值（降序）稳定排序 */
export function sortCards(cards: Card[], desc = true): Card[] {
  return cards.slice().sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return desc ? rb - ra : ra - rb;
    const sa = suitOf(a);
    const sb = suitOf(b);
    if (sa !== sb) return desc ? sb - sa : sa - sb;
    return desc ? b - a : a - b;
  });
}
