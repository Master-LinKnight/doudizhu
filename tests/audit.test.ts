import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { createGame, bid, type GameState, type GameLogEntry } from '../src/game/engine.js';
import { auditGame, replayGame } from '../src/game/audit.js';
import { simulateGame } from '../src/game/ai/simulate.js';
import { DIFFICULTIES, type Difficulty } from '../src/game/ai/provider.js';
import { buildAiView } from '../src/game/ai/isolation.js';
import { decidePlay } from '../src/game/ai/ruleAi.js';
import { cardToString } from '../src/game/deck.js';
import { LlmProvider, type FetchLike, type FetchLikeInit, type FetchLikeResponse } from '../src/game/ai/llmProvider.js';

function toPlaying(mode: typeof THREE_PLAYER | typeof FOUR_PLAYER, seed: number): GameState {
  let g = createGame(mode, seed);
  g = bid(g, { player: g.currentPlayer, type: 'bid', score: 3 });
  return g;
}

function cfg() {
  return { baseUrl: 'http://x/v1', apiKey: '', model: 'm' };
}

function textFetch(text: string, capture?: (b: string) => void): FetchLike {
  return async (_url: string, init: FetchLikeInit): Promise<FetchLikeResponse> => {
    capture?.(init.body);
    return { ok: true, status: 200, text: async () => text };
  };
}

describe('回放审计（replay / audit）', () => {
  it.each(DIFFICULTIES)('难度 %s：三人对局可完整回放且日志一致', (diff) => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = simulateGame(THREE_PLAYER, seed, diff);
      const res = auditGame(THREE_PLAYER, g.seed, g.log);
      expect(res.violations).toEqual([]);
      expect(res.ok).toBe(true);
      expect(res.replayed?.phase).toBe('settled');
    }
  });

  it.each(DIFFICULTIES)('难度 %s：四人对局可完整回放且日志一致', (diff) => {
    for (let seed = 1; seed <= 5; seed++) {
      const g = simulateGame(FOUR_PLAYER, seed, diff);
      const res = auditGame(FOUR_PLAYER, g.seed, g.log);
      expect(res.violations).toEqual([]);
      expect(res.ok).toBe(true);
      expect(res.replayed?.phase).toBe('settled');
    }
  });

  it('回放终态与原局终态完全一致（含日志逐条相等）', () => {
    const g = simulateGame(THREE_PLAYER, 2024, 'hard');
    const replayed = replayGame(THREE_PLAYER, g.seed, g.log);
    expect(replayed).toEqual(g);
  });

  it('篡改出牌为非法（空牌）→ 审计失败并抛出非法动作', () => {
    const g = simulateGame(THREE_PLAYER, 7, 'normal');
    const tampered: GameLogEntry[] = g.log.map((e) => (e.kind === 'play' ? { ...e, cards: [] as number[] } : e));
    const res = auditGame(THREE_PLAYER, g.seed, tampered);
    expect(res.ok).toBe(false);
    expect(res.violations.length).toBeGreaterThan(0);
  });

  it('篡改结算 winner → 审计报告不一致', () => {
    const g = simulateGame(THREE_PLAYER, 8, 'normal');
    const tampered: GameLogEntry[] = g.log.map((e) =>
      e.kind === 'settle' ? { ...e, winner: (e.winner + 1) % 3 } : e,
    );
    const res = auditGame(THREE_PLAYER, g.seed, tampered);
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.includes('winner'))).toBe(true);
  });
});

describe('多局异常检查（三种难度 × 两种模式 × 多种子）', () => {
  it('大量对局全部可审计、零和、且无异常', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    let games = 0;
    for (const mode of [THREE_PLAYER, FOUR_PLAYER]) {
      for (const diff of DIFFICULTIES as Difficulty[]) {
        for (const seed of seeds) {
          const g = simulateGame(mode, `${mode.id}:${diff}:${seed}`, diff);
          games++;
          expect(g.phase).toBe('settled');
          expect(g.scores.reduce((x, y) => x + y, 0)).toBe(0);
          const res = auditGame(mode, g.seed, g.log);
          expect(res.violations, `模式=${mode.id} 难度=${diff} 种子=${seed}`).toEqual([]);
          expect(res.ok).toBe(true);
        }
      }
    }
    expect(games).toBeGreaterThanOrEqual(100); // 确保「多局」规模
  }, 60_000);
});

describe('信息隔离不因难度 / LLM 而破坏', () => {
  it('三档难度：AI 出牌只来自自己的手牌（不偷看他人牌）', () => {
    for (const mode of [THREE_PLAYER, FOUR_PLAYER]) {
      const g = toPlaying(mode, 5);
      for (let seat = 0; seat < mode.players; seat++) {
        const view = buildAiView(g, seat);
        for (const diff of DIFFICULTIES) {
          const dec = decidePlay(view, diff, { mistakeRate: 0 });
          for (const c of dec.cards) {
            expect(view.myHand.includes(c)).toBe(true);
          }
        }
      }
    }
  });

  it('LLM prompt 不泄露其他玩家手牌（四人两副牌，含重复牌）', async () => {
    const g = toPlaying(FOUR_PLAYER, 9);
    for (let seat = 0; seat < FOUR_PLAYER.players; seat++) {
      const my = new Set(g.players[seat].hand.map(cardToString));
      const hidden: string[] = [];
      for (let o = 0; o < FOUR_PLAYER.players; o++) {
        if (o === seat) continue;
        for (const c of g.players[o].hand) {
          const s = cardToString(c);
          if (!my.has(s)) hidden.push(s); // 只检查「对手独有、自己手上没有」的牌，避免重复牌误报
        }
      }

      let body = '';
      const prov = new LlmProvider('normal', cfg(), {
        fetchFn: textFetch('{"action":"pass"}', (b) => {
          body = b;
        }),
      });
      await prov.decide(buildAiView(g, seat));

      const payload = JSON.parse(body) as { messages: { content: string }[] };
      const combined = payload.messages.map((m) => m.content).join('\n');
      for (const s of hidden) {
        expect(combined).not.toContain(s);
      }
    }
  });
});
