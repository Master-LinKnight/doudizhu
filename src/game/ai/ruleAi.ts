// ruleAi.ts — 本地规则算法 AI（三档难度，纯函数 + 可设种子随机）
//
// 难度策略：
//   easy   —— 贪心：首出最小牌，跟牌压最小牌；含随机失误（可能可压却过牌）。
//   normal —— 估值 + 一步前瞻：首出尽量出「多张、低点」的结构牌；跟牌出最省的一手，
//             且保守保留炸弹（非炸弹不炸）。
//   hard   —— 估值 + 前瞻：首出/跟牌都选「剩余手数最少」的一手；非被迫时，
//             仅当炸弹后剩余手数 ≤ 2 才用炸弹（善用炸弹抢控制权）。

import type { Card, HandAnalysis, ModeConfig } from '../types.js';
import type { Rng } from '../fairness.js';
import { createRng } from '../fairness.js';
import { rankOf } from '../deck.js';
import { analyzeHand } from '../hand.js';
import { enumeratePlays, findBeatingPlays, estimateHandCount, subtractCards } from './decompose.js';
import type { AiView, BidView } from './isolation.js';
import type { AiProvider, BidDecision, Decision, Difficulty } from './provider.js';

/** 手牌强度（用于叫地主），仅基于点数结构 */
export function handStrength(hand: Card[], mode: ModeConfig): number {
  const counts = new Map<number, number>();
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  let s = 0;
  s += (counts.get(15) ?? 0) * 1.5; // 2
  s += (counts.get(16) ?? 0) * 2; // 小王
  s += (counts.get(17) ?? 0) * 2.5; // 大王
  if ((counts.get(16) ?? 0) >= 1 && (counts.get(17) ?? 0) >= 1) s += 4; // 火箭
  for (const [r, c] of counts) if (r <= 15 && c >= 4) s += 5; // 炸弹
  if (mode.players === 4 && (counts.get(16) ?? 0) + (counts.get(17) ?? 0) === 4) s += 8; // 天王炸
  return s;
}

/** 叫地主决策：难度越高越激进（easy 只叫 1，hard 更愿叫 3） */
export function decideBid(view: BidView, difficulty: Difficulty): BidDecision {
  const strength = handStrength(view.myHand, view.mode);
  let desired = 0;
  if (difficulty === 'easy') desired = strength >= 7 ? 1 : 0;
  else if (difficulty === 'normal') desired = strength >= 9 ? 3 : strength >= 6 ? 2 : strength >= 3 ? 1 : 0;
  else desired = strength >= 8 ? 3 : strength >= 5 ? 2 : strength >= 2 ? 1 : 0;

  if (desired === 0 || desired <= view.highestBid) return { action: 'pass' };
  return { action: 'bid', score: desired };
}

export interface DecidePlayOptions {
  rng?: Rng;
  mistakeRate?: number; // easy 随机失误概率，默认 0.15
}

/** 出牌/过牌决策（同步、纯函数；rng 仅影响 easy 的随机失误） */
export function decidePlay(view: AiView, difficulty: Difficulty, options: DecidePlayOptions = {}): Decision {
  const rng = options.rng ?? createRng(0);
  const mistakeRate = options.mistakeRate ?? 0.15;

  if (view.lastPlay === null) {
    const candidates = enumeratePlays(view.myHand, view.mode);
    if (candidates.length === 0) throw new Error('空手无法首出');
    return { action: 'play', cards: pickLead(candidates, view.myHand, view.mode, difficulty) };
  }

  const last = view.lastPlay.analysis;
  const candidates = findBeatingPlays(view.myHand, last, view.mode);
  if (candidates.length === 0) return { action: 'pass', cards: [] };

  if (difficulty === 'easy' && rng.next() < mistakeRate) return { action: 'pass', cards: [] };

  const cards = pickFollow(candidates, last, view.myHand, view.mode, difficulty);
  return cards === null ? { action: 'pass', cards: [] } : { action: 'play', cards };
}

function pickLead(candidates: Card[][], hand: Card[], mode: ModeConfig, difficulty: Difficulty): Card[] {
  if (difficulty === 'easy') return smallest(candidates, mode);
  if (difficulty === 'normal') return bestBy(candidates, mode, leadScore);
  return minHandCount(candidates, hand, mode);
}

function pickFollow(
  candidates: Card[][],
  last: HandAnalysis,
  hand: Card[],
  mode: ModeConfig,
  difficulty: Difficulty,
): Card[] | null {
  if (difficulty === 'easy') return smallest(candidates, mode);

  const lastBombLike = last.type === 'bomb' || last.type === 'rocket' || last.type === 'super-rocket';

  if (difficulty === 'normal') {
    if (lastBombLike) return smallest(candidates, mode); // 被迫时用最小炸弹压
    const nonBomb = candidates.filter((cs) => !isBombLike(cs, mode));
    return nonBomb.length > 0 ? cheapest(nonBomb, mode) : null; // 非炸弹用最省的一手；否则保留炸弹
  }

  // hard：前瞻选剩余手数最少的一手；非被迫用炸弹仅在可快速收尾时
  const best = minHandCount(candidates, hand, mode);
  if (lastBombLike) return best;
  if (!isBombLike(best, mode)) return best;
  return estimateHandCount(subtractCards(hand, best), mode) <= 2 ? best : null;
}

function isBombLike(cs: Card[], mode: ModeConfig): boolean {
  const t = analyzeHand(cs, mode).type;
  return t === 'bomb' || t === 'rocket' || t === 'super-rocket';
}

function keyRank(cs: Card[], mode: ModeConfig): number {
  return analyzeHand(cs, mode).rank;
}

/** 最小牌（张数少、点数小） */
function smallest(cands: Card[][], mode: ModeConfig): Card[] {
  return [...cands].sort((x, y) => {
    const ax = analyzeHand(x, mode);
    const ay = analyzeHand(y, mode);
    if (x.length !== y.length) return x.length - y.length;
    return ax.rank - ay.rank;
  })[0];
}

/** 最省（点数最低）的一手 */
function cheapest(cands: Card[][], mode: ModeConfig): Card[] {
  return [...cands].sort((x, y) => keyRank(x, mode) - keyRank(y, mode))[0];
}

/** 分数最高的一手 */
function bestBy(cands: Card[][], mode: ModeConfig, score: (cs: Card[], m: ModeConfig) => number): Card[] {
  return [...cands].sort((x, y) => score(y, mode) - score(x, mode))[0];
}

/** 剩余手数最少的一手（点数低者优先） */
function minHandCount(cands: Card[][], hand: Card[], mode: ModeConfig): Card[] {
  let best = cands[0];
  let bestScore = Infinity;
  for (const cs of cands) {
    const cnt = estimateHandCount(subtractCards(hand, cs), mode);
    const score = cnt * 10000 + keyRank(cs, mode);
    if (score < bestScore) {
      bestScore = score;
      best = cs;
    }
  }
  return best;
}

/** 首出倾向：多张优先、低点优先、不拆炸弹/火箭 */
function leadScore(cs: Card[], mode: ModeConfig): number {
  const a = analyzeHand(cs, mode);
  if (a.type === 'bomb' || a.type === 'rocket' || a.type === 'super-rocket') return -10000;
  return cs.length * 10 - a.rank;
}

/** 满足 AiProvider 接口的本地规则实现（异步封装，供统一调用/未来替换 LLM） */
export class RuleAiProvider implements AiProvider {
  readonly kind = 'rule' as const;
  constructor(
    readonly difficulty: Difficulty,
    private readonly options?: DecidePlayOptions,
  ) {}

  async decide(view: AiView): Promise<Decision> {
    return decidePlay(view, this.difficulty, this.options);
  }

  async decideBid(view: BidView): Promise<BidDecision> {
    return decideBid(view, this.difficulty);
  }
}
