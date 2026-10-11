import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { analyzeHand } from '../src/game/hand.js';
import {
  enumeratePlays,
  findBeatingPlays,
  decompose,
  estimateHandCount,
} from '../src/game/ai/decompose.js';
import { c, nOf, seq, SJ, BJ, TWO } from './helpers.js';

const sig = (cs: number[]) => [...cs].sort((a, b) => a - b).join(',');

describe('enumeratePlays 候选枚举', () => {
  it('包含单张、对子、三张、炸弹', () => {
    const hand = [...nOf(3, 4), ...nOf(5, 3), ...nOf(7, 2), c(9)];
    const set = new Set(enumeratePlays(hand, THREE_PLAYER).map(sig));
    expect(set.has(sig([c(9)]))).toBe(true);
    expect(set.has(sig(nOf(7, 2)))).toBe(true);
    expect(set.has(sig(nOf(5, 3)))).toBe(true);
    expect(set.has(sig(nOf(3, 4)))).toBe(true);
  });

  it('枚举出整条顺子', () => {
    const hand = seq([3, 4, 5, 6, 7, 8, 9, 10]);
    const plays = enumeratePlays(hand, THREE_PLAYER);
    expect(plays.some((p) => analyzeHand(p, THREE_PLAYER).type === 'straight' && p.length === 8)).toBe(true);
  });

  it('枚举出火箭与（四人）天王炸', () => {
    const rocket = [SJ(0), BJ(0)];
    expect(enumeratePlays(rocket, THREE_PLAYER).some((p) => analyzeHand(p, THREE_PLAYER).type === 'rocket')).toBe(true);

    const superRocket = [SJ(0), SJ(1), BJ(0), BJ(1)];
    expect(enumeratePlays(superRocket, FOUR_PLAYER).some((p) => analyzeHand(p, FOUR_PLAYER).type === 'super-rocket')).toBe(true);
  });

  it('所有枚举结果均为合法牌型', () => {
    const hand = [...seq([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), ...nOf(4, 4), ...nOf(6, 3), ...nOf(9, 2), SJ(0), BJ(0)];
    for (const p of enumeratePlays(hand, THREE_PLAYER)) {
      expect(analyzeHand(p, THREE_PLAYER).valid).toBe(true);
    }
  });
});

describe('findBeatingPlays 压牌搜索', () => {
  it('找到能压过单张的更大单张', () => {
    const last = analyzeHand([c(5)], THREE_PLAYER);
    const hand = [c(3), c(7), c(10)];
    const plays = findBeatingPlays(hand, last, THREE_PLAYER);
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((p) => analyzeHand(p, THREE_PLAYER).rank > 5)).toBe(true);
  });

  it('无牌可压时返回空', () => {
    const last = analyzeHand([c(TWO)], THREE_PLAYER);
    expect(findBeatingPlays([c(3), c(4)], last, THREE_PLAYER)).toHaveLength(0);
  });

  it('炸弹可越级压普通牌', () => {
    const last = analyzeHand([c(TWO)], THREE_PLAYER);
    const hand = [...nOf(3, 4), c(4)];
    const plays = findBeatingPlays(hand, last, THREE_PLAYER);
    expect(plays.some((p) => analyzeHand(p, THREE_PLAYER).type === 'bomb')).toBe(true);
  });

  it('顺子只能被同长度更大顺子压', () => {
    const last = analyzeHand(seq([3, 4, 5, 6, 7]), THREE_PLAYER);
    const hand = seq([4, 5, 6, 7, 8]);
    const plays = findBeatingPlays(hand, last, THREE_PLAYER);
    expect(plays.some((p) => analyzeHand(p, THREE_PLAYER).type === 'straight')).toBe(true);
  });
});

describe('decompose / estimateHandCount 拆解与估值', () => {
  it('拆解后每手合法且恰好覆盖手牌', () => {
    const hand = [...seq([3, 4, 5, 6, 7, 8, 9, 10]), ...nOf(11, 3), ...nOf(13, 2), SJ(0), BJ(0)];
    const plays = decompose(hand, THREE_PLAYER);
    expect(plays.flat().sort((a, b) => a - b)).toEqual([...hand].sort((a, b) => a - b));
    for (const p of plays) expect(analyzeHand(p, THREE_PLAYER).valid).toBe(true);
  });

  it('已成型的大牌估算为最少手数', () => {
    expect(estimateHandCount(seq([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]), THREE_PLAYER)).toBe(1); // 12 张顺子
    expect(estimateHandCount(nOf(8, 4), THREE_PLAYER)).toBe(1); // 炸弹
  });

  it('散牌手数等于张数', () => {
    expect(estimateHandCount([c(3), c(5), c(9), c(11)], THREE_PLAYER)).toBe(4);
  });
});
