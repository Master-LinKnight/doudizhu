import type { Card as CardId } from '../../game/types.js';
import type { Play } from '../../game/engine.js';
import { typeLabel } from '../ui.js';
import { Card } from './Card.js';

interface PlayAreaProps {
  lastPlay: Play | null;
  bottom: CardId[];
  bottomRevealed: boolean;
  /** 每次出牌递增，用于重放出牌飞入动画 */
  playNonce?: number;
}

export function PlayArea({ lastPlay, bottom, bottomRevealed, playNonce }: PlayAreaProps) {
  return (
    <>
      <div className="bottom-cards-corner">
        {bottom.length === 0 ? (
          <span className="seat-count">底牌已并入手牌</span>
        ) : (
          <>
            <span className="bottom-label">底牌</span>
            <div className="bottom-cards">
              {bottom.map((c, i) => (
                <Card key={`${c}-${i}`} card={c} faceDown={!bottomRevealed} mini />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="play-area">
        <div className="play-cards" key={playNonce ?? 0}>
          {lastPlay
            ? lastPlay.cards.map((c, i) => (
                <Card key={`${c}-${i}`} card={c} mini anim="play" delayMs={i * 20} />
              ))
            : null}
        </div>
        {lastPlay && (
          <div className="play-meta">
            玩家 {lastPlay.player + 1} · {typeLabel(lastPlay.analysis.type)}
          </div>
        )}
      </div>
    </>
  );
}
