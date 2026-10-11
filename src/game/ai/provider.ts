// provider.ts — AI 抽象接口（规格书第 4 节）
//
// 本地算法为默认实现；LLM 作为可选实现（阶段 4）。统一走 AiView 信息隔离。

import type { Card } from '../types.js';
import type { AiView, BidView } from './isolation.js';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface Decision {
  action: 'play' | 'pass';
  cards: Card[]; // action === 'play' 时有效，否则为空
}

export interface BidDecision {
  action: 'pass' | 'bid';
  score?: number;
}

/**
 * AI 统一抽象（规格书第 4 节）。本地算法为默认实现，LLM 为可选实现，
 * 二者都严格走同一套信息隔离接口（AiView/BidView），公平性一致。
 */
export interface AiProvider {
  readonly kind: 'rule' | 'llm';
  readonly difficulty: Difficulty;
  /** 出牌/过牌决策 */
  decide(view: AiView): Promise<Decision>;
  /** 叫地主决策 */
  decideBid(view: BidView): Promise<BidDecision>;
}
