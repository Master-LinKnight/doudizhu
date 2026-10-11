// simulate.ts — 对局模拟器：用 AI 从发牌到结算独立打完一整局
//
// 结果只取决于 (mode, seed, difficulty)，纯函数、可回放。

import type { ModeConfig } from '../types.js';
import type { GameState } from '../engine.js';
import { createGame, bid, play, pass } from '../engine.js';
import { createRng, hashSeed } from '../fairness.js';
import { buildAiView, buildBidView } from './isolation.js';
import { decideBid, decidePlay } from './ruleAi.js';
import type { Difficulty } from './provider.js';

export function simulateGame(
  mode: ModeConfig,
  seed: number | string,
  difficulty: Difficulty | Difficulty[],
): GameState {
  const diffs = typeof difficulty === 'string' ? Array<Difficulty>(mode.players).fill(difficulty) : difficulty;
  const aiRng = createRng(hashSeed(`${String(seed)}:ai`));
  let s = createGame(mode, seed);
  let guard = 0;
  while (s.phase !== 'settled' && guard < 100000) {
    guard++;
    const p = s.currentPlayer;
    const d = diffs[p];
    if (s.phase === 'bidding') {
      const bv = buildBidView(s, p);
      const dec = decideBid(bv, d);
      s = bid(s, { player: p, type: dec.action, score: dec.score });
    } else {
      const view = buildAiView(s, p);
      const dec = decidePlay(view, d, { rng: aiRng });
      if (dec.action === 'pass') s = pass(s, { player: p });
      else s = play(s, { player: p, cards: dec.cards });
    }
  }
  if (s.phase !== 'settled') throw new Error('对局未在迭代上限内结束');
  return s;
}
