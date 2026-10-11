// timeout.ts — 回合限时：出牌阶段每位玩家须在限时内完成出牌，超时自动行动。
// 纯函数（无 UI / 无定时器），便于测试；实际计时由 App.tsx 的 React 效果驱动。

import type { Card } from './types.js';
import type { GameState } from './engine.js';

/** 常规出牌限时（秒） */
export const TURN_SECONDS = 30;
/** 地主首次出牌限时（秒） */
export const LANDLORD_FIRST_SECONDS = 45;

/** 当前回合的限时秒数：地主首次出牌 45 秒，其余 30 秒 */
export function turnSeconds(state: GameState): number {
  if (state.phase !== 'playing') return TURN_SECONDS;
  const landlord = state.landlord;
  if (state.currentPlayer === landlord && state.players[landlord].playedCount === 0) {
    return LANDLORD_FIRST_SECONDS;
  }
  return TURN_SECONDS;
}

export type TimeoutAction =
  | { type: 'bid-pass' }
  | { type: 'pass' }
  | { type: 'play'; cards: Card[] };

/**
 * 超时后的自动行动：
 * - 叫分阶段 → 不叫（bid-pass）；
 * - 出牌阶段能过牌（上一手非空）→ 过牌；
 * - 首出（必须出牌）→ 出最小单张（手牌降序排列，末位最小）。
 */
export function timeoutAction(state: GameState): TimeoutAction {
  if (state.phase === 'bidding') return { type: 'bid-pass' };
  if (state.lastPlay !== null) return { type: 'pass' };
  const hand = state.players[state.currentPlayer].hand;
  if (hand.length === 0) return { type: 'pass' }; // 不应发生（空手已结算），兜底
  return { type: 'play', cards: [hand[hand.length - 1]] };
}
