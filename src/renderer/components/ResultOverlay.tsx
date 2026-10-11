import type { GameState } from '../../game/engine.js';

interface ResultOverlayProps {
  state: GameState;
  humanSeat: number;
  onRestart: () => void;
  onSettings: () => void;
}

export function ResultOverlay({ state, humanSeat, onRestart, onSettings }: ResultOverlayProps) {
  const landlordWon = state.landlordWon;
  const humanIsLandlord = state.landlord === humanSeat;
  const humanWon = (humanIsLandlord && landlordWon) || (!humanIsLandlord && !landlordWon);

  const tags: string[] = [];
  if (state.spring) tags.push('春天');
  if (state.antiSpring) tags.push('反春天');
  if (state.bombsPlayed > 0) tags.push(`炸弹 ×${state.bombsPlayed}`);
  if (state.rocketsPlayed > 0) tags.push(`火箭 ×${state.rocketsPlayed}`);

  return (
    <div className="result-overlay">
      <div className="result-card">
        <h2>{humanWon ? '🎉 你赢了' : '😞 你输了'}</h2>
        <div className="play-meta" style={{ display: 'inline-block', marginBottom: 14 }}>
          {landlordWon ? '地主胜' : '农民胜'} · 底分 {state.highestBid} · 倍数 ×{state.multiplier}
          {tags.length > 0 && ` · ${tags.join(' · ')}`}
        </div>
        <div className="result-lines">
          {state.players.map((p, i) => (
            <div key={i} className="score-row">
              <span className={i === humanSeat ? 'you' : ''}>
                {i === humanSeat ? '你' : `玩家 ${i + 1}`}
                {i === state.landlord ? '（地主）' : ''}
              </span>
              <span className={i === humanSeat ? 'you' : ''}>
                {state.scores[i] > 0 ? '+' : ''}
                {state.scores[i]}
              </span>
            </div>
          ))}
        </div>
        <div className="result-actions">
          <button className="btn btn-play" onClick={onRestart}>
            再来一局
          </button>
          <button className="btn btn-pass" onClick={onSettings}>
            返回设置
          </button>
        </div>
      </div>
    </div>
  );
}
