import type { SeatPosition, SeatAction } from '../ui.js';
import { Card } from './Card.js';

interface OpponentSeatProps {
  name: string;
  cardCount: number;
  isLandlord: boolean;
  isCurrent: boolean;
  position: SeatPosition;
  /** 该座位当前这一手的最新动作：出牌（显示牌）或不出（显示「不出」） */
  lastAction: SeatAction | null;
  /** 叫分阶段该座位当前动作：叫 X 分 / 不叫（未行动时为 undefined） */
  bid?: string;
  /** 是否上一手出牌者（高亮显示） */
  highlight?: boolean;
}

export function OpponentSeat({
  name,
  cardCount,
  isLandlord,
  isCurrent,
  position,
  lastAction,
  bid,
  highlight,
}: OpponentSeatProps) {
  const backs = Math.min(cardCount, 15);
  return (
    <div className={`seat ${position} ${highlight ? 'played' : ''}`}>
      {isCurrent && <div className={`turn-arrow ${position === 'top' ? 'up' : position}`} aria-hidden />}
      <div className={`avatar ${isLandlord ? 'landlord' : 'farmer'} ${isCurrent ? 'current' : ''}`}>
        {isLandlord ? '地' : '农'}
      </div>
      <div className="seat-name">{name}</div>
      {bid !== undefined && <div className="bid-badge">{bid}</div>}
      <div className="seat-cards">
        {Array.from({ length: backs }, (_, i) => (
          <Card key={i} card={0} faceDown mini />
        ))}
      </div>
      <div className="seat-count">剩 {cardCount} 张</div>
      <div className="seat-lastplay">
        {lastAction?.kind === 'play' && (
          <span className="mini">
            {lastAction.cards.slice(0, 6).map((c, i) => (
              <Card key={`${c}-${i}`} card={c} mini anim="play" delayMs={i * 20} />
            ))}
            {lastAction.cards.length > 6 && <span className="seat-count">+{lastAction.cards.length - 6}</span>}
          </span>
        )}
        {lastAction?.kind === 'pass' && <span className="seat-pass">不出</span>}
      </div>
    </div>
  );
}
