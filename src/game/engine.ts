// engine.ts — 游戏状态机（纯函数式 reducer，无 UI / 无副作用）
//
// 流程：发牌 → 叫地主 → 确定地主与底牌 → 出牌循环 → 结算。
// 所有随机均由 createGame 传入的 seed 决定；状态不可变，非法动作抛错（便于尽早暴露 bug）。
// 决策日志记录在 state.log 中，配合 seed 可复现整局（回放审计，见阶段 5）。

import type { Card, CardType, ModeConfig } from './types.js';
import { createRng } from './fairness.js';
import { deal, sortCards } from './deck.js';
import { isValidPlay } from './rules.js';
import { settle } from './scoring.js';
import type { HandAnalysis } from './types.js';

export type GamePhase = 'bidding' | 'playing' | 'settled';

export interface Bid {
  player: number;
  type: 'pass' | 'bid';
  score?: number; // 1 | 2 | 3
}

export interface Play {
  player: number;
  cards: Card[];
  analysis: HandAnalysis;
}

export interface PlayerState {
  hand: Card[];
  playedCount: number; // 本局实际出牌次数（用于春天/反春天判定）
}

export type GameLogEntry =
  | { kind: 'bid'; player: number; type: 'pass' | 'bid'; score?: number }
  | { kind: 'play'; player: number; cards: Card[]; type: CardType | null }
  | { kind: 'pass'; player: number }
  | { kind: 'redeal' }
  | { kind: 'settle'; winner: number; landlordWon: boolean; multiplier: number; scores: number[] };

export interface GameState {
  mode: ModeConfig;
  seed: number | string;
  rngState: number;
  phase: GamePhase;
  players: PlayerState[];
  bottom: Card[];
  landlord: number; // -1 未定
  bids: Bid[];
  highestBid: number;
  highestBidder: number; // -1 表示无人叫分
  currentPlayer: number;
  lastPlay: Play | null;
  leadingPlayer: number; // 当前这一手的出牌者
  consecutivePasses: number;
  bombsPlayed: number;
  rocketsPlayed: number;
  winner: number; // -1 未分胜负
  landlordWon: boolean;
  spring: boolean;
  antiSpring: boolean;
  multiplier: number;
  scores: number[];
  log: GameLogEntry[];
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function nextSeat(seat: number, players: number): number {
  return (seat + 1) % players;
}

export function createGame(mode: ModeConfig, seed: number | string): GameState {
  const rng = createRng(seed);
  const { hands, bottom } = deal(mode, rng);
  const players: PlayerState[] = hands.map((h) => ({ hand: sortCards(h), playedCount: 0 }));
  const firstBidder = rng.nextInt(mode.players);
  return {
    mode,
    seed,
    rngState: rng.getState(),
    phase: 'bidding',
    players,
    bottom,
    landlord: -1,
    bids: [],
    highestBid: 0,
    highestBidder: -1,
    currentPlayer: firstBidder,
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
    scores: new Array(mode.players).fill(0),
    log: [],
  };
}

export interface BidAction {
  player: number;
  type: 'pass' | 'bid';
  score?: number; // 仅 type === 'bid'
}

export function bid(state: GameState, action: BidAction): GameState {
  assert(state.phase === 'bidding', '只能在叫地主阶段叫牌');
  assert(action.player === state.currentPlayer, '不是当前玩家的回合');

  const bids = [...state.bids];
  let highestBid = state.highestBid;
  let highestBidder = state.highestBidder;

  if (action.type === 'bid') {
    const score = action.score ?? 0;
    assert(score >= 1 && score <= 3, '叫分必须在 1~3 之间');
    assert(score > highestBid, '后叫者必须严格大于此前最高分');
    highestBid = score;
    highestBidder = action.player;
  }

  const bidEntry: Bid =
    action.type === 'bid'
      ? { player: action.player, type: 'bid', score: action.score }
      : { player: action.player, type: 'pass' };
  bids.push(bidEntry);

  const logEntry: GameLogEntry =
    action.type === 'bid'
      ? { kind: 'bid', player: action.player, type: 'bid', score: action.score }
      : { kind: 'bid', player: action.player, type: 'pass' };

  const base: GameState = { ...state, bids, highestBid, highestBidder, log: [...state.log, logEntry] };

  if (highestBid === 3) return finishBidding(base, highestBidder);
  if (bids.length === state.mode.players) {
    if (highestBidder === -1) return redeal(base);
    return finishBidding(base, highestBidder);
  }
  return { ...base, currentPlayer: nextSeat(action.player, state.mode.players) };
}

function finishBidding(state: GameState, landlord: number): GameState {
  const players = state.players.map((p, i) =>
    i === landlord ? { ...p, hand: sortCards([...p.hand, ...state.bottom]) } : p,
  );
  return {
    ...state,
    players,
    landlord,
    phase: 'playing',
    currentPlayer: landlord,
    leadingPlayer: -1,
    lastPlay: null,
    consecutivePasses: 0,
  };
}

function redeal(state: GameState): GameState {
  const rng = createRng(state.rngState);
  const { hands, bottom } = deal(state.mode, rng);
  const players = hands.map((h) => ({ hand: sortCards(h), playedCount: 0 }));
  const firstBidder = rng.nextInt(state.mode.players);
  return {
    ...state,
    players,
    bottom,
    rngState: rng.getState(),
    bids: [],
    highestBid: 0,
    highestBidder: -1,
    currentPlayer: firstBidder,
    phase: 'bidding',
    log: [...state.log, { kind: 'redeal' }],
  };
}

export interface PlayAction {
  player: number;
  cards: Card[];
}

export function play(state: GameState, action: PlayAction): GameState {
  assert(state.phase === 'playing', '只能在出牌阶段出牌');
  assert(action.player === state.currentPlayer, '不是当前玩家的回合');

  const hand = state.players[action.player].hand;
  assert(containsAll(hand, action.cards), '出的牌不在手牌中');

  const lastAnalysis = state.lastPlay ? state.lastPlay.analysis : null;
  const validation = isValidPlay(action.cards, lastAnalysis, state.mode);
  assert(validation.valid, '不符合出牌规则');

  const newHand = removeCards(hand, action.cards);
  const players = state.players.map((p, i) =>
    i === action.player ? { ...p, hand: newHand, playedCount: p.playedCount + 1 } : p,
  );

  const analysis = validation.analysis;
  const thePlay: Play = { player: action.player, cards: sortCards(action.cards), analysis };
  const bombsPlayed = state.bombsPlayed + (analysis.type === 'bomb' ? 1 : 0);
  const rocketsPlayed =
    state.rocketsPlayed +
    (analysis.type === 'rocket' || analysis.type === 'super-rocket' ? 1 : 0);

  const next: GameState = {
    ...state,
    players,
    lastPlay: thePlay,
    leadingPlayer: action.player,
    consecutivePasses: 0,
    bombsPlayed,
    rocketsPlayed,
    log: [
      ...state.log,
      { kind: 'play', player: action.player, cards: sortCards(action.cards), type: analysis.type },
    ],
  };

  if (newHand.length === 0) {
    const landlordWon = action.player === state.landlord;
    return settleGame(next, action.player, landlordWon);
  }

  return { ...next, currentPlayer: nextSeat(action.player, state.mode.players) };
}

export interface PassAction {
  player: number;
}

export function pass(state: GameState, action: PassAction): GameState {
  assert(state.phase === 'playing', '只能在出牌阶段过牌');
  assert(action.player === state.currentPlayer, '不是当前玩家的回合');
  assert(state.lastPlay !== null, '首出时不能过牌');

  const passes = state.consecutivePasses + 1;
  const log: GameLogEntry[] = [...state.log, { kind: 'pass', player: action.player }];
  if (passes >= state.mode.players - 1) {
    // 一轮结束：上一手出牌者获得新一轮首出权
    return { ...state, log, lastPlay: null, consecutivePasses: 0, currentPlayer: state.leadingPlayer };
  }
  return { ...state, log, consecutivePasses: passes, currentPlayer: nextSeat(action.player, state.mode.players) };
}

/** 春天 / 反春天判定（独立纯函数，便于单独测试） */
export function detectSpring(
  landlordWon: boolean,
  landlordPlayedCount: number,
  farmerPlayedCounts: number[],
): { spring: boolean; antiSpring: boolean } {
  return {
    spring: landlordWon && farmerPlayedCounts.every((c) => c === 0),
    antiSpring: !landlordWon && landlordPlayedCount === 1,
  };
}

function settleGame(state: GameState, winner: number, landlordWon: boolean): GameState {
  const landlordPlayed = state.players[state.landlord].playedCount;
  const farmerPlayed = state.players.map((p, i) => (i === state.landlord ? 0 : p.playedCount));
  const { spring, antiSpring } = detectSpring(landlordWon, landlordPlayed, farmerPlayed);

  const result = settle({
    mode: state.mode,
    baseScore: state.highestBid,
    landlordWon,
    landlord: state.landlord,
    bombs: state.bombsPlayed,
    rockets: state.rocketsPlayed,
    spring,
    antiSpring,
  });

  return {
    ...state,
    phase: 'settled',
    winner,
    landlordWon,
    spring,
    antiSpring,
    multiplier: result.multiplier,
    scores: result.scores,
    log: [
      ...state.log,
      { kind: 'settle', winner, landlordWon, multiplier: result.multiplier, scores: result.scores },
    ],
  };
}

function containsAll(hand: Card[], cards: Card[]): boolean {
  const freq = new Map<number, number>();
  for (const c of hand) freq.set(c, (freq.get(c) ?? 0) + 1);
  for (const c of cards) {
    const v = (freq.get(c) ?? 0) - 1;
    if (v < 0) return false;
    freq.set(c, v);
  }
  return true;
}

function removeCards(hand: Card[], cards: Card[]): Card[] {
  const toRemove = new Map<number, number>();
  for (const c of cards) toRemove.set(c, (toRemove.get(c) ?? 0) + 1);
  const out: Card[] = [];
  for (const c of hand) {
    const need = toRemove.get(c) ?? 0;
    if (need > 0) toRemove.set(c, need - 1);
    else out.push(c);
  }
  return out;
}
