// hand.ts — 手牌分析与牌型识别（纯函数，无 UI / 无随机依赖）
//
// 识别规则严格遵循规格书第 4 节与第 9/10 节「已确认决策」。
// 关键点：
//   - 顺子/连对/飞机的点数范围为 3~A（不含 2 与王）。
//   - 带牌（三带一/三带二/飞机带牌/四带二）不得与主体同点数；因分组天然互斥，自动满足。
//   - 四人模式：5~8 张同点数不作为单一牌型，需经 splitSameRank 拆为「炸弹 + 带牌」。

import type { Card, HandAnalysis, ModeConfig } from './types.js';
import { rankOf } from './deck.js';

export const SEQUENCE_MIN = 3;
export const SEQUENCE_MAX = 14; // A（不含 2）

// 用于比较的“关键点数”哨兵：火箭压过所有普通炸弹，天王炸压过火箭
export const ROCKET_RANK = 18;
export const SUPER_ROCKET_RANK = 19;

interface RankGroup {
  rank: number;
  count: number;
}

function groupByRank(cards: Card[]): RankGroup[] {
  const m = new Map<number, number>();
  for (const card of cards) {
    const r = rankOf(card);
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.rank - a.rank);
}

function isConsecutive(ranks: number[]): boolean {
  const sorted = [...ranks].sort((a, b) => a - b);
  if (sorted[0] < SEQUENCE_MIN || sorted[sorted.length - 1] > SEQUENCE_MAX) return false;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] !== 1) return false;
  }
  return true;
}

/** 返回 points 中最长的一段连续点数（限定在序列范围内，升序） */
function longestConsecutive(ranks: number[]): number[] {
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  let best: number[] = [];
  let cur: number[] = [];
  for (const r of sorted) {
    if (r < SEQUENCE_MIN || r > SEQUENCE_MAX) {
      cur = [];
      continue;
    }
    if (cur.length > 0 && r - cur[cur.length - 1] !== 1) cur = [];
    cur.push(r);
    if (cur.length > best.length) best = cur.slice();
  }
  return best;
}

function invalid(): HandAnalysis {
  return { valid: false, type: null, rank: 0, length: 0, kicker: null };
}

function valid(
  type: NonNullable<HandAnalysis['type']>,
  rank: number,
  length: number,
  kicker: HandAnalysis['kicker'] = null,
): HandAnalysis {
  return { valid: true, type, rank, length, kicker };
}

export function analyzeHand(cards: Card[], mode: ModeConfig): HandAnalysis {
  const n = cards.length;
  if (n === 0) return invalid();

  const groups = groupByRank(cards);
  const distinct = groups.length;

  let sj = 0;
  let bj = 0;
  for (const g of groups) {
    if (g.rank === 16) sj = g.count;
    else if (g.rank === 17) bj = g.count;
  }

  // 天王炸（仅四人）：2 小王 + 2 大王
  if (mode.players === 4 && n === 4 && sj === 2 && bj === 2) {
    return valid('super-rocket', SUPER_ROCKET_RANK, 1);
  }
  // 火箭（王炸）：1 小王 + 1 大王
  if (n === 2 && sj === 1 && bj === 1) {
    return valid('rocket', ROCKET_RANK, 1);
  }

  // 单张
  if (n === 1) return valid('single', groups[0].rank, 1);
  // 对子
  if (n === 2 && distinct === 1) return valid('pair', groups[0].rank, 1);
  // 三张
  if (n === 3 && distinct === 1) return valid('triple', groups[0].rank, 1);
  // 炸弹
  if (n === 4 && distinct === 1) return valid('bomb', groups[0].rank, 1);

  // 四人：5~8 张同点数 → 需拆分为「炸弹 + 带牌」，不作为单一牌型
  if (mode.players === 4 && distinct === 1 && n >= 5) return invalid();

  // 三带一
  if (n === 4 && distinct === 2) {
    const triple = groups.find((g) => g.count === 3);
    const single = groups.find((g) => g.count === 1);
    if (triple && single) return valid('triple-single', triple.rank, 1, 'singles');
  }

  // 三带二
  if (n === 5 && distinct === 2) {
    const triple = groups.find((g) => g.count === 3);
    const pair = groups.find((g) => g.count === 2);
    if (triple && pair) return valid('triple-pair', triple.rank, 1, 'pairs');
  }

  // 四带二：4+2 单（6 张，两张单 或 一对）或 4+2 对（8 张）
  const four = groups.find((g) => g.count === 4);
  if (four) {
    const rest = groups.filter((g) => g !== four);
    if (n === 6) {
      if (rest.every((g) => g.count === 1)) return valid('four-two', four.rank, 1, 'singles');
      if (rest.length === 1 && rest[0].count === 2) return valid('four-two', four.rank, 1, 'pairs');
    }
    if (n === 8 && rest.length === 2 && rest.every((g) => g.count === 2)) {
      return valid('four-two', four.rank, 1, 'pairs');
    }
  }

  // 顺子：5 张及以上连续单张（3~A）
  if (n >= 5 && distinct === n && isConsecutive(groups.map((g) => g.rank))) {
    return valid('straight', groups[0].rank, n);
  }

  // 连对：3 对及以上连续对子（3~A）
  if (
    n >= 6 &&
    n % 2 === 0 &&
    distinct === n / 2 &&
    groups.every((g) => g.count === 2) &&
    isConsecutive(groups.map((g) => g.rank))
  ) {
    return valid('straight-pairs', groups[0].rank, distinct);
  }

  // 飞机（不带）：2 组及以上连续三张（3~A）
  if (
    n >= 6 &&
    n % 3 === 0 &&
    distinct === n / 3 &&
    groups.every((g) => g.count === 3) &&
    isConsecutive(groups.map((g) => g.rank))
  ) {
    return valid('airplane', groups[0].rank, distinct);
  }

  // 飞机带单 / 带对：k 组连续三张 + k 张单牌 或 k 个对子
  const tripleRanks = groups.filter((g) => g.count === 3).map((g) => g.rank);
  if (tripleRanks.length >= 2) {
    const chain = longestConsecutive(tripleRanks);
    if (chain.length >= 2 && chain.length === tripleRanks.length) {
      const k = chain.length;
      const mainRank = chain[chain.length - 1];
      const others = groups.filter((g) => g.count !== 3);
      if (others.length === k && others.every((g) => g.count === 1)) {
        return valid('airplane-singles', mainRank, k, 'singles');
      }
      if (others.length === k && others.every((g) => g.count === 2)) {
        return valid('airplane-pairs', mainRank, k, 'pairs');
      }
    }
  }

  return invalid();
}

export interface SameRankSplit {
  valid: true;
  bomb: Card[]; // 4 张（炸弹）
  kickers: Card[]; // 剩余 1~4 张（带牌）
}

/** 四人模式下 5~8 张同点数的强制拆分（规格书第 10 节「6 张拆为 4+2」） */
export function splitSameRank(cards: Card[], mode: ModeConfig): SameRankSplit | { valid: false } {
  if (mode.players !== 4) return { valid: false };
  if (cards.length < 5 || cards.length > 8) return { valid: false };
  if (groupByRank(cards).length !== 1) return { valid: false };
  const sorted = [...cards].sort((a, b) => b - a);
  return { valid: true, bomb: sorted.slice(0, 4), kickers: sorted.slice(4) };
}
