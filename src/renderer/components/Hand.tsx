import { Card } from './Card.js';
import { rankOf } from '../../game/deck.js';

interface HandProps {
  cards: number[];
  selected: number[];
  hint: number[];
  enabled: boolean;
  onToggle: (card: number) => void;
}

export function Hand({ cards, selected, hint, enabled, onToggle }: HandProps) {
  // 手牌中同点数张数 ≥4 视为「含炸弹」，给对应牌加框 + 提示图标
  const counts = new Map<number, number>();
  for (const c of cards) {
    const r = rankOf(c);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const bombRanks = new Set<number>();
  for (const [r, n] of counts) if (n >= 4) bombRanks.add(r);

  // 稳定 key：牌值 + 同值序数（出牌后其余牌不重挂载，避免重播发牌动画）
  const seen = new Map<number, number>();
  const keyFor = (card: number): string => {
    const n = seen.get(card) ?? 0;
    seen.set(card, n + 1);
    return `${card}:${n}`;
  };

  return (
    <div className="hand">
      {cards.map((card, i) => (
        <Card
          key={keyFor(card)}
          card={card}
          selected={selected.includes(card)}
          hinted={hint.includes(card)}
          bomb={bombRanks.has(rankOf(card))}
          anim="deal"
          delayMs={i * 30}
          onClick={enabled ? () => onToggle(card) : undefined}
        />
      ))}
    </div>
  );
}
