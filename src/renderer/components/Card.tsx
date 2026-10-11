import { rankOf, suitOf, rankLabel, SUIT_SYMBOLS } from '../../game/deck.js';
import cardBack from '../assets/cards/card-back.png';
import cardFront from '../assets/cards/card-front-template.png';
import jokerSmall from '../assets/cards/joker-small.png';
import jokerBig from '../assets/cards/joker-big.png';

export interface CardProps {
  card: number;
  faceDown?: boolean;
  selected?: boolean;
  hinted?: boolean;
  mini?: boolean;
  bomb?: boolean;
  anim?: 'deal' | 'play';
  delayMs?: number;
  onClick?: () => void;
}

export function Card({
  card,
  faceDown,
  selected,
  hinted,
  mini,
  bomb,
  anim,
  delayMs,
  onClick,
}: CardProps) {
  const rank = rankOf(card);
  const suit = suitOf(card);
  const isJoker = rank >= 16;
  const red = suit === 1 || suit === 3 || isJoker; // ♥ / ♦ 为红色
  const label = rankLabel(rank);
  // 花色用 Unicode 文字（牌面花色图资产为空，之前中心花色因此不可见）；
  // 追加 ︎ 强制文本渲染，避免 ♥/♦ 被浏览器显示成彩色 emoji，从而套用 .card.red/.black 的颜色。
  const suitSymbol = isJoker ? '' : SUIT_SYMBOLS[suit] + '︎';

  const cls = [
    'card',
    red ? 'red' : 'black',
    faceDown ? 'face-down' : '',
    selected ? 'selected' : '',
    hinted ? 'hinted' : '',
    mini ? 'mini' : '',
    bomb ? 'bomb' : '',
    anim === 'deal' ? 'deal-in' : anim === 'play' ? 'play-in' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // 背面用牌背；大小王用小王/大王牌面；普通牌用牌面模板底图 + 角标/中心花色文字
  const faceImage = faceDown ? cardBack : isJoker ? (rank === 16 ? jokerSmall : jokerBig) : cardFront;

  return (
    <div
      className={cls}
      onClick={onClick}
      style={{
        backgroundImage: `url(${faceImage})`,
        backgroundSize: 'cover',
        animationDelay: delayMs != null ? `${delayMs}ms` : undefined,
      }}
    >
      {!faceDown && !isJoker && (
        <>
          <div className="corner tl">
            <span className="rank">{label}</span>
          </div>
          <div className="center-suit">
            <span className="suit">{suitSymbol}</span>
          </div>
          <div className="corner br">
            <span className="rank">{label}</span>
          </div>
        </>
      )}
      {bomb && !faceDown && <span className="bomb-icon">💣</span>}
    </div>
  );
}
