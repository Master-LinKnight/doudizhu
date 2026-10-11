// audit.ts — 公平性验证（阶段 5）：回放审计与对局一致性核对
//
// 纯函数、无 UI 依赖。核心能力：
//   replayGame —— 由 (mode, seed, log) 重建整局：重新发牌 + 按日志重放每个动作。
//                 引擎对非法动作（越位叫分 / 出牌不在手 / 非法牌型 / 压不过上家等）
//                 一律抛错，故「能完整重放」即「每一步都合法」。
//   auditGame  —— 重放并核对：终态必须已结算，且重放日志与原日志逐条一致（含结算项）。

import type { ModeConfig } from './types.js';
import { createGame, bid, play, pass, type GameState, type GameLogEntry } from './engine.js';

export interface AuditResult {
  ok: boolean;
  violations: string[];
  replayed: GameState | null;
}

/** 按日志重放整局（跳过引擎自动生成的 redeal / settle 标记，动作项逐条执行） */
export function replayGame(mode: ModeConfig, seed: number | string, log: GameLogEntry[]): GameState {
  let state = createGame(mode, seed);
  for (const e of log) {
    if (e.kind === 'bid') state = bid(state, { player: e.player, type: e.type, score: e.score });
    else if (e.kind === 'play') state = play(state, { player: e.player, cards: e.cards });
    else if (e.kind === 'pass') state = pass(state, { player: e.player });
    // 'redeal' / 'settle' 是引擎自动产生的标记，重放时无需手动推进
  }
  return state;
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** 审计一局：重放 + 核对终态与日志一致性。violations 为空即 ok。 */
export function auditGame(mode: ModeConfig, seed: number | string, log: GameLogEntry[]): AuditResult {
  const violations: string[] = [];
  let replayed: GameState | null = null;
  try {
    replayed = replayGame(mode, seed, log);
  } catch (e) {
    return { ok: false, violations: [(e as Error).message], replayed: null };
  }

  if (replayed.phase !== 'settled') violations.push('重放后对局未结算');
  if (log.length === 0 || log[log.length - 1].kind !== 'settle') violations.push('日志缺少结算项');

  const settle = log[log.length - 1];
  if (settle.kind === 'settle' && replayed.phase === 'settled') {
    if (replayed.winner !== settle.winner) violations.push(`winner 不一致：重放 ${replayed.winner} / 日志 ${settle.winner}`);
    if (replayed.landlordWon !== settle.landlordWon) violations.push('landlordWon 不一致');
    if (replayed.multiplier !== settle.multiplier) violations.push(`multiplier 不一致：重放 ${replayed.multiplier} / 日志 ${settle.multiplier}`);
    if (!arraysEqual(replayed.scores, settle.scores)) {
      violations.push(`scores 不一致：重放 [${replayed.scores}] / 日志 [${settle.scores}]`);
    }
  }

  if (JSON.stringify(replayed.log) !== JSON.stringify(log)) {
    violations.push('重放日志与原日志不一致');
  }

  return { ok: violations.length === 0, violations, replayed };
}
