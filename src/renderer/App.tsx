import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardType, ModeConfig } from '../game/types.js';
import { THREE_PLAYER } from '../game/types.js';
import type { GameState } from '../game/engine.js';
import { createGame, bid, play, pass } from '../game/engine.js';
import { isValidPlay } from '../game/rules.js';
import { analyzeHand } from '../game/hand.js';
import { randomSeed, hashSeed, createRng } from '../game/fairness.js';
import type { AiProvider, Difficulty } from '../game/ai/provider.js';
import { decidePlay } from '../game/ai/ruleAi.js';
import { buildAiView, buildBidView } from '../game/ai/isolation.js';
import { createAiProvider, DEFAULT_LLM_MODEL, type AiSource, type LlmConfig } from '../game/ai/llmProvider.js';
import { seatPosition, currentTrickActions, latestActionOf, typeLabel, effectCategory, type EffectsLevel } from './ui.js';
import { loadPersisted, savePersisted } from './storage.js';
import { SettingsScreen } from './components/SettingsScreen.js';
import { Hand } from './components/Hand.js';
import { OpponentSeat } from './components/OpponentSeat.js';
import { PlayArea } from './components/PlayArea.js';
import { ActionBar } from './components/ActionBar.js';
import { ResultOverlay } from './components/ResultOverlay.js';
import { PlayEffect } from './effects/PlayEffect.js';
import './styles/game.css';

const HUMAN_SEAT = 0;
const AI_DELAY_MS = 5000;
const TURN_SECONDS = 5;

/** 对指定座位执行一次 AI 决策（统一走 AiProvider；本地规则 / LLM 均在此接入） */
async function applyAiMove(state: GameState, player: number, provider: AiProvider): Promise<GameState> {
  if (state.phase === 'bidding') {
    const dec = await provider.decideBid(buildBidView(state, player));
    return bid(state, { player, type: dec.action, score: dec.score });
  }
  const dec = await provider.decide(buildAiView(state, player));
  return dec.action === 'pass' ? pass(state, { player }) : play(state, { player, cards: dec.cards });
}

interface LastEffect {
  type: CardType | null;
  nonce: number;
}

export default function App() {
  const [screen, setScreen] = useState<'settings' | 'game'>('settings');
  const [mode, setMode] = useState<ModeConfig>(THREE_PLAYER);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [effects, setEffects] = useState<EffectsLevel>('full');
  const [persisted] = useState(loadPersisted);
  const [source, setSource] = useState<AiSource>(persisted?.source ?? 'rule');
  const [llm, setLlm] = useState<LlmConfig>(persisted?.llm ?? { baseUrl: '', apiKey: '', model: DEFAULT_LLM_MODEL });

  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [hint, setHint] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [lastEffect, setLastEffect] = useState<LastEffect | null>(null);
  const [shaking, setShaking] = useState(false);
  const [countdown, setCountdown] = useState(TURN_SECONDS);

  const effectNonce = useRef(0);

  // AI 来源（本地规则 / LLM）：LLM 未配置或无效时工厂自动降级本地，保证离线可玩。
  // easy 难度本地 AI 的随机失误使用可设种子 rng（随每局重建，保证可复现）。
  const [provider, setProvider] = useState<AiProvider>(() =>
    createAiProvider(source, difficulty, llm, { rng: createRng(0) }),
  );

  // 持久化「AI 来源 + LLM 配置」，下次进入自动恢复连接
  useEffect(() => {
    savePersisted({ source, llm });
  }, [source, llm]);

  function startGame() {
    const s = randomSeed();
    setProvider(createAiProvider(source, difficulty, llm, { rng: createRng(hashSeed(`${s}:ai`)) }));
    setGame(createGame(mode, s));
    setSelected([]);
    setHint([]);
    setMessage('');
    setLastEffect(null);
    setScreen('game');
  }

  function restart() {
    const s = randomSeed();
    setProvider(createAiProvider(source, difficulty, llm, { rng: createRng(hashSeed(`${s}:ai`)) }));
    setGame(createGame(mode, s));
    setSelected([]);
    setHint([]);
    setMessage('');
    setLastEffect(null);
  }

  function backToSettings() {
    setScreen('settings');
    setGame(null);
    setSelected([]);
    setHint([]);
    setMessage('');
  }

  // 驱动 AI 回合：轮到 AI 时，延时后自动决策（本地规则即时、LLM 异步调用）
  useEffect(() => {
    if (!game || game.phase === 'settled') return;
    if (game.currentPlayer === HUMAN_SEAT) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await applyAiMove(game, game.currentPlayer, provider);
      if (!cancelled) setGame(next);
    }, AI_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [game, provider]);

  // 出牌后停留倒计时：每次出牌/过牌/叫分推进后重置为 5 秒，逐秒递减。
  // 仅在对家（AI）回合显示，表示「上一家出完牌后停留 5 秒」再行动；人类回合不再倒计时催促。
  const turnKey = game && game.phase !== 'settled' ? `${game.log.length}:${game.currentPlayer}` : '';
  useEffect(() => {
    if (!turnKey) return;
    setCountdown(TURN_SECONDS);
    const iv = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [turnKey]);

  // 侦测最新一次出牌，触发牌型特效
  useEffect(() => {
    if (!game) return;
    const last = game.log[game.log.length - 1];
    if (!last || last.kind !== 'play') return;
    effectNonce.current += 1;
    setLastEffect({ type: last.type, nonce: effectNonce.current });
  }, [game]);

  // 炸弹/火箭抖屏（仅完整特效档）
  useEffect(() => {
    if (!lastEffect || effects !== 'full') return;
    const cat = effectCategory(lastEffect.type);
    if (cat !== 'bomb' && cat !== 'rocket') return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 500);
    return () => clearTimeout(t);
  }, [lastEffect, effects]);

  function toggleCard(card: number) {
    setSelected((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));
    setHint([]);
  }

  function humanBid(score: number) {
    if (!game) return;
    setGame(bid(game, { player: HUMAN_SEAT, type: 'bid', score }));
    setSelected([]);
    setHint([]);
  }

  function humanPassBid() {
    if (!game) return;
    setGame(bid(game, { player: HUMAN_SEAT, type: 'pass' }));
  }

  function humanPlay() {
    if (!game) return;
    if (selected.length === 0) {
      setMessage('请先选牌');
      return;
    }
    const validation = isValidPlay(selected, game.lastPlay ? game.lastPlay.analysis : null, game.mode);
    if (!validation.valid) {
      setMessage('这手牌不符合出牌规则');
      return;
    }
    setGame(play(game, { player: HUMAN_SEAT, cards: selected }));
    setSelected([]);
    setHint([]);
    setMessage('');
  }

  function humanPass() {
    if (!game) return;
    if (game.lastPlay === null) {
      setMessage('首出时不能不出');
      return;
    }
    setGame(pass(game, { player: HUMAN_SEAT }));
    setSelected([]);
    setHint([]);
  }

  function humanHint() {
    if (!game) return;
    // 推荐禁用随机失误：提示始终给出最优建议
    const dec = decidePlay(buildAiView(game, HUMAN_SEAT), difficulty, { mistakeRate: 0 });
    if (dec.action === 'play') {
      setSelected(dec.cards);
      setHint(dec.cards);
      setMessage(`推荐：${typeLabel(analyzeHand(dec.cards, game.mode).type)}`);
    } else {
      setSelected([]);
      setHint([]);
      setMessage('建议不出');
    }
  }

  if (screen === 'settings' || !game) {
    return (
      <SettingsScreen
        mode={mode}
        difficulty={difficulty}
        effects={effects}
        source={source}
        llm={llm}
        onMode={setMode}
        onDifficulty={setDifficulty}
        onEffects={setEffects}
        onSource={setSource}
        onLlm={setLlm}
        onStart={startGame}
      />
    );
  }

  const trickActions = currentTrickActions(game);
  const myTurn = game.phase !== 'settled' && game.currentPlayer === HUMAN_SEAT;
  const canPass = game.phase === 'playing' && game.lastPlay !== null;
  const humanIsLandlord = game.landlord === HUMAN_SEAT;

  // 叫分结果（每人最近一次动作）：叫 X 分 / 不叫
  const bidLabel = new Map<number, string>();
  for (const b of game.bids) {
    bidLabel.set(b.player, b.type === 'bid' ? `叫 ${b.score} 分` : '不叫');
  }
  const lastPlayer = game.lastPlay?.player;
  // 最近一次动作是「过牌」时，在中央给出「不出」提示
  const lastEntry = game.log[game.log.length - 1];
  const lastPassPlayer =
    game.phase === 'playing' && lastEntry && lastEntry.kind === 'pass' ? lastEntry.player : null;

  const opponents: ReactNode[] = [];
  for (let s = 0; s < game.mode.players; s++) {
    if (s === HUMAN_SEAT) continue;
    opponents.push(
      <OpponentSeat
        key={s}
        name={`玩家${s + 1}`}
        cardCount={game.players[s].hand.length}
        isLandlord={game.landlord === s}
        isCurrent={game.currentPlayer === s && game.phase !== 'settled'}
        position={seatPosition(s, game.mode.players)}
        lastAction={latestActionOf(trickActions, s)}
        bid={bidLabel.get(s)}
        highlight={s === lastPlayer}
      />,
    );
  }

  return (
    <div className={`table ${shaking ? 'shake' : ''}`} key={String(game.seed)}>
      <div className="table-controls">
        <button className="btn btn-danger" onClick={backToSettings}>
          退出牌桌
        </button>
        <button className="btn btn-redeal" onClick={restart}>
          重新发牌
        </button>
      </div>

      {opponents}

      <div className={`human-info ${lastPlayer === HUMAN_SEAT ? 'played' : ''}`}>
        {game.phase === 'bidding' && (
          <div className="bid-summary">
            {game.highestBidder >= 0 ? `当前最高：${game.highestBid} 分 · 玩家 ${game.highestBidder + 1}` : '当前无人叫分'}
          </div>
        )}
        <div className={`seat-info ${myTurn ? 'current' : ''}`}>
          <span>玩家1</span>
          <span className={`role-badge ${humanIsLandlord ? 'landlord' : 'farmer'}`}>
            {humanIsLandlord ? '地主' : '农民'}
          </span>
        </div>
        {bidLabel.get(HUMAN_SEAT) !== undefined && <div className="bid-badge">{bidLabel.get(HUMAN_SEAT)}</div>}
      </div>

      <PlayArea
        lastPlay={game.lastPlay}
        bottom={game.bottom}
        bottomRevealed={game.landlord !== -1}
        playNonce={lastEffect?.nonce ?? 0}
      />

      <div className="hand-wrap">
        <Hand
          cards={game.players[HUMAN_SEAT].hand}
          selected={selected}
          hint={hint}
          enabled={myTurn && game.phase === 'playing'}
          onToggle={toggleCard}
        />
      </div>

      <ActionBar
        phase={game.phase}
        isMyTurn={myTurn}
        canPass={canPass}
        highestBid={game.highestBid}
        onBid={humanBid}
        onPassBid={humanPassBid}
        onPlay={humanPlay}
        onPass={humanPass}
        onHint={humanHint}
      />

      {game.phase !== 'settled' && game.currentPlayer !== HUMAN_SEAT && (
        <div className="turn-timer">
          <span>停留</span>
          <span className="turn-timer-seconds">{countdown}</span>
          <span>秒</span>
        </div>
      )}
      {lastPassPlayer !== null && <div className="pass-hint">玩家{lastPassPlayer + 1} · 不出</div>}
      {message && <div className="message">{message}</div>}
      {lastEffect && <PlayEffect type={lastEffect.type} level={effects} nonce={lastEffect.nonce} />}
      {game.phase === 'settled' && (
        <ResultOverlay state={game} humanSeat={HUMAN_SEAT} onRestart={restart} onSettings={backToSettings} />
      )}
    </div>
  );
}
