// llmProvider.ts — LLM 接入实现（可选，用户自选；规格书 4.2）
//
// 通过 OpenAI 兼容的 chat/completions 接口调用大语言模型：
//   - 每次决策都是「独立调用、独立上下文」——无会话状态，天然不串通；
//   - prompt 明确身份与约束：只能基于自己手牌 + 公共信息，禁止推断他人手牌做局；
//   - 支持难度档位（通过 prompt 注入策略要求）；
//   - 降级：未配置 / 网络异常 / 超时 / 非法输出 → 自动回退本地规则算法，对局不中断。

import type { Card, ModeConfig } from '../types.js';
import { cardToString, sortCards } from '../deck.js';
import { analyzeHand } from '../hand.js';
import { beats } from '../rules.js';
import type { AiView, BidView } from './isolation.js';
import type { AiProvider, BidDecision, Decision, Difficulty } from './provider.js';
import { RuleAiProvider, type DecidePlayOptions } from './ruleAi.js';

/** LLM 接入配置（用户在设置中填写） */
export interface LlmConfig {
  /** API 根地址，如 https://api.openai.com/v1 或 http://localhost:11434/v1 */
  baseUrl: string;
  /** API key（本地无鉴权服务可留空） */
  apiKey: string;
  /** 模型名，如 gpt-4o-mini / qwen2.5 / deepseek-flash */
  model: string;
  /** 超时毫秒，默认 10000 */
  timeoutMs?: number;
}

/** 默认模型名（设置页预填） */
export const DEFAULT_LLM_MODEL = 'deepseek-flash';

/** 配置是否足以发起调用 */
export function isValidLlmConfig(cfg: LlmConfig | null | undefined): boolean {
  return !!cfg && !!cfg.baseUrl.trim() && !!cfg.model.trim();
}

/** 可注入的 fetch 抽象（默认用全局 fetch），便于单测不联网 */
export interface FetchLikeInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init: FetchLikeInit) => Promise<FetchLikeResponse>;

async function defaultFetch(url: string, init: FetchLikeInit): Promise<FetchLikeResponse> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });
  return { ok: res.ok, status: res.status, text: () => res.text() };
}

export interface LlmTestResult {
  ok: boolean;
  status?: number;
  message: string;
}

/** 测试 LLM 连通性：发一条极小请求（max_tokens=1），区分未配置 / HTTP 非 2xx / 网络 / 超时 */
export async function testLlmConnection(
  config: LlmConfig,
  fetchFn: FetchLike = defaultFetch,
): Promise<LlmTestResult> {
  if (!isValidLlmConfig(config)) return { ok: false, message: '请先填写 API 地址与模型名' };
  const base = config.baseUrl.trim().replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 8000);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        stream: false,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (res.ok) return { ok: true, status: res.status, message: `连通成功（HTTP ${res.status}）` };
    return { ok: false, status: res.status, message: `HTTP ${res.status}：${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, message: `连接失败：${(e as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

const TYPE_NAMES: Record<string, string> = {
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

const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: '你处于简单水平：倾向出点数最小、最保守的合法牌，允许次优甚至偶尔失误。',
  normal: '你处于普通水平：优先出完整结构（顺子/连对/飞机/三带），跟牌出最省的一手。',
  hard: '你处于困难水平：追求用最少手数出完，善用炸弹抢控制权，精准计算剩余手数。',
};

const SYSTEM_PROMPT = [
  '你是一名斗地主玩家，正在参与一局游戏。严格遵守以下约束：',
  '1. 只能基于「你自己的手牌」与「公共信息」（已出的牌、叫分、各玩家剩余牌数）做决策。',
  '2. 严禁推断、猜测或利用任何其他玩家的手牌；不存在上帝视角，禁止做局或串通。',
  '3. 出的每一手牌必须来自你自己的手牌，且是符合斗地主规则的合法牌型。',
  '4. 只输出一个 JSON 对象，不要输出任何其他文字、解释或代码块。',
].join('\n');

function modeName(mode: ModeConfig): string {
  return mode.players === 3 ? '三人 · 一副牌（54 张）' : '四人 · 两副牌（108 张）';
}

function describeHand(sorted: Card[]): string {
  return sorted.map((c, i) => `${i}: ${cardToString(c)}`).join('\n');
}

function describeLastPlay(view: AiView): string {
  if (view.lastPlay === null) return '无（你是本轮首出，可自由出任意合法牌型）';
  const type = view.lastPlay.analysis.type ? TYPE_NAMES[view.lastPlay.analysis.type] ?? view.lastPlay.analysis.type : '未知';
  const cards = sortCards([...view.lastPlay.cards]).map(cardToString).join(' ');
  return `${type}：${cards}（由座位 ${view.lastPlay.player} 打出）`;
}

function buildPlayingPrompt(view: AiView, sorted: Card[], difficulty: Difficulty): { system: string; user: string } {
  const remaining = view.cardsRemaining.map((n, i) => `座位${i}=${n}张`).join('，');
  const user = [
    `模式：${modeName(view.mode)}`,
    `你的座位：${view.mySeat}`,
    `你的身份：${view.myRole === 'landlord' ? '地主' : '农民'}`,
    `你的手牌（下标从 0 开始，共 ${sorted.length} 张）：`,
    describeHand(sorted),
    `需要你跟的牌：${describeLastPlay(view)}`,
    `各玩家剩余牌数：${remaining}`,
    DIFFICULTY_HINT[difficulty],
    '请决定这一手：出牌则给出 {"action":"play","cards":[手牌下标数组]}，过牌则给出 {"action":"pass"}。',
  ].join('\n');
  return { system: SYSTEM_PROMPT, user };
}

function buildBidPrompt(view: BidView, sorted: Card[], difficulty: Difficulty): { system: string; user: string } {
  const user = [
    `模式：${modeName(view.mode)}`,
    `你的座位：${view.mySeat}`,
    `你的手牌（下标从 0 开始，共 ${sorted.length} 张）：`,
    describeHand(sorted),
    `当前最高叫分：${view.highestBid}`,
    DIFFICULTY_HINT[difficulty],
    '请决定是否叫地主：叫分给出 {"action":"bid","score":1或2或3}（必须大于当前最高分），不叫给出 {"action":"pass"}。',
  ].join('\n');
  return { system: SYSTEM_PROMPT, user };
}

/** 从响应文本中宽容地提取首个 JSON 对象（容忍模型附加说明 / 代码块围栏） */
function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('响应中未找到 JSON 对象');
  const obj: unknown = JSON.parse(text.slice(start, end + 1));
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new Error('JSON 顶层不是对象');
  return obj as Record<string, unknown>;
}

function parsePlayingAction(obj: Record<string, unknown>): { action: 'play' | 'pass'; indices: number[] } {
  const action = obj.action;
  if (action === 'pass') return { action: 'pass', indices: [] };
  if (action !== 'play') throw new Error('action 必须为 play 或 pass');
  const cards = obj.cards;
  if (!Array.isArray(cards)) throw new Error('cards 必须为数组');
  const indices = cards.map((x) => {
    const n = Number(x);
    if (!Number.isInteger(n) || n < 0) throw new Error('cards 含非法下标');
    return n;
  });
  return { action: 'play', indices };
}

function parseBidAction(obj: Record<string, unknown>): BidDecision {
  const action = obj.action;
  if (action === 'pass') return { action: 'pass' };
  if (action !== 'bid') throw new Error('action 必须为 bid 或 pass');
  const score = Number(obj.score);
  if (score !== 1 && score !== 2 && score !== 3) throw new Error('score 必须为 1/2/3');
  return { action: 'bid', score };
}

/** 多重集包含判断：cards 是否都能从 hand 中拿出 */
function isSubset(hand: Card[], cards: Card[]): boolean {
  const freq = new Map<number, number>();
  for (const c of hand) freq.set(c, (freq.get(c) ?? 0) + 1);
  for (const c of cards) {
    const v = (freq.get(c) ?? 0) - 1;
    if (v < 0) return false;
    freq.set(c, v);
  }
  return true;
}

export interface LlmProviderOptions {
  /** 注入 fetch（默认全局 fetch），便于单测不联网 */
  fetchFn?: FetchLike;
  /** 降级实现（默认同难度本地规则 AI） */
  fallback?: AiProvider;
  /** 降级回调（用于决策日志 / 调试，不抛错） */
  onFallback?: (err: Error) => void;
}

/** LLM AI 实现：任何失败（网络/超时/非法输出）都回退到本地规则算法 */
export class LlmProvider implements AiProvider {
  readonly kind = 'llm' as const;
  private readonly fetchFn: FetchLike;
  private readonly fallback: AiProvider;
  private readonly onFallback: (err: Error) => void;

  constructor(
    readonly difficulty: Difficulty,
    private readonly config: LlmConfig,
    options: LlmProviderOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.fallback = options.fallback ?? new RuleAiProvider(difficulty);
    this.onFallback = options.onFallback ?? (() => {});
  }

  async decide(view: AiView): Promise<Decision> {
    const sorted = sortCards([...view.myHand]);
    try {
      const { system, user } = buildPlayingPrompt(view, sorted, this.difficulty);
      const text = await this.call(system, user);
      const { action, indices } = parsePlayingAction(extractJsonObject(text));
      if (action === 'pass') {
        if (view.lastPlay === null) throw new Error('首出不能过牌');
        return { action: 'pass', cards: [] };
      }
      const cards = indices.map((i) => sorted[i]);
      if (cards.some((c) => c === undefined)) throw new Error('下标越界');
      return this.validatePlay(cards, view);
    } catch (err) {
      this.onFallback(err as Error);
      return this.fallback.decide(view);
    }
  }

  async decideBid(view: BidView): Promise<BidDecision> {
    const sorted = sortCards([...view.myHand]);
    try {
      const { system, user } = buildBidPrompt(view, sorted, this.difficulty);
      const text = await this.call(system, user);
      const dec = parseBidAction(extractJsonObject(text));
      if (dec.action === 'bid' && (dec.score ?? 0) <= view.highestBid) {
        throw new Error('叫分必须严格大于当前最高分');
      }
      return dec;
    } catch (err) {
      this.onFallback(err as Error);
      return this.fallback.decideBid(view);
    }
  }

  /** 校验 LLM 出牌：手牌真含、牌型合法、能压过上家 */
  private validatePlay(cards: Card[], view: AiView): Decision {
    if (!isSubset(view.myHand, cards)) throw new Error('出的牌不在手牌中');
    const analysis = analyzeHand(cards, view.mode);
    if (!analysis.valid) throw new Error('不是合法牌型');
    if (view.lastPlay !== null && !beats(analysis, view.lastPlay.analysis)) {
      throw new Error('压不过上家的牌');
    }
    return { action: 'play', cards: sortCards(cards) };
  }

  private chatUrl(): string {
    const base = this.config.baseUrl.trim().replace(/\/+$/, '');
    return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  }

  private async call(system: string, user: string): Promise<string> {
    const timeoutMs = this.config.timeoutMs ?? 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchFn(this.chatUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          stream: false,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

export type AiSource = 'rule' | 'llm';

/** 工厂：按设置构造 AI。LLM 未配置或配置无效时，静默回退本地算法（保证离线可玩） */
export function createAiProvider(
  source: AiSource,
  difficulty: Difficulty,
  llm?: LlmConfig | null,
  ruleOptions?: DecidePlayOptions,
): AiProvider {
  if (source === 'llm' && isValidLlmConfig(llm)) return new LlmProvider(difficulty, llm as LlmConfig);
  return new RuleAiProvider(difficulty, ruleOptions);
}
