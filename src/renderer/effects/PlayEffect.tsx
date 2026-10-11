import type { CardType } from '../../game/types.js';
import { effectCategory, typeLabel, type EffectCategory, type EffectsLevel } from '../ui.js';

interface PlayEffectProps {
  type: CardType | null;
  level: EffectsLevel;
  nonce: number;
  /** 父级是否要抖屏（炸弹/火箭，full 档） */
  onShake?: boolean;
}

export function PlayEffect({ type, level, nonce, onShake }: PlayEffectProps) {
  if (level === 'off' || !type) return null;
  const cat: EffectCategory = effectCategory(type);
  const label = typeLabel(type);

  return (
    <div className="fx" key={nonce}>
      {cat === 'bomb' && <div className="fx-flash" />}
      {cat === 'rocket' && <div className="fx-flash" />}
      {cat === 'rocket' && <div className="fx-rocket">🚀</div>}
      {(cat === 'combo' || cat === 'bomb' || cat === 'rocket') && (
        <>
          <div className={`fx-banner ${cat === 'combo' ? 'combo' : ''}`}>{label}</div>
          {cat === 'combo' && <div className="fx-sweep" />}
        </>
      )}
      {onShake && <div />}
    </div>
  );
}
