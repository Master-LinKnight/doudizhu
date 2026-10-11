import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { analyzeHand } from '../src/game/hand.js';
import { beats, isValidPlay } from '../src/game/rules.js';
import { c, nOf, seq, SJ, BJ, A, TWO } from './helpers.js';

function a(cards: number[], mode = THREE_PLAYER) {
  return analyzeHand(cards, mode);
}

describe('大小比较 beats', () => {
  it('单张：A > K，2 > A，大王 > 小王 > 2', () => {
    expect(beats(a([c(A)]), a([c(13)]))).toBe(true);
    expect(beats(a([c(TWO)]), a([c(A)]))).toBe(true);
    expect(beats(a([BJ()]), a([SJ()]))).toBe(true);
    expect(beats(a([SJ()]), a([c(TWO)]))).toBe(true);
    expect(beats(a([c(4)]), a([c(5)]))).toBe(false);
  });

  it('对子：AA > KK', () => {
    expect(beats(a(nOf(A, 2)), a(nOf(13, 2)))).toBe(true);
    expect(beats(a(nOf(13, 2)), a(nOf(A, 2)))).toBe(false);
  });

  it('顺子：78910J > 45678（比最大牌 J vs 8）', () => {
    expect(beats(a(seq([7, 8, 9, 10, 11])), a(seq([4, 5, 6, 7, 8])))).toBe(true);
  });

  it('顺子不同长度不能比较', () => {
    expect(beats(a(seq([3, 4, 5, 6, 7, 8])), a(seq([4, 5, 6, 7, 8])))).toBe(false);
  });

  it('不同类型（同为普通牌型）不能互压', () => {
    expect(beats(a(nOf(3, 2)), a([c(5)]))).toBe(false); // 对子 vs 单张
    expect(beats(a(nOf(3, 3)), a(nOf(4, 2)))).toBe(false); // 三张 vs 对子
  });

  it('飞机带单与飞机带对不能互压', () => {
    expect(beats(a([...nOf(4, 3), ...nOf(5, 3), c(6), c(7)]), a([...nOf(3, 3), ...nOf(4, 3), ...nOf(5, 2), ...nOf(6, 2)]))).toBe(false);
  });

  it('炸弹：8888 > 7777，2222 最大', () => {
    expect(beats(a(nOf(8, 4)), a(nOf(7, 4)))).toBe(true);
    expect(beats(a(nOf(TWO, 4)), a(nOf(A, 4)))).toBe(true);
  });

  it('炸弹压所有普通牌型', () => {
    expect(beats(a(nOf(3, 4)), a(seq([3, 4, 5, 6, 7])))).toBe(true);
    expect(beats(a(nOf(3, 4)), a([c(TWO)]))).toBe(true);
  });

  it('火箭压炸弹与普通牌型', () => {
    expect(beats(a([SJ(), BJ()]), a(nOf(TWO, 4)))).toBe(true);
    expect(beats(a([SJ(), BJ()]), a([c(TWO)]))).toBe(true);
    expect(beats(a(nOf(TWO, 4)), a([SJ(), BJ()]))).toBe(false);
  });

  it('天王炸（四人）压火箭与一切', () => {
    const superRocket = a([SJ(0), SJ(1), BJ(0), BJ(1)], FOUR_PLAYER);
    expect(beats(superRocket, a([SJ(0), BJ(0)]))).toBe(true);
    expect(beats(superRocket, a(nOf(TWO, 4), FOUR_PLAYER))).toBe(true);
    expect(beats(a([SJ(0), BJ(0)]), superRocket)).toBe(false);
  });

  it('四带二按四张点数比较（带牌形态不影响）', () => {
    expect(beats(a([...nOf(9, 4), c(3), c(4)]), a([...nOf(5, 4), ...nOf(6, 2)]))).toBe(true);
    expect(beats(a([...nOf(5, 4), ...nOf(6, 2)]), a([...nOf(9, 4), c(3), c(4)]))).toBe(false);
  });
});

describe('isValidPlay 出牌合法性', () => {
  it('首出任意合法牌型', () => {
    expect(isValidPlay([c(3)], null, THREE_PLAYER).valid).toBe(true);
    expect(isValidPlay(nOf(3, 4), null, THREE_PLAYER).valid).toBe(true);
  });

  it('首出非法牌型拒绝', () => {
    expect(isValidPlay(seq([3, 4, 5, 6]), null, THREE_PLAYER).valid).toBe(false);
  });

  it('跟牌必须更大且同类型', () => {
    const last = a([c(5)]);
    expect(isValidPlay([c(6)], last, THREE_PLAYER).valid).toBe(true);
    expect(isValidPlay([c(4)], last, THREE_PLAYER).valid).toBe(false);
    expect(isValidPlay(nOf(6, 2), last, THREE_PLAYER).valid).toBe(false); // 对子不能压单张
  });

  it('跟牌可用炸弹/火箭越级', () => {
    expect(isValidPlay(nOf(3, 4), a([c(TWO)]), THREE_PLAYER).valid).toBe(true);
    expect(isValidPlay([SJ(), BJ()], a(nOf(TWO, 4)), THREE_PLAYER).valid).toBe(true);
  });

  it('四人模式 6 张同点数不能出', () => {
    expect(isValidPlay(nOf(7, 6), null, FOUR_PLAYER).valid).toBe(false);
  });
});
