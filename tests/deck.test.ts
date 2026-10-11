import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { createDeck, deal, rankOf, suitOf, cardToString, shuffle } from '../src/game/deck.js';
import { createRng } from '../src/game/fairness.js';

describe('deck — 牌与洗牌', () => {
  it('三人模式 54 张，每个点数 4 张、王各 1', () => {
    const deck = createDeck(THREE_PLAYER);
    expect(deck).toHaveLength(54);
    expect(new Set(deck).size).toBe(54);
    const counts = new Map<number, number>();
    for (const card of deck) counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1);
    for (let r = 3; r <= 15; r++) expect(counts.get(r)).toBe(4);
    expect(counts.get(16)).toBe(1);
    expect(counts.get(17)).toBe(1);
  });

  it('四人模式 108 张，每个点数 8 张、王各 2', () => {
    const deck = createDeck(FOUR_PLAYER);
    expect(deck).toHaveLength(108);
    expect(new Set(deck).size).toBe(108);
    const counts = new Map<number, number>();
    for (const card of deck) counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1);
    for (let r = 3; r <= 15; r++) expect(counts.get(r)).toBe(8);
    expect(counts.get(16)).toBe(2);
    expect(counts.get(17)).toBe(2);
  });

  it('点数/花色编码可逆且点数在 3~17', () => {
    for (const card of createDeck(THREE_PLAYER)) {
      expect(rankOf(card)).toBeGreaterThanOrEqual(3);
      expect(rankOf(card)).toBeLessThanOrEqual(17);
      expect(suitOf(card)).toBeGreaterThanOrEqual(0);
      expect(suitOf(card)).toBeLessThanOrEqual(3);
    }
    expect(cardToString(0)).toContain('3');
    expect(cardToString(52)).toBe('小王');
    expect(cardToString(53)).toBe('大王');
  });

  it('洗牌可复现（同种子同序）', () => {
    const deck = createDeck(THREE_PLAYER);
    expect(shuffle(deck, createRng(123))).toEqual(shuffle(deck, createRng(123)));
  });

  it('发牌：三人每人 17 张 + 3 底牌，无重复', () => {
    const { hands, bottom } = deal(THREE_PLAYER, createRng(1));
    expect(hands).toHaveLength(3);
    hands.forEach((h) => expect(h).toHaveLength(17));
    expect(bottom).toHaveLength(3);
    expect(new Set([...hands.flat(), ...bottom]).size).toBe(54);
  });

  it('发牌：四人每人 25 张 + 8 底牌，无重复', () => {
    const { hands, bottom } = deal(FOUR_PLAYER, createRng(2));
    expect(hands).toHaveLength(4);
    hands.forEach((h) => expect(h).toHaveLength(25));
    expect(bottom).toHaveLength(8);
    expect(new Set([...hands.flat(), ...bottom]).size).toBe(108);
  });
});
