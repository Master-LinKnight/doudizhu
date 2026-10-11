import { describe, it, expect } from 'vitest';
import { THREE_PLAYER, FOUR_PLAYER } from '../src/game/types.js';
import { analyzeHand } from '../src/game/hand.js';
import { createGame, bid, play, pass, type GameState, type Play } from '../src/game/engine.js';
import { buildAiView, buildBidView, type AiView, type BidView } from '../src/game/ai/isolation.js';
import {
  LlmProvider,
  createAiProvider,
  testLlmConnection,
  DEFAULT_LLM_MODEL,
  type FetchLike,
  type FetchLikeInit,
  type FetchLikeResponse,
  type LlmConfig,
} from '../src/game/ai/llmProvider.js';
import { c, SJ } from './helpers.js';

function cfg(): LlmConfig {
  return { baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'test-model' };
}

function makeView(hand: number[], lastPlay: Play | null): AiView {
  return {
    mode: THREE_PLAYER,
    mySeat: 0,
    myHand: hand,
    myRole: 'landlord',
    lastPlay,
    publicPlayHistory: [],
    bidHistory: [],
    cardsRemaining: [hand.length, 0, 0],
    landlordSeat: 0,
  };
}

function makeBidView(hand: number[], highestBid = 0): BidView {
  return { mode: THREE_PLAYER, mySeat: 0, myHand: hand, bids: [], highestBid };
}

function playOf(cards: number[]): Play {
  return { player: 1, cards, analysis: analyzeHand(cards, THREE_PLAYER) };
}

function textFetch(text: string, capture?: (body: string) => void): FetchLike {
  return async (_url: string, init: FetchLikeInit): Promise<FetchLikeResponse> => {
    capture?.(init.body);
    return { ok: true, status: 200, text: async () => text };
  };
}

async function runFullGame(mode: typeof THREE_PLAYER, seed: number, fetchFn: FetchLike): Promise<GameState> {
  const providers = Array.from(
    { length: mode.players },
    () =>
      new LlmProvider('normal', { baseUrl: 'http://x/v1', apiKey: '', model: 'm', timeoutMs: 1000 }, { fetchFn }),
  );
  let g = createGame(mode, seed);
  let guard = 0;
  while (g.phase !== 'settled' && guard < 100000) {
    guard++;
    const p = g.currentPlayer;
    const prov = providers[p];
    if (g.phase === 'bidding') {
      const dec = await prov.decideBid(buildBidView(g, p));
      g = bid(g, { player: p, type: dec.action, score: dec.score });
    } else {
      const dec = await prov.decide(buildAiView(g, p));
      g = dec.action === 'pass' ? pass(g, { player: p }) : play(g, { player: p, cards: dec.cards });
    }
  }
  expect(g.phase).toBe('settled');
  return g;
}

describe('LlmProvider 出牌决策', () => {
  it('LLM 返回合法首出：按下标解析并返回对应牌', async () => {
    const hand = [c(3), c(4), c(5)];
    const prov = new LlmProvider('normal', cfg(), { fetchFn: textFetch('{"action":"play","cards":[0]}') });
    const dec = await prov.decide(makeView(hand, null));
    expect(dec).toEqual({ action: 'play', cards: [c(5)] }); // 降序排序后下标 0 = 最大的 5
  });

  it('LLM 返回过牌且上家出牌非空：接受过牌', async () => {
    const prov = new LlmProvider('normal', cfg(), { fetchFn: textFetch('{"action":"pass"}') });
    const dec = await prov.decide(makeView([c(3), c(4)], playOf([c(9)])));
    expect(dec).toEqual({ action: 'pass', cards: [] });
  });

  it('下标越界 → 回退本地并触发 onFallback', async () => {
    let fell = false;
    const prov = new LlmProvider('normal', cfg(), {
      fetchFn: textFetch('{"action":"play","cards":[99]}'),
      onFallback: () => {
        fell = true;
      },
    });
    const dec = await prov.decide(makeView([c(3), c(4), c(5)], null));
    expect(fell).toBe(true);
    expect(dec.action).toBe('play');
  });

  it('重复下标导致牌不在手牌 → 回退本地', async () => {
    let fell = false;
    const prov = new LlmProvider('normal', cfg(), {
      fetchFn: textFetch('{"action":"play","cards":[0,0]}'),
      onFallback: () => {
        fell = true;
      },
    });
    const dec = await prov.decide(makeView([c(3)], null));
    expect(fell).toBe(true);
    expect(dec.action).toBe('play');
  });

  it('非合法牌型（两张不同单牌）→ 回退本地', async () => {
    let fell = false;
    const prov = new LlmProvider('normal', cfg(), {
      fetchFn: textFetch('{"action":"play","cards":[0,1]}'),
      onFallback: () => {
        fell = true;
      },
    });
    const dec = await prov.decide(makeView([c(3), c(4), c(5), c(6)], null));
    expect(fell).toBe(true);
    expect(dec.action).toBe('play');
  });

  it('压不过上家的牌 → 回退本地', async () => {
    let fell = false;
    const prov = new LlmProvider('normal', cfg(), {
      fetchFn: textFetch('{"action":"play","cards":[0]}'),
      onFallback: () => {
        fell = true;
      },
    });
    // 手牌 3 无法压过上家的单张 9
    const dec = await prov.decide(makeView([c(3)], playOf([c(9)])));
    expect(fell).toBe(true);
  });
});

describe('LlmProvider 降级（网络 / 超时 / 非法输出）', () => {
  it('网络异常 → 回退本地', async () => {
    const rejecting: FetchLike = async () => {
      throw new Error('network down');
    };
    const prov = new LlmProvider('normal', cfg(), { fetchFn: rejecting });
    const dec = await prov.decide(makeView([c(3)], null));
    expect(dec.action).toBe('play');
  });

  it('HTTP 错误 → 回退本地', async () => {
    const failing: FetchLike = async () => ({ ok: false, status: 500, text: async () => 'oops' });
    const prov = new LlmProvider('normal', cfg(), { fetchFn: failing });
    const dec = await prov.decide(makeView([c(3)], null));
    expect(dec.action).toBe('play');
  });

  it('非 JSON 输出 → 回退本地', async () => {
    const prov = new LlmProvider('normal', cfg(), { fetchFn: textFetch('我想想……先出这张') });
    const dec = await prov.decide(makeView([c(3)], null));
    expect(dec.action).toBe('play');
  });

  it('超时 → 回退本地', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const prov = new LlmProvider('normal', { ...cfg(), timeoutMs: 20 }, { fetchFn: hanging });
    const dec = await prov.decide(makeView([c(3)], null));
    expect(dec.action).toBe('play');
  });
});

describe('LlmProvider 叫地主决策', () => {
  it('LLM 叫分 3 → 返回 bid 3', async () => {
    const prov = new LlmProvider('normal', cfg(), { fetchFn: textFetch('{"action":"bid","score":3}') });
    const dec = await prov.decideBid(makeBidView([c(3)], 0));
    expect(dec).toEqual({ action: 'bid', score: 3 });
  });

  it('叫分不大于最高分 → 回退本地', async () => {
    let fell = false;
    const prov = new LlmProvider('normal', cfg(), {
      fetchFn: textFetch('{"action":"bid","score":1}'),
      onFallback: () => {
        fell = true;
      },
    });
    const dec = await prov.decideBid(makeBidView([c(3)], 1));
    expect(fell).toBe(true);
    expect(['pass', 'bid']).toContain(dec.action);
  });
});

describe('prompt 与工厂', () => {
  it('prompt 含身份、手牌与「禁止推断他人手牌」约束', async () => {
    let body = '';
    const prov = new LlmProvider('normal', cfg(), {
      fetchFn: textFetch('{"action":"pass"}', (b) => {
        body = b;
      }),
    });
    await prov.decide(makeView([c(3), SJ()], playOf([c(9)])));
    const payload = JSON.parse(body) as { messages: { content: string }[] };
    expect(payload.messages[0].content).toContain('禁止');
    expect(payload.messages[1].content).toContain('地主');
    expect(payload.messages[1].content).toContain('小王');
  });

  it('createAiProvider：未配置 / 无效配置 → 本地；有效配置 → LLM', () => {
    expect(createAiProvider('rule', 'normal', null).kind).toBe('rule');
    expect(createAiProvider('llm', 'normal', null).kind).toBe('rule');
    expect(createAiProvider('llm', 'normal', { baseUrl: '', apiKey: '', model: '' }).kind).toBe('rule');
    expect(createAiProvider('llm', 'normal', { baseUrl: 'http://x/v1', apiKey: '', model: 'm' }).kind).toBe('llm');
  });
});

describe('四人模式与整局', () => {
  it('四人模式：两个下标可指向两张同名牌（不同副），构成对子', async () => {
    const hand = [c(3, 0, 0), c(3, 0, 1)]; // 两张 3♠（copy 0 与 copy 1）
    const prov = new LlmProvider('normal', cfg(), { fetchFn: textFetch('{"action":"play","cards":[0,1]}') });
    const dec = await prov.decide({ ...makeView(hand, null), mode: FOUR_PLAYER });
    expect(dec.action).toBe('play');
    expect(dec.cards).toHaveLength(2);
    expect(analyzeHand(dec.cards, FOUR_PLAYER).type).toBe('pair');
  });

  it('LLM 全程失败仍能打完一整局（回退本地，零和结算）', async () => {
    const rejecting: FetchLike = async () => {
      throw new Error('down');
    };
    const g = await runFullGame(THREE_PLAYER, 42, rejecting);
    expect(g.phase).toBe('settled');
    expect(g.scores.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('testLlmConnection 连通性测试', () => {
  it('默认模型名为 deepseek-flash', () => {
    expect(DEFAULT_LLM_MODEL).toBe('deepseek-flash');
  });

  it('未配置 → 返回 ok=false 且提示填写', async () => {
    const r = await testLlmConnection({ baseUrl: '', apiKey: '', model: '' }, textFetch('{}'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('请先填写');
  });

  it('HTTP 200 → 连通成功，且发送最小请求（max_tokens=1）', async () => {
    let body = '';
    const r = await testLlmConnection(cfg(), (url, init) => {
      body = init.body;
      return textFetch('{}')(url, init);
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    const payload = JSON.parse(body) as { model: string; max_tokens: number };
    expect(payload.model).toBe('test-model');
    expect(payload.max_tokens).toBe(1);
  });

  it('HTTP 非 2xx → ok=false 且带 status', async () => {
    const failing: FetchLike = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
    const r = await testLlmConnection(cfg(), failing);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.message).toContain('401');
  });

  it('网络异常 → ok=false 且提示连接失败', async () => {
    const rejecting: FetchLike = async () => {
      throw new Error('network down');
    };
    const r = await testLlmConnection(cfg(), rejecting);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('连接失败');
  });
});
