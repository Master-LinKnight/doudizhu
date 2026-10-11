// isolation.ts — 信息隔离（公平性的核心）
//
// AiView / BidView 只包含「自己的手牌」与「公共信息」，
// 绝不包含其他玩家手牌或底牌，从接口层面杜绝 AI 串通与偷看。

import type { Card, ModeConfig } from '../types.js';
import type { GameState, Play, Bid } from '../engine.js';
import { analyzeHand } from '../hand.js';

export type Role = 'landlord' | 'farmer';

export interface AiView {
  mode: ModeConfig;
  mySeat: number;
  myHand: Card[]; // 仅自己的手牌
  myRole: Role;
  lastPlay: Play | null; // 当前需跟的牌（首出为 null）
  publicPlayHistory: Play[]; // 公共出牌历史
  bidHistory: Bid[]; // 叫地主历史（公共）
  cardsRemaining: number[]; // 各玩家剩余牌数（公共可推）
  landlordSeat: number;
}

export interface BidView {
  mode: ModeConfig;
  mySeat: number;
  myHand: Card[];
  bids: Bid[];
  highestBid: number;
}

/** 从游戏状态为指定座位构建隔离视角（深拷贝手牌与公共信息） */
export function buildAiView(state: GameState, seat: number): AiView {
  const publicPlayHistory: Play[] = state.log
    .filter((e) => e.kind === 'play')
    .map((e) => ({ player: e.player, cards: [...e.cards], analysis: analyzeHand(e.cards, state.mode) }));

  return {
    mode: state.mode,
    mySeat: seat,
    myHand: [...state.players[seat].hand],
    myRole: state.landlord === seat ? 'landlord' : 'farmer',
    lastPlay: state.lastPlay
      ? { player: state.lastPlay.player, cards: [...state.lastPlay.cards], analysis: state.lastPlay.analysis }
      : null,
    publicPlayHistory,
    bidHistory: state.bids.map((b) => ({ ...b })),
    cardsRemaining: state.players.map((p) => p.hand.length),
    landlordSeat: state.landlord,
  };
}

export function buildBidView(state: GameState, seat: number): BidView {
  return {
    mode: state.mode,
    mySeat: seat,
    myHand: [...state.players[seat].hand],
    bids: state.bids.map((b) => ({ ...b })),
    highestBid: state.highestBid,
  };
}
