// types.ts — 牌、牌型、模式配置等共享类型定义（纯类型 + 常量，无实现逻辑）

export type Suit = 0 | 1 | 2 | 3; // ♠ ♥ ♣ ♦
export type Rank = number; // 3..17（16 = 小王，17 = 大王）
export type Card = number; // 编码整数，编码规则见 deck.ts

// 牌型类别（1~13 为标准牌型，14 为四人模式的天王炸）
export type CardType =
  | 'single' // 单张
  | 'pair' // 对子
  | 'triple' // 三张
  | 'triple-single' // 三带一
  | 'triple-pair' // 三带二
  | 'straight' // 顺子
  | 'straight-pairs' // 连对
  | 'airplane' // 飞机（不带）
  | 'airplane-singles' // 飞机带单
  | 'airplane-pairs' // 飞机带对
  | 'four-two' // 四带二（4+2单 或 4+2对）
  | 'bomb' // 炸弹
  | 'rocket' // 火箭（王炸）
  | 'super-rocket'; // 天王炸（四人模式）

export interface ModeConfig {
  readonly id: 'three' | 'four';
  readonly players: number; // 3 | 4
  readonly decks: number; // 1 | 2 副牌
  readonly deckSize: number; // 54 | 108
  readonly cardsPerHand: number; // 17 | 25
  readonly bottomCount: number; // 3 | 8
}

export const THREE_PLAYER: ModeConfig = {
  id: 'three',
  players: 3,
  decks: 1,
  deckSize: 54,
  cardsPerHand: 17,
  bottomCount: 3,
};

export const FOUR_PLAYER: ModeConfig = {
  id: 'four',
  players: 4,
  decks: 2,
  deckSize: 108,
  cardsPerHand: 25,
  bottomCount: 8,
};

export function getMode(players: 3 | 4): ModeConfig {
  return players === 3 ? THREE_PLAYER : FOUR_PLAYER;
}

// 手牌分析结果
export interface HandAnalysis {
  valid: boolean;
  type: CardType | null;
  rank: number; // 关键点数（比较用）；invalid 时为 0
  length: number; // 顺子张数 / 连对对数 / 飞机组数；其余为 1
  kicker: 'singles' | 'pairs' | null; // 带牌形态（仅三带/四带/飞机带牌有意义）
}
