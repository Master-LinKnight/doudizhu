import { describe, it, expect } from 'vitest';
import { createRng, hashSeed, randomSeed } from '../src/game/fairness.js';

describe('fairness — 可设种子随机', () => {
  it('同一种子产生相同序列', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('不同种子产生不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('字符串种子散列一致', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
    expect(createRng('seed').next()).toBe(createRng('seed').next());
  });

  it('nextInt 范围正确', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('getState 保存后可续接相同序列', () => {
    const a = createRng(99);
    for (let i = 0; i < 10; i++) a.next();
    const saved = a.getState();
    const restored = createRng(saved);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(restored.next());
  });

  it('randomSeed 返回非负整数', () => {
    expect(Number.isInteger(randomSeed())).toBe(true);
    expect(randomSeed()).toBeGreaterThanOrEqual(0);
  });
});
