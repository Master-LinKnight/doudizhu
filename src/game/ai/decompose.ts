// decompose.ts — 手牌拆解 / 候选牌型枚举（纯函数）
//
// 为 AI 决策提供三类能力：
//   enumeratePlays   —— 枚举手牌中所有候选出牌（去重），用于「首出」与「估值」
//   findBeatingPlays —— 枚举能压过 lastPlay 的所有候选出牌，用于「跟牌」
//   estimateHandCount/decompose —— 贪心估算最少出完手数，用于「手牌估值」与前瞻

import type { Card, HandAnalysis, ModeConfig } from '../types.js';
import { rankOf } from '../deck.js';
import { analyzeHand, SEQUENCE_MIN, SEQUENCE_MAX } from '../hand.js';
import { beats } from '../rules.js';

function countRanks(cards: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) m.set(rankOf(c), (m.get(rankOf(c)) ?? 0) + 1);
  return m;
}

/** 取该点数中最低的 n 张（花色/副次低者优先，保证确定性） */
function takeOfRank(cards: Card[], rank: number, n: number): Card[] {
  return cards
    .filter((c) => rankOf(c) === rank)
    .sort((a, b) => a - b)
    .slice(0, n);
}

/** 多重集减法：从 hand 中移除 cards，返回剩余牌 */
export function subtractCards(hand: Card[], cards: Card[]): Card[] {
  const rm = new Map<number, number>();
  for (const c of cards) rm.set(c, (rm.get(c) ?? 0) + 1);
  return hand.filter((c) => {
    const k = rm.get(c) ?? 0;
    if (k > 0) {
      rm.set(c, k - 1);
      return false;
    }
    return true;
  });
}

function sig(cards: Card[]): string {
  return [...cards].sort((a, b) => a - b).join(',');
}

/** 给定已升序、去重的点数列表，切成若干极大连续段 */
function consecutiveRuns(sortedRanks: number[]): number[][] {
  const runs: number[][] = [];
  for (const r of sortedRanks) {
    const last = runs[runs.length - 1];
    if (last && r - last[last.length - 1] === 1) last.push(r);
    else runs.push([r]);
  }
  return runs;
}

/**
 * 从 rest 中挑 k 组、每组 size 张的「带牌」：
 * 取最低的 k 个不同点数（排除 exclude 中的点数），每个点数取 size 张。
 * 数量不足返回 []。
 */
function lowestKickers(rest: Card[], exclude: number[], k: number, size: number): Card[] {
  const counts = countRanks(rest);
  const ex = new Set(exclude);
  const ranks = [...counts.keys()]
    .filter((r) => !ex.has(r) && (counts.get(r) ?? 0) >= size)
    .sort((a, b) => a - b);
  const picked: Card[] = [];
  let need = k;
  for (const r of ranks) {
    if (need <= 0) break;
    picked.push(...takeOfRank(rest, r, size));
    need--;
  }
  return need === 0 ? picked : [];
}

/** 枚举手牌中所有互不重复的合法出牌（含炸弹/火箭/天王炸及各类带牌形态） */
export function enumeratePlays(hand: Card[], mode: ModeConfig): Card[][] {
  const out: Card[][] = [];
  const seen = new Set<string>();
  const add = (cs: Card[]) => {
    if (cs.length === 0) return;
    const s = sig(cs);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(cs);
    }
  };

  const counts = countRanks(hand);
  const ranksDesc = [...counts.keys()].sort((a, b) => b - a);
  const seqRanks = [...counts.keys()]
    .filter((r) => r >= SEQUENCE_MIN && r <= SEQUENCE_MAX)
    .sort((a, b) => a - b);

  // 单张 / 对子 / 三张 / 炸弹
  for (const r of ranksDesc) {
    add(takeOfRank(hand, r, 1));
    if ((counts.get(r) ?? 0) >= 2) add(takeOfRank(hand, r, 2));
    if ((counts.get(r) ?? 0) >= 3) add(takeOfRank(hand, r, 3));
    if ((counts.get(r) ?? 0) >= 4) add(takeOfRank(hand, r, 4));
  }

  // 火箭 / 天王炸
  const sj = counts.get(16) ?? 0;
  const bj = counts.get(17) ?? 0;
  if (sj >= 1 && bj >= 1) add([...takeOfRank(hand, 16, 1), ...takeOfRank(hand, 17, 1)]);
  if (mode.players === 4 && sj >= 2 && bj >= 2) add([...takeOfRank(hand, 16, 2), ...takeOfRank(hand, 17, 2)]);

  // 顺子（5~12 张，3~A）
  for (const run of consecutiveRuns(seqRanks)) {
    for (let len = 5; len <= run.length; len++) {
      for (let start = 0; start + len <= run.length; start++) {
        const slice = run.slice(start, start + len);
        add(slice.flatMap((r) => takeOfRank(hand, r, 1)));
      }
    }
  }

  // 连对（≥3 连对）
  const pairRanks = seqRanks.filter((r) => (counts.get(r) ?? 0) >= 2);
  for (const run of consecutiveRuns(pairRanks)) {
    for (let len = 3; len <= run.length; len++) {
      for (let start = 0; start + len <= run.length; start++) {
        const slice = run.slice(start, start + len);
        add(slice.flatMap((r) => takeOfRank(hand, r, 2)));
      }
    }
  }

  // 飞机（≥2 组连续三张）：不带 / 带单 / 带对
  const tripleRanks = seqRanks.filter((r) => (counts.get(r) ?? 0) >= 3);
  for (const run of consecutiveRuns(tripleRanks)) {
    for (let len = 2; len <= run.length; len++) {
      for (let start = 0; start + len <= run.length; start++) {
        const slice = run.slice(start, start + len);
        const body = slice.flatMap((r) => takeOfRank(hand, r, 3));
        add(body);
        const rest = subtractCards(hand, body);
        const singles = lowestKickers(rest, slice, len, 1);
        if (singles.length === len) add([...body, ...singles]);
        const pairs = lowestKickers(rest, slice, len, 2);
        if (pairs.length === len * 2) add([...body, ...pairs]);
      }
    }
  }

  // 三带一 / 三带二（三张主体可为任意点数，含 2）
  for (const r of ranksDesc) {
    if ((counts.get(r) ?? 0) >= 3 && r <= 15) {
      const body = takeOfRank(hand, r, 3);
      const rest = subtractCards(hand, body);
      const single = lowestKickers(rest, [r], 1, 1);
      if (single.length === 1) add([...body, ...single]);
      const pair = lowestKickers(rest, [r], 1, 2);
      if (pair.length === 2) add([...body, ...pair]);
    }
  }

  // 四带二：4+2 单 / 4+一对 / 4+两对
  for (const r of ranksDesc) {
    if ((counts.get(r) ?? 0) >= 4 && r <= 15) {
      const body = takeOfRank(hand, r, 4);
      const rest = subtractCards(hand, body);
      const twoSingles = lowestKickers(rest, [r], 2, 1);
      if (twoSingles.length === 2) add([...body, ...twoSingles]);
      const onePair = lowestKickers(rest, [r], 1, 2);
      if (onePair.length === 2) add([...body, ...onePair]);
      const twoPairs = lowestKickers(rest, [r], 2, 2);
      if (twoPairs.length === 4) add([...body, ...twoPairs]);
    }
  }

  return out;
}

/** 枚举手牌中所有能压过 lastPlay 的候选出牌（含炸弹/火箭升级） */
export function findBeatingPlays(hand: Card[], lastPlay: HandAnalysis, mode: ModeConfig): Card[][] {
  return enumeratePlays(hand, mode).filter((cs) => beats(analyzeHand(cs, mode), lastPlay));
}

/** 从手牌中贪心抽取一手「最合适」的牌（每次一张/一组，保证合法） */
function extractComponent(hand: Card[], mode: ModeConfig): Card[] {
  const counts = countRanks(hand);
  const ranksDesc = [...counts.keys()].sort((a, b) => b - a);
  const seqRanksAsc = [...counts.keys()]
    .filter((r) => r >= SEQUENCE_MIN && r <= SEQUENCE_MAX)
    .sort((a, b) => a - b);

  const sj = counts.get(16) ?? 0;
  const bj = counts.get(17) ?? 0;
  if (mode.players === 4 && sj >= 2 && bj >= 2) return [...takeOfRank(hand, 16, 2), ...takeOfRank(hand, 17, 2)];
  if (sj >= 1 && bj >= 1) return [...takeOfRank(hand, 16, 1), ...takeOfRank(hand, 17, 1)];

  for (const r of ranksDesc) if ((counts.get(r) ?? 0) >= 4) return takeOfRank(hand, r, 4);

  const straight = longestRunPlay(hand, seqRanksAsc, 1, 5);
  if (straight) return straight;

  const straightPairs = longestRunPlay(hand, seqRanksAsc.filter((r) => (counts.get(r) ?? 0) >= 2), 2, 3);
  if (straightPairs) return straightPairs;

  const airplane = longestRunPlay(hand, seqRanksAsc.filter((r) => (counts.get(r) ?? 0) >= 3), 3, 2);
  if (airplane) return airplane;

  for (const r of ranksDesc) {
    if ((counts.get(r) ?? 0) >= 3 && r <= 15) {
      const body = takeOfRank(hand, r, 3);
      const rest = subtractCards(hand, body);
      const single = lowestKickers(rest, [r], 1, 1);
      if (single.length === 1) return [...body, ...single];
      const pair = lowestKickers(rest, [r], 1, 2);
      if (pair.length === 2) return [...body, ...pair];
      return body;
    }
  }

  for (const r of ranksDesc) if ((counts.get(r) ?? 0) >= 2) return takeOfRank(hand, r, 2);

  return takeOfRank(hand, ranksDesc[ranksDesc.length - 1], 1);
}

/** 在升序点数里找最长连续段（≥minLen），每点取 size 张 */
function longestRunPlay(hand: Card[], sortedRanksAsc: number[], size: number, minLen: number): Card[] | null {
  let best: number[] | null = null;
  let cur: number[] = [];
  for (const r of sortedRanksAsc) {
    if (cur.length && r - cur[cur.length - 1] !== 1) cur = [];
    cur.push(r);
    if (cur.length >= minLen && (!best || cur.length > best.length)) best = cur.slice();
  }
  if (!best) return null;
  return best.flatMap((r) => takeOfRank(hand, r, size));
}

/** 贪心拆解：将一手牌划分为若干合法手牌 */
export function decompose(hand: Card[], mode: ModeConfig): Card[][] {
  let remaining = [...hand];
  const plays: Card[][] = [];
  while (remaining.length > 0) {
    const before = remaining.length;
    const play = extractComponent(remaining, mode);
    plays.push(play);
    remaining = subtractCards(remaining, play);
    if (remaining.length >= before) break; // 防御性退出
  }
  return plays;
}

/** 估算最少出完手数（贪心上界），用于估值 */
export function estimateHandCount(hand: Card[], mode: ModeConfig): number {
  return decompose(hand, mode).length;
}
