import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { analyzeHand, splitSameRank } from '../src/game/hand.js';
import { c, nOf, seq, SJ, BJ, A, TWO } from './helpers.js';

function a(cards: number[], mode = THREE_PLAYER) {
  return analyzeHand(cards, mode);
}

describe('单张 / 对子 / 三张 / 炸弹', () => {
  it('单张：3 / 2 / A / 大小王', () => {
    expect(a([c(3)])).toMatchObject({ valid: true, type: 'single', rank: 3 });
    expect(a([c(TWO)])).toMatchObject({ valid: true, type: 'single', rank: 15 });
    expect(a([c(A)])).toMatchObject({ valid: true, type: 'single', rank: 14 });
    expect(a([SJ()])).toMatchObject({ valid: true, type: 'single', rank: 16 });
    expect(a([BJ()])).toMatchObject({ valid: true, type: 'single', rank: 17 });
  });

  it('对子 / 三张', () => {
    expect(a([c(5, 0), c(5, 1)])).toMatchObject({ valid: true, type: 'pair', rank: 5 });
    expect(a(nOf(7, 3))).toMatchObject({ valid: true, type: 'triple', rank: 7 });
    expect(a(nOf(TWO, 2))).toMatchObject({ valid: true, type: 'pair', rank: 15 });
  });

  it('炸弹（四张同点数）', () => {
    expect(a(nOf(3, 4))).toMatchObject({ valid: true, type: 'bomb', rank: 3 });
    expect(a(nOf(TWO, 4))).toMatchObject({ valid: true, type: 'bomb', rank: 15 });
  });

  it('两对不是合法牌型', () => {
    expect(a([c(4, 0), c(4, 1), c(5, 0), c(5, 1)]).valid).toBe(false);
  });

  it('空手不合法', () => {
    expect(a([]).valid).toBe(false);
  });
});

describe('火箭 / 天王炸', () => {
  it('小王 + 大王 = 火箭（三人/四人通用）', () => {
    expect(a([SJ(), BJ()])).toMatchObject({ valid: true, type: 'rocket' });
    expect(a([SJ(), BJ()], FOUR_PLAYER)).toMatchObject({ valid: true, type: 'rocket' });
  });

  it('四人模式四张王 = 天王炸', () => {
    expect(a([SJ(0), SJ(1), BJ(0), BJ(1)], FOUR_PLAYER)).toMatchObject({
      valid: true,
      type: 'super-rocket',
    });
  });

  it('四人模式两张小王 = 对子（不是火箭）', () => {
    expect(a([SJ(0), SJ(1)], FOUR_PLAYER)).toMatchObject({ valid: true, type: 'pair', rank: 16 });
  });
});

describe('三带一 / 三带二', () => {
  it('三带一 333+4', () => {
    expect(a([...nOf(3, 3), c(4)])).toMatchObject({ valid: true, type: 'triple-single', rank: 3 });
  });

  it('三带一可带 2 / 王', () => {
    expect(a([...nOf(3, 3), c(TWO)])).toMatchObject({ valid: true, type: 'triple-single', rank: 3 });
    expect(a([...nOf(3, 3), BJ()])).toMatchObject({ valid: true, type: 'triple-single', rank: 3 });
  });

  it('三带二 333+44', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 2)])).toMatchObject({ valid: true, type: 'triple-pair', rank: 3 });
  });

  it('三带二所带对子不能与三张同点数（自动由张数保证）', () => {
    // 3333 是炸弹，不是三带二
    expect(a(nOf(3, 4)).type).toBe('bomb');
  });

  it('三带二带王炸（小王+大王）不是对子，不合法', () => {
    expect(a([...nOf(3, 3), SJ(), BJ()]).valid).toBe(false);
  });

  it('三带二带王对（四人两副）合法', () => {
    expect(a([...nOf(3, 3), SJ(0), SJ(1)], FOUR_PLAYER)).toMatchObject({
      valid: true,
      type: 'triple-pair',
      rank: 3,
    });
  });
});

describe('顺子', () => {
  it('最小顺子 34567', () => {
    expect(a(seq([3, 4, 5, 6, 7]))).toMatchObject({ valid: true, type: 'straight', rank: 7, length: 5 });
  });

  it('最大顺子 10JQKA', () => {
    expect(a(seq([10, 11, 12, 13, 14]))).toMatchObject({ valid: true, type: 'straight', rank: 14, length: 5 });
  });

  it('全连 3~A（12 张）', () => {
    const ranks = Array.from({ length: 12 }, (_, i) => 3 + i);
    expect(a(seq(ranks))).toMatchObject({ valid: true, type: 'straight', rank: 14, length: 12 });
  });

  it('不含 2', () => {
    expect(a(seq([3, 4, 5, 6, TWO])).valid).toBe(false);
    expect(a(seq([10, 11, 12, 13, TWO])).valid).toBe(false);
    expect(a(seq([TWO, 3, 4, 5, 6])).valid).toBe(false);
  });

  it('不含王', () => {
    expect(a([c(3), c(4), c(5), c(6), SJ()]).valid).toBe(false);
  });

  it('少于 5 张不成立', () => {
    expect(a(seq([3, 4, 5, 6])).valid).toBe(false);
  });

  it('不连续不成立', () => {
    expect(a(seq([3, 4, 5, 6, 8])).valid).toBe(false);
  });

  it('含对子不成立', () => {
    expect(a([c(3), c(4), c(5), c(5, 1), c(6)]).valid).toBe(false);
  });
});

describe('连对', () => {
  it('3 连对 334455', () => {
    expect(a([...nOf(3, 2), ...nOf(4, 2), ...nOf(5, 2)])).toMatchObject({
      valid: true,
      type: 'straight-pairs',
      rank: 5,
      length: 3,
    });
  });

  it('4 连对', () => {
    expect(a([...nOf(6, 2), ...nOf(7, 2), ...nOf(8, 2), ...nOf(9, 2)])).toMatchObject({
      valid: true,
      type: 'straight-pairs',
      rank: 9,
      length: 4,
    });
  });

  it('不含 2（QQKKAA 之后接 2 不成立）', () => {
    expect(a([...nOf(12, 2), ...nOf(13, 2), ...nOf(TWO, 2)]).valid).toBe(false);
  });

  it('少于 3 对不成立', () => {
    expect(a([...nOf(3, 2), ...nOf(4, 2)]).valid).toBe(false);
  });
});

describe('飞机', () => {
  it('2 组三张 333444', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3)])).toMatchObject({ valid: true, type: 'airplane', rank: 4, length: 2 });
  });

  it('3 组三张 555666777', () => {
    expect(a([...nOf(5, 3), ...nOf(6, 3), ...nOf(7, 3)])).toMatchObject({
      valid: true,
      type: 'airplane',
      rank: 7,
      length: 3,
    });
  });

  it('不连续不成立', () => {
    expect(a([...nOf(3, 3), ...nOf(5, 3)]).valid).toBe(false);
  });

  it('不含 2（KKK AAA 222 不成立）', () => {
    expect(a([...nOf(13, 3), ...nOf(14, 3), ...nOf(TWO, 3)]).valid).toBe(false);
  });
});

describe('飞机带单 / 带对', () => {
  it('飞机带单 333444+5+6', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3), c(5), c(6)])).toMatchObject({
      valid: true,
      type: 'airplane-singles',
      rank: 4,
      length: 2,
      kicker: 'singles',
    });
  });

  it('飞机带对 333444+55+66', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3), ...nOf(5, 2), ...nOf(6, 2)])).toMatchObject({
      valid: true,
      type: 'airplane-pairs',
      rank: 4,
      length: 2,
      kicker: 'pairs',
    });
  });

  it('带牌可含王', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3), SJ(), BJ()])).toMatchObject({
      valid: true,
      type: 'airplane-singles',
      rank: 4,
    });
  });

  it('带牌数量不对不成立', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3), c(5)]).valid).toBe(false); // 2 组三张 + 1 单
    expect(a([...nOf(3, 3), ...nOf(4, 3), ...nOf(5, 2)]).valid).toBe(false); // 2 组三张 + 1 对
  });

  it('带牌混搭（单+对）不成立', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3), ...nOf(5, 2), c(6)]).valid).toBe(false);
  });

  it('多组连续三张 3 组带单', () => {
    expect(a([...nOf(3, 3), ...nOf(4, 3), ...nOf(5, 3), c(6), c(7), c(8)])).toMatchObject({
      valid: true,
      type: 'airplane-singles',
      rank: 5,
      length: 3,
    });
  });
});

describe('四带二', () => {
  it('四带两张单（6 张）', () => {
    expect(a([...nOf(3, 4), c(5), c(6)])).toMatchObject({
      valid: true,
      type: 'four-two',
      rank: 3,
      kicker: 'singles',
    });
  });

  it('四带一对（6 张）', () => {
    expect(a([...nOf(3, 4), ...nOf(5, 2)])).toMatchObject({ valid: true, type: 'four-two', rank: 3 });
  });

  it('四带两对（8 张）', () => {
    expect(a([...nOf(3, 4), ...nOf(5, 2), ...nOf(6, 2)])).toMatchObject({
      valid: true,
      type: 'four-two',
      rank: 3,
      kicker: 'pairs',
    });
  });

  it('四张 + 单 + 对（混搭）不成立', () => {
    expect(a([...nOf(3, 4), c(5), ...nOf(6, 2)]).valid).toBe(false);
  });

  it('四张 + 三张不成立', () => {
    expect(a([...nOf(3, 4), ...nOf(5, 3)]).valid).toBe(false);
  });
});

describe('四人模式：同点数拆分', () => {
  it('5~8 张同点数不作为单一牌型', () => {
    for (let n = 5; n <= 8; n++) {
      expect(a(nOf(7, n), FOUR_PLAYER).valid).toBe(false);
    }
  });

  it('4 张同点数在四人模式仍是炸弹', () => {
    expect(a(nOf(7, 4), FOUR_PLAYER)).toMatchObject({ valid: true, type: 'bomb', rank: 7 });
  });

  it('splitSameRank：6 张拆为 4+2', () => {
    const r = splitSameRank(nOf(7, 6), FOUR_PLAYER);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.bomb).toHaveLength(4);
      expect(r.kickers).toHaveLength(2);
      expect(analyzeHand(r.bomb, FOUR_PLAYER).type).toBe('bomb');
    }
  });

  it('splitSameRank：5 张拆为 4+1', () => {
    const r = splitSameRank(nOf(7, 5), FOUR_PLAYER);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.kickers).toHaveLength(1);
  });

  it('splitSameRank：三人模式或非全同点数不拆分', () => {
    expect(splitSameRank(nOf(7, 6), THREE_PLAYER).valid).toBe(false);
    expect(splitSameRank([...nOf(7, 4), c(8)], FOUR_PLAYER).valid).toBe(false);
  });
});
