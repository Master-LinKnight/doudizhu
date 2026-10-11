import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import type { GameState } from '../src/game/engine.js';
import { simulateGame } from '../src/game/ai/simulate.js';
import { DIFFICULTIES } from '../src/game/ai/provider.js';

function totalPlays(state: GameState): number {
  return state.log.filter((e) => e.kind === 'play').length;
}

describe('simulateGame — 三档 AI 独立完整对局', () => {
  it.each(DIFFICULTIES)('难度 %s：三人完整打完，出牌全部合法，结算零和', (diff) => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = simulateGame(THREE_PLAYER, seed, diff);
      expect(g.phase).toBe('settled'); // 引擎对非法出牌会抛错，能结算即全部合法
      expect(g.winner).toBeGreaterThanOrEqual(0);
      expect(g.players[g.winner].hand).toHaveLength(0);
      expect(g.scores.reduce((x, y) => x + y, 0)).toBe(0);
    }
  });

  it.each(DIFFICULTIES)('难度 %s：四人完整打完，出牌全部合法，结算零和', (diff) => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = simulateGame(FOUR_PLAYER, seed, diff);
      expect(g.phase).toBe('settled');
      expect(g.winner).toBeGreaterThanOrEqual(0);
      expect(g.players[g.winner].hand).toHaveLength(0);
      expect(g.scores.reduce((x, y) => x + y, 0)).toBe(0);
    }
  });

  it('同种子同难度 → 相同终局（回放确定性）', () => {
    expect(simulateGame(THREE_PLAYER, 42, 'easy')).toEqual(simulateGame(THREE_PLAYER, 42, 'easy'));
    expect(simulateGame(FOUR_PLAYER, 42, 'hard')).toEqual(simulateGame(FOUR_PLAYER, 42, 'hard'));
  });

  it('难度区分：easy 累计出牌手数明显多于 hard', () => {
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
    let easyTotal = 0;
    let hardTotal = 0;
    for (const seed of seeds) {
      easyTotal += totalPlays(simulateGame(THREE_PLAYER, seed, 'easy'));
      hardTotal += totalPlays(simulateGame(THREE_PLAYER, seed, 'hard'));
    }
    expect(easyTotal).toBeGreaterThan(hardTotal);
  });
});
