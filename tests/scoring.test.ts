import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { calculateMultiplier, settle } from '../src/game/scoring.js';

describe('计分与翻倍', () => {
  it('无翻倍：倍数 1', () => {
    expect(calculateMultiplier({ bombs: 0, rockets: 0, spring: false, antiSpring: false })).toBe(1);
  });

  it('两个炸弹一个火箭：1×2×2×2 = 8', () => {
    expect(calculateMultiplier({ bombs: 2, rockets: 1, spring: false, antiSpring: false })).toBe(8);
  });

  it('春天 / 反春天各 ×2', () => {
    expect(calculateMultiplier({ bombs: 0, rockets: 0, spring: true, antiSpring: false })).toBe(2);
    expect(calculateMultiplier({ bombs: 1, rockets: 0, spring: false, antiSpring: true })).toBe(4);
  });

  it('三人地主胜：每名农民向地主支付底分×倍数', () => {
    const r = settle({
      mode: THREE_PLAYER,
      baseScore: 1,
      landlordWon: true,
      landlord: 0,
      bombs: 0,
      rockets: 0,
      spring: false,
      antiSpring: false,
    });
    expect(r.multiplier).toBe(1);
    expect(r.scores).toEqual([2, -1, -1]);
    expect(r.landlordScore).toBe(2);
  });

  it('三人农民胜：地主向每名农民支付（2 炸弹翻倍）', () => {
    const r = settle({
      mode: THREE_PLAYER,
      baseScore: 3,
      landlordWon: false,
      landlord: 0,
      bombs: 2,
      rockets: 0,
      spring: false,
      antiSpring: false,
    });
    expect(r.multiplier).toBe(4);
    expect(r.scores).toEqual([-24, 12, 12]);
  });

  it('四人地主胜：三名农民各支付', () => {
    const r = settle({
      mode: FOUR_PLAYER,
      baseScore: 2,
      landlordWon: true,
      landlord: 0,
      bombs: 1,
      rockets: 0,
      spring: false,
      antiSpring: false,
    });
    expect(r.multiplier).toBe(2);
    expect(r.scores).toEqual([12, -4, -4, -4]);
  });

  it('分数总和为零（零和）', () => {
    const r = settle({
      mode: FOUR_PLAYER,
      baseScore: 3,
      landlordWon: false,
      landlord: 2,
      bombs: 1,
      rockets: 1,
      spring: false,
      antiSpring: false,
    });
    expect(r.scores.reduce((x, y) => x + y, 0)).toBe(0);
  });
});
