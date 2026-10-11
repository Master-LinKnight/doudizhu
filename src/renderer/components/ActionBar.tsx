import type { GamePhase } from '../../game/engine.js';

interface ActionBarProps {
  phase: GamePhase;
  isMyTurn: boolean;
  canPass: boolean;
  highestBid: number;
  onBid: (score: number) => void;
  onPassBid: () => void;
  onPlay: () => void;
  onPass: () => void;
  onHint: () => void;
}

export function ActionBar(props: ActionBarProps) {
  const { phase, isMyTurn, canPass, highestBid, onBid, onPassBid, onPlay, onPass, onHint } = props;

  if (phase === 'bidding') {
    return (
      <div className="action-bar">
        <div className="action-bar-buttons">
          {[1, 2, 3].map((s) => (
            <button key={s} className="btn btn-bid" disabled={!isMyTurn || s <= highestBid} onClick={() => onBid(s)}>
              叫 {s} 分
            </button>
          ))}
          <button className="btn btn-pass" disabled={!isMyTurn} onClick={onPassBid}>
            不叫
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="action-bar">
      <div className="action-bar-buttons">
        <button className="btn btn-hint" disabled={!isMyTurn} onClick={onHint}>
          提示
        </button>
        <button className="btn btn-pass" disabled={!isMyTurn || !canPass} onClick={onPass}>
          不出
        </button>
        <button className="btn btn-play" disabled={!isMyTurn} onClick={onPlay}>
          出牌
        </button>
      </div>
    </div>
  );
}
