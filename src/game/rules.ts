// rules.ts — 出牌合法性与大小比较（纯函数）
//
// 比较规则（规格书第 5 节）：
//   普通牌型只能与同类型（且同长度）比较「最大一张/一组」的点数；
//   炸弹 > 所有普通牌型；火箭 > 炸弹；天王炸（四人）> 一切。

import type { Card, HandAnalysis, ModeConfig } from './types.js';
import { analyzeHand } from './hand.js';

/** 判断 a 是否能压过 b（同类型且更大，或炸弹/火箭越级） */
export function beats(a: HandAnalysis, b: HandAnalysis): boolean {
  if (!a.valid || !b.valid) return false;

  if (a.type === 'super-rocket') return true;
  if (b.type === 'super-rocket') return false;

  if (a.type === 'rocket') return b.type !== 'rocket';
  if (b.type === 'rocket') return false;

  if (a.type === 'bomb') return b.type === 'bomb' ? a.rank > b.rank : true;
  if (b.type === 'bomb') return false;

  if (a.type !== b.type) return false;
  if (a.length !== b.length) return false;
  return a.rank > b.rank;
}

export interface PlayValidation {
  valid: boolean;
  analysis: HandAnalysis;
}

/**
 * 判断某手牌在当前局面下是否合法。
 * - lastPlay 为 null 表示首出：任意合法牌型均可。
 * - 否则须能压过 lastPlay。
 */
export function isValidPlay(
  cards: Card[],
  lastPlay: HandAnalysis | null,
  mode: ModeConfig,
): PlayValidation {
  const analysis = analyzeHand(cards, mode);
  if (!analysis.valid) return { valid: false, analysis };
  if (lastPlay === null) return { valid: true, analysis };
  return { valid: beats(analysis, lastPlay), analysis };
}
