// scoring.ts — 计分与翻倍（纯函数）
//
// 倍数（规格书第 8 节）：初始为 1，每打出一个炸弹 ×2、火箭/天王炸 ×2、春天 ×2、反春天 ×2。
// 结算：地主胜 → 每名农民向地主支付「底分 × 倍数」；农民胜 → 地主向每名农民支付「底分 × 倍数」。

import type { ModeConfig } from './types.js';

export interface MultiplierInput {
  bombs: number; // 普通炸弹数量
  rockets: number; // 火箭 / 天王炸数量
  spring: boolean; // 春天
  antiSpring: boolean; // 反春天
}

export function calculateMultiplier(input: MultiplierInput): number {
  let m = 1;
  for (let i = 0; i < input.bombs; i++) m *= 2;
  for (let i = 0; i < input.rockets; i++) m *= 2;
  if (input.spring) m *= 2;
  if (input.antiSpring) m *= 2;
  return m;
}

export interface SettleParams extends MultiplierInput {
  mode: ModeConfig;
  baseScore: number; // 1 | 2 | 3
  landlordWon: boolean;
  landlord: number; // 地主座位
}

export interface SettleResult {
  multiplier: number;
  baseScore: number;
  landlordWon: boolean;
  scores: number[]; // scores[i] 为玩家 i 本局分数变化（正为赢，负为输）
  landlordScore: number;
}

export function settle(params: SettleParams): SettleResult {
  const multiplier = calculateMultiplier(params);
  const unit = params.baseScore * multiplier;
  const scores = new Array<number>(params.mode.players).fill(0);
  for (let i = 0; i < params.mode.players; i++) {
    if (i === params.landlord) continue;
    if (params.landlordWon) {
      scores[i] -= unit;
      scores[params.landlord] += unit;
    } else {
      scores[i] += unit;
      scores[params.landlord] -= unit;
    }
  }
  return {
    multiplier,
    baseScore: params.baseScore,
    landlordWon: params.landlordWon,
    scores,
    landlordScore: scores[params.landlord],
  };
}
