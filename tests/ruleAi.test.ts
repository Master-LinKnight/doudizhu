import { describe, it, expect } from 'vitest';
import { THREE_PLAYER } from '../src/game/types.js';
import { analyzeHand } from '../src/game/hand.js';
import { decideBid, decidePlay } from '../src/game/ai/ruleAi.js';
import type { AiView, BidView } from '../src/game/ai/isolation.js';
import type { Play } from '../src/game/engine.js';
import { c, nOf, seq, SJ, BJ, TWO } from './helpers.js';

function makeBidView(hand: number[], overrides: Partial<BidView> = {}): BidView {
  return { mode: THREE_PLAYER, mySeat: 0, myHand: hand, bids: [], highestBid: 0, ...overrides };
}

function makeView(hand: number[], lastPlay: Play | null): AiView {
  return {
    mode: THREE_PLAYER,
    mySeat: 0,
    myHand: hand,
    myRole: 'landlord',
    lastPlay,
    publicPlayHistory: [],
    bidHistory: [],
    cardsRemaining: [hand.length, 0, 0],
    landlordSeat: 0,
  };
}

function playOf(cards: number[]): Play {
  return { player: 1, cards, analysis: analyzeHand(cards, THREE_PLAYER) };
}

const strongHand = [...nOf(7, 4), SJ(0), BJ(0), ...nOf(TWO, 2)]; // 炸弹 + 火箭 + 2 个 2

describe('decideBid 叫地主', () => {
  it('强牌：easy 只叫 1，normal/hard 叫 3', () => {
    expect(decideBid(makeBidView(strongHand), 'easy')).toEqual({ action: 'bid', score: 1 });
    expect(decideBid(makeBidView(strongHand), 'normal')).toEqual({ action: 'bid', score: 3 });
    expect(decideBid(makeBidView(strongHand), 'hard')).toEqual({ action: 'bid', score: 3 });
  });

  it('弱牌：所有难度都不叫', () => {
    const weak = seq([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 3, 4, 5, 6, 7]); // 无 2/王/炸弹
    expect(decideBid(makeBidView(weak), 'easy').action).toBe('pass');
    expect(decideBid(makeBidView(weak), 'normal').action).toBe('pass');
    expect(decideBid(makeBidView(weak), 'hard').action).toBe('pass');
  });

  it('叫分严格高于此前最高分，否则过牌', () => {
    expect(decideBid(makeBidView(strongHand, { highestBid: 2 }), 'normal')).toEqual({ action: 'bid', score: 3 });
    expect(decideBid(makeBidView(strongHand, { highestBid: 3 }), 'normal')).toEqual({ action: 'pass' });
  });
});

describe('decidePlay 首出', () => {
  const hand = seq([3, 4, 5, 6, 7, 8, 9, 10]); // 8 张顺子 3-10

  it('easy 出最小单张', () => {
    const d = decidePlay(makeView(hand, null), 'easy');
    expect(d.action).toBe('play');
    expect(d.cards).toHaveLength(1);
    expect(analyzeHand(d.cards, THREE_PLAYER).rank).toBe(3);
  });

  it('normal/hard 出整条顺子', () => {
    for (const diff of ['normal', 'hard'] as const) {
      const d = decidePlay(makeView(hand, null), diff);
      expect(d.action).toBe('play');
      expect(d.cards).toHaveLength(8);
      expect(analyzeHand(d.cards, THREE_PLAYER).type).toBe('straight');
    }
  });
});

describe('decidePlay 跟牌', () => {
  it('easy 随机失误：mistakeRate=1 时即使可压也过牌', () => {
    const last = playOf([c(3)]);
    const hand = [c(7), c(9)];
    expect(decidePlay(makeView(hand, last), 'easy', { mistakeRate: 1 }).action).toBe('pass');
    expect(decidePlay(makeView(hand, last), 'easy', { mistakeRate: 0 }).action).toBe('play');
  });

  it('normal 保守保留炸弹；hard 在可快速收尾时用炸弹', () => {
    const last = playOf([c(TWO)]); // 单 2，无普通单牌可压
    const hand = [...nOf(3, 4), c(4), c(5)]; // 炸弹 3333 + 4 + 5
    expect(decidePlay(makeView(hand, last), 'normal').action).toBe('pass'); // 保留炸弹
    const hard = decidePlay(makeView(hand, last), 'hard');
    expect(hard.action).toBe('play'); // 炸弹后剩 2 手 ≤ 2，炸
    expect(analyzeHand(hard.cards, THREE_PLAYER).type).toBe('bomb');
  });

  it('hard 剩余手数 > 2 时也保留炸弹', () => {
    const last = playOf([c(TWO)]);
    const hand = [...nOf(3, 4), c(4), c(5), c(6), c(7)]; // 炸弹 + 4 散牌
    expect(decidePlay(makeView(hand, last), 'hard').action).toBe('pass');
  });

  it('无牌可压时所有难度都过牌', () => {
    const last = playOf([c(TWO)]);
    const hand = [c(3), c(4)];
    expect(decidePlay(makeView(hand, last), 'easy').action).toBe('pass');
    expect(decidePlay(makeView(hand, last), 'normal').action).toBe('pass');
    expect(decidePlay(makeView(hand, last), 'hard').action).toBe('pass');
  });
});
