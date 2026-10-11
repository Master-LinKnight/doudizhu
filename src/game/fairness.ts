// fairness.ts — 可设种子的随机接口与种子工具（公平性的基石）
//
// 核心原则：src/game/ 中所有随机操作都必须经过此处的 Rng，禁止直接使用 Math.random()。
// 种子会写入对局记录，使发牌与先叫玩家可复现、可审计。

export interface Rng {
  /** 返回 [0, 1) 的浮点数 */
  next(): number;
  /** 返回 [0, n) 的整数 */
  nextInt(n: number): number;
  /** 返回 [min, max] 闭区间的整数 */
  nextIntRange(min: number, max: number): number;
  /** 返回当前内部状态，可据此重建一个续接的 Rng（用于存档/回放） */
  getState(): number;
}

/** 将任意字符串种子散列为 32 位整数（FNV-1a） */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 —— 小巧、确定性的 32 位 PRNG。
 * 给定同一种子，序列完全一致；`getState()` 保存的 `a` 可直接作为种子续接。
 */
export function createRng(seed: number | string): Rng {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;

  function step(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next: step,
    nextInt(n: number): number {
      if (n <= 0) throw new RangeError(`nextInt 期望 n > 0，收到 ${n}`);
      return Math.floor(step() * n);
    },
    nextIntRange(min: number, max: number): number {
      if (max < min) throw new RangeError('nextIntRange 期望 max >= min');
      return min + Math.floor(step() * (max - min + 1));
    },
    getState(): number {
      return a >>> 0;
    },
  };
}

// 仅在无 crypto 环境下降级的计数器（避免使用 Math.random）
let fallbackCounter = 0;

/**
 * 生成一个“新对局”的随机种子（用于 UI 开新局）。
 * 优先使用加密安全随机源；核心逻辑本身仍只依赖显式传入的种子。
 */
export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] ?? 0) >>> 0;
  }
  fallbackCounter = (fallbackCounter + 1) >>> 0;
  return (Date.now() ^ Math.imul(fallbackCounter, 2654435761)) >>> 0;
}
