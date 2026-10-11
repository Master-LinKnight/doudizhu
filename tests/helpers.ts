// helpers.ts — 测试用构造牌的工具
import { encodeCard } from '../src/game/deck.js';

export function c(rank: number, suit = 0, copy = 0): number {
  return encodeCard(rank, suit, copy);
}

/** 构造 n 张同点数的牌（自动分配不同花色/副） */
export function nOf(rank: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(encodeCard(rank, i % 4, Math.floor(i / 4)));
  return out;
}

/** 构造一串单牌（用于顺子等），每个点数一张 */
export function seq(ranks: number[], suit = 0): number[] {
  return ranks.map((r) => encodeCard(r, suit));
}

export function SJ(copy = 0): number {
  return encodeCard(16, 0, copy);
}

export function BJ(copy = 0): number {
  return encodeCard(17, 0, copy);
}

export const A = 14;
export const TWO = 15;
