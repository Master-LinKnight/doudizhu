import { describe, it, expect } from 'vitest';
import { createGame, bid, play, pass, type GameState } from '../src/game/engine.js';
import { THREE_PLAYER } from '../src/game/types.js';
import {
  turnSeconds,
  timeoutAction,
  TURN_SECONDS,
  LANDLORD_FIRST_SECONDS,
} from '../src/game/timeout.js';

/** 叫 3 分直接进入出牌阶段（当前玩家即地主） */
function toPlaying(seed = 1): GameState {
  let g = createGame(THREE_PLAYER, seed);
  g = bid(g, { player: g.currentPlayer, type: 'bid', score: 3 });
  return g;
}

describe('timeout — 回合限时', () => {
  it('叫分阶段限时 30 秒', () => {
    const g = createGame(THREE_PLAYER, 1);
    expect(g.phase).toBe('bidding');
    expect(turnSeconds(g)).toBe(TURN_SECONDS);
  });

  it('叫分超时：自动算作不叫', () => {
    const g = createGame(THREE_PLAYER, 1);
    expect(timeoutAction(g)).toEqual({ type: 'bid-pass' });
  });

  it('叫分超时应用后轮到下一家', () => {
    const g = createGame(THREE_PLAYER, 1);
    const action = timeoutAction(g);
    expect(action.type).toBe('bid-pass');
    const g2 = bid(g, { player: g.currentPlayer, type: 'pass' });
    expect(g2.currentPlayer).not.toBe(g.currentPlayer);
  });

  it('地主首次出牌限时 45 秒', () => {
    const g = toPlaying();
    expect(g.phase).toBe('playing');
    expect(g.currentPlayer).toBe(g.landlord);
    expect(g.players[g.landlord].playedCount).toBe(0);
    expect(turnSeconds(g)).toBe(LANDLORD_FIRST_SECONDS);
  });

  it('非地主首次出牌的常规回合限时 30 秒', () => {
    const g = toPlaying();
    const landlord = g.landlord;
    const smallest = g.players[landlord].hand[g.players[landlord].hand.length - 1];
    const g2 = play(g, { player: landlord, cards: [smallest] });
    expect(g2.currentPlayer).not.toBe(landlord);
    expect(turnSeconds(g2)).toBe(TURN_SECONDS);
  });

  it('地主重新获得首出权后仍为常规 30 秒（仅「首次」特殊）', () => {
    const g = toPlaying();
    const landlord = g.landlord;
    const smallest = g.players[landlord].hand[g.players[landlord].hand.length - 1];
    let s = play(g, { player: landlord, cards: [smallest] });
    for (let i = 0; i < g.mode.players - 1; i++) s = pass(s, { player: s.currentPlayer });
    expect(s.currentPlayer).toBe(landlord);
    expect(s.lastPlay).toBeNull();
    expect(s.players[landlord].playedCount).toBe(1);
    expect(turnSeconds(s)).toBe(TURN_SECONDS);
  });

  it('首出超时：自动出最小单张', () => {
    const g = toPlaying();
    const hand = g.players[g.landlord].hand;
    const action = timeoutAction(g);
    expect(action).toEqual({ type: 'play', cards: [hand[hand.length - 1]] });
  });

  it('跟牌超时：自动过牌', () => {
    const g = toPlaying();
    const landlord = g.landlord;
    const smallest = g.players[landlord].hand[g.players[landlord].hand.length - 1];
    const g2 = play(g, { player: landlord, cards: [smallest] });
    expect(timeoutAction(g2)).toEqual({ type: 'pass' });
  });
});
