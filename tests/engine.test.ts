import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { createGame, bid, play, pass, detectSpring, type GameState } from '../src/game/engine.js';
import { rankOf } from '../src/game/deck.js';

describe('detectSpring 春天 / 反春天', () => {
  it('地主胜且农民均未出牌 → 春天', () => {
    expect(detectSpring(true, 3, [0, 0])).toEqual({ spring: true, antiSpring: false });
  });
  it('农民胜且地主只出一手 → 反春天', () => {
    expect(detectSpring(false, 1, [2, 3])).toEqual({ spring: false, antiSpring: true });
  });
  it('其余情况无春天', () => {
    expect(detectSpring(true, 3, [1, 0])).toEqual({ spring: false, antiSpring: false });
    expect(detectSpring(false, 2, [1, 2])).toEqual({ spring: false, antiSpring: false });
  });
});

describe('engine — 状态机', () => {
  it('发牌：三人每人 17 张 + 3 底牌', () => {
    const g = createGame(THREE_PLAYER, 1);
    expect(g.players).toHaveLength(3);
    g.players.forEach((p) => expect(p.hand).toHaveLength(17));
    expect(g.bottom).toHaveLength(3);
    expect(g.phase).toBe('bidding');
    expect(g.currentPlayer).toBeGreaterThanOrEqual(0);
    expect(g.currentPlayer).toBeLessThan(3);
  });

  it('发牌：四人每人 25 张 + 8 底牌', () => {
    const g = createGame(FOUR_PLAYER, 1);
    expect(g.players).toHaveLength(4);
    g.players.forEach((p) => expect(p.hand).toHaveLength(25));
    expect(g.bottom).toHaveLength(8);
  });

  it('同一种子产生完全相同的初始状态（可复现）', () => {
    expect(createGame(THREE_PLAYER, 42)).toEqual(createGame(THREE_PLAYER, 42));
    expect(createGame(FOUR_PLAYER, 42)).toEqual(createGame(FOUR_PLAYER, 42));
  });

  it('叫 3 分立即确定地主并拿到底牌', () => {
    let g = createGame(THREE_PLAYER, 1);
    const first = g.currentPlayer;
    g = bid(g, { player: first, type: 'bid', score: 3 });
    expect(g.phase).toBe('playing');
    expect(g.landlord).toBe(first);
    expect(g.players[first].hand).toHaveLength(20);
    expect(g.currentPlayer).toBe(first);
  });

  it('后叫者必须严格大于此前最高分', () => {
    let g = createGame(THREE_PLAYER, 1);
    const p0 = g.currentPlayer;
    g = bid(g, { player: p0, type: 'bid', score: 1 });
    const p1 = g.currentPlayer;
    expect(() => bid(g, { player: p1, type: 'bid', score: 1 })).toThrow();
    g = bid(g, { player: p1, type: 'bid', score: 2 });
    expect(g.highestBid).toBe(2);
    expect(g.highestBidder).toBe(p1);
  });

  it('全不叫 → 重新发牌', () => {
    let g = createGame(THREE_PLAYER, 1);
    for (let i = 0; i < 3; i++) g = bid(g, { player: g.currentPlayer, type: 'pass' });
    expect(g.phase).toBe('bidding');
    expect(g.bids).toHaveLength(0);
    expect(g.players[0].hand).toHaveLength(17);
  });

  it('首出时不能过牌', () => {
    let g = createGame(THREE_PLAYER, 1);
    g = bid(g, { player: g.currentPlayer, type: 'bid', score: 3 });
    expect(() => pass(g, { player: g.currentPlayer })).toThrow();
  });

  it('连续两家过牌后，出牌者重获首出权', () => {
    // 手工构造：地主出单，其余两家过，地主重新首出
    const g = handcraftedPlayingState();
    let s = play(g, { player: 0, cards: [g.players[0].hand[0]] });
    s = pass(s, { player: 1 });
    s = pass(s, { player: 2 });
    expect(s.lastPlay).toBeNull();
    expect(s.currentPlayer).toBe(0);
  });

  it('出牌不在手牌中 → 抛错', () => {
    const g = handcraftedPlayingState();
    // 用一张不属于 0 号玩家的牌（属于 1 号玩家）
    const foreign = g.players[1].hand[0];
    expect(() => play(g, { player: 0, cards: [foreign] })).toThrow();
  });
});

describe('engine — 自动打牌冒烟测试（三人/四人完整对局）', () => {
  it('三人：自动打完一局，结算零和', () => {
    const g = autoPlay(createGame(THREE_PLAYER, 7));
    expect(g.phase).toBe('settled');
    expect(g.multiplier).toBeGreaterThanOrEqual(1);
    expect(g.scores.reduce((x, y) => x + y, 0)).toBe(0);
    expect(g.winner).toBeGreaterThanOrEqual(0);
  });

  it('四人：自动打完一局，结算零和', () => {
    const g = autoPlay(createGame(FOUR_PLAYER, 11));
    expect(g.phase).toBe('settled');
    expect(g.scores.reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('同种子 + 同策略 → 相同终局（回放确定性）', () => {
    const a = autoPlay(createGame(THREE_PLAYER, 99));
    const b = autoPlay(createGame(THREE_PLAYER, 99));
    expect(a).toEqual(b);
  });
});

/** 手工构造一个简单出牌局面：3 人，地主 0，各若干张单牌 */
function handcraftedPlayingState(): GameState {
  const mode = THREE_PLAYER;
  return {
    mode,
    seed: 1,
    rngState: 1,
    phase: 'playing',
    players: [
      { hand: [10, 12, 14], playedCount: 0 }, // 地主
      { hand: [11, 13], playedCount: 0 },
      { hand: [15, 16], playedCount: 0 },
    ],
    bottom: [],
    landlord: 0,
    bids: [{ player: 0, type: 'bid', score: 3 }],
    highestBid: 3,
    highestBidder: 0,
    currentPlayer: 0,
    lastPlay: null,
    leadingPlayer: -1,
    consecutivePasses: 0,
    bombsPlayed: 0,
    rocketsPlayed: 0,
    winner: -1,
    landlordWon: false,
    spring: false,
    antiSpring: false,
    multiplier: 1,
    scores: [0, 0, 0],
    log: [],
  };
}

/** 朴素策略：首出最小单张；否则能压单就压最小的能压单，压不了就过 */
function autoPlay(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase !== 'settled' && guard < 20000) {
    guard++;
    const p = s.currentPlayer;
    if (s.phase === 'bidding') {
      s = bid(s, { player: p, type: 'bid', score: 3 });
      continue;
    }
    if (s.lastPlay === null) {
      const lowest = [...s.players[p].hand].sort((a, b) => rankOf(a) - rankOf(b))[0];
      s = play(s, { player: p, cards: [lowest] });
    } else if (s.lastPlay.analysis.type === 'single') {
      const target = s.lastPlay.analysis.rank;
      const beatCard = s.players[p].hand.find((card) => rankOf(card) > target);
      if (beatCard !== undefined) s = play(s, { player: p, cards: [beatCard] });
      else s = pass(s, { player: p });
    } else {
      s = pass(s, { player: p });
    }
  }
  return s;
}
