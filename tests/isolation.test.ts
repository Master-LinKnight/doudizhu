import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { createGame, bid } from '../src/game/engine.js';
import { buildAiView, type AiView } from '../src/game/ai/isolation.js';

function toPlaying(mode: typeof THREE_PLAYER | typeof FOUR_PLAYER, seed: number) {
  let g = createGame(mode, seed);
  g = bid(g, { player: g.currentPlayer, type: 'bid', score: 3 });
  return g;
}

/** 视角中出现的所有牌（手牌 + 公共出牌历史 + 当前待跟牌） */
function collectCards(view: AiView): Set<number> {
  const s = new Set<number>(view.myHand);
  for (const p of view.publicPlayHistory) for (const c of p.cards) s.add(c);
  if (view.lastPlay) for (const c of view.lastPlay.cards) s.add(c);
  return s;
}

describe('buildAiView 信息隔离', () => {
  it('三人：只含自己的手牌，不泄露他人手牌与底牌', () => {
    const g = toPlaying(THREE_PLAYER, 1);
    for (let seat = 0; seat < 3; seat++) {
      const view = buildAiView(g, seat);
      expect(view.myHand).toEqual(g.players[seat].hand);
      const inView = collectCards(view);
      for (let other = 0; other < 3; other++) {
        if (other === seat) continue;
        for (const c of g.players[other].hand) expect(inView.has(c)).toBe(false);
      }
    }
  });

  it('四人：只含自己的手牌，不泄露他人手牌', () => {
    const g = toPlaying(FOUR_PLAYER, 3);
    for (let seat = 0; seat < 4; seat++) {
      const view = buildAiView(g, seat);
      const inView = collectCards(view);
      for (let other = 0; other < 4; other++) {
        if (other === seat) continue;
        for (const c of g.players[other].hand) expect(inView.has(c)).toBe(false);
      }
    }
  });

  it('公开信息字段正确', () => {
    const g = toPlaying(THREE_PLAYER, 2);
    const view = buildAiView(g, 0);
    expect(view.myRole).toBe(g.landlord === 0 ? 'landlord' : 'farmer');
    expect(view.cardsRemaining).toEqual(g.players.map((p) => p.hand.length));
    expect(view.bidHistory).toEqual(g.bids);
    expect(view.lastPlay).toBeNull(); // 地主首出
  });

  it('手牌是副本，修改视角不影响游戏状态', () => {
    const g = toPlaying(THREE_PLAYER, 4);
    const view = buildAiView(g, 0);
    view.myHand.length = 0; // 清空视角手牌
    expect(g.players[0].hand.length).toBeGreaterThan(0); // 原状态不受影响
  });
});
