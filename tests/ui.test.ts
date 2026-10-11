import { describe, it, expect } from 'vitest';
import { createGame, bid, type GameState } from '../src/game/engine.js';
import { THREE_PLAYER } from '../src/game/types.js';
import { turnOrder } from '../src/renderer/ui.js';

/** 叫 3 分直接进入出牌阶段（当前玩家即地主） */
function toPlaying(seed = 1): GameState {
  let g = createGame(THREE_PLAYER, seed);
  g = bid(g, { player: g.currentPlayer, type: 'bid', score: 3 });
  return g;
}

describe('ui — 回合顺序提示', () => {
  it('叫分阶段：从首个叫分者开始顺时针轮转', () => {
    const g = createGame(THREE_PLAYER, 1);
    const first = g.currentPlayer;
    expect(turnOrder(g)).toEqual([first, (first + 1) % 3, (first + 2) % 3]);
  });

  it('叫分进行中：仍从首个叫分者开始', () => {
    let g = createGame(THREE_PLAYER, 1);
    const first = g.currentPlayer;
    g = bid(g, { player: g.currentPlayer, type: 'pass' });
    expect(g.phase).toBe('bidding');
    expect(turnOrder(g)).toEqual([first, (first + 1) % 3, (first + 2) % 3]);
  });

  it('出牌阶段：从地主开始顺时针轮转', () => {
    const g = toPlaying();
    expect(g.phase).toBe('playing');
    const landlord = g.landlord;
    expect(landlord).toBeGreaterThanOrEqual(0);
    expect(turnOrder(g)).toEqual([landlord, (landlord + 1) % 3, (landlord + 2) % 3]);
  });
});
