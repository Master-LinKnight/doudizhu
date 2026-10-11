// ui.ts — 渲染层纯工具函数（与 src/game 核心解耦，不含游戏规则判定）
import type { Card, CardType } from '../game/types.js';
import type { GameState } from '../game/engine.js';

export const TYPE_LABELS: Record<CardType, string> = {
  single: '单张',
  pair: '对子',
  triple: '三张',
  'triple-single': '三带一',
  'triple-pair': '三带二',
  straight: '顺子',
  'straight-pairs': '连对',
  airplane: '飞机',
  'airplane-singles': '飞机带单',
  'airplane-pairs': '飞机带对',
  'four-two': '四带二',
  bomb: '炸弹',
  rocket: '火箭',
  'super-rocket': '天王炸',
};

export function typeLabel(type: CardType | null | undefined): string {
  return type ? TYPE_LABELS[type] : '';
}

export type SeatPosition = 'bottom' | 'left' | 'right' | 'top';

/** 人类固定在下（seat 0），其余按座位布局 */
export function seatPosition(seat: number, players: number): SeatPosition {
  if (seat === 0) return 'bottom';
  if (players === 3) return seat === 1 ? 'left' : 'right';
  return seat === 1 ? 'right' : seat === 2 ? 'top' : 'left';
}

/** 回合顺序：叫分阶段从首个叫分者起、出牌阶段从地主起，按座位顺时针轮转一圈 */
export function turnOrder(state: GameState): number[] {
  const n = state.mode.players;
  const start =
    state.phase === 'playing'
      ? state.landlord
      : state.bids.length > 0
        ? state.bids[0].player
        : state.currentPlayer;
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push((start + i) % n);
  return order;
}

/** 当前「一手」内某座位的一次动作：出牌或不出 */
export type SeatAction =
  | { player: number; kind: 'play'; cards: Card[] }
  | { player: number; kind: 'pass' };

/** 从日志末尾重构「当前这一手」各玩家的动作（含过牌；无活跃一手时为空） */
export function currentTrickActions(state: GameState): SeatAction[] {
  if (state.lastPlay === null) return [];
  const log = state.log;
  const need = state.mode.players - 1;
  // 从末尾向前定位上一手收尾的 need 连过；整段连过都属于上一手，当前一手从其后的下标开始
  let passes = 0;
  let start = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === 'pass') {
      passes++;
      if (passes >= need) {
        start = i + passes;
        break;
      }
    } else if (e.kind === 'play') {
      passes = 0;
    }
  }
  const actions: SeatAction[] = [];
  for (let i = start; i < log.length; i++) {
    const e = log[i];
    if (e.kind === 'play') actions.push({ player: e.player, kind: 'play', cards: e.cards });
    else if (e.kind === 'pass') actions.push({ player: e.player, kind: 'pass' });
  }
  return actions;
}

/** 取某座位在「当前这一手」中最近一次动作（出牌或不出，取最后一次） */
export function latestActionOf(actions: SeatAction[], player: number): SeatAction | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i].player === player) return actions[i];
  }
  return null;
}

export type EffectCategory = 'basic' | 'combo' | 'bomb' | 'rocket';

export function effectCategory(type: CardType | null | undefined): EffectCategory {
  switch (type) {
    case 'straight':
    case 'straight-pairs':
    case 'airplane':
    case 'airplane-singles':
    case 'airplane-pairs':
      return 'combo';
    case 'bomb':
      return 'bomb';
    case 'rocket':
    case 'super-rocket':
      return 'rocket';
    default:
      return 'basic';
  }
}

export type EffectsLevel = 'off' | 'simple' | 'full';

export const EFFECTS_LEVELS: { value: EffectsLevel; label: string }[] = [
  { value: 'full', label: '完整' },
  { value: 'simple', label: '简化' },
  { value: 'off', label: '关闭' },
];
