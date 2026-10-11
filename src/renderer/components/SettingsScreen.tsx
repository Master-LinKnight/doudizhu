import { useState } from 'react';
import type { ModeConfig } from '../../game/types.js';
import { THREE_PLAYER, FOUR_PLAYER } from '../../game/types.js';
import type { Difficulty } from '../../game/ai/provider.js';
import { DIFFICULTIES } from '../../game/ai/provider.js';
import { testLlmConnection, type AiSource, type LlmConfig } from '../../game/ai/llmProvider.js';
import { EFFECTS_LEVELS, type EffectsLevel } from '../ui.js';

interface SettingsScreenProps {
  mode: ModeConfig;
  difficulty: Difficulty;
  effects: EffectsLevel;
  source: AiSource;
  llm: LlmConfig;
  onMode: (m: ModeConfig) => void;
  onDifficulty: (d: Difficulty) => void;
  onEffects: (e: EffectsLevel) => void;
  onSource: (s: AiSource) => void;
  onLlm: (l: LlmConfig) => void;
  onStart: () => void;
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: '简单', normal: '普通', hard: '困难' };

export function SettingsScreen({
  mode,
  difficulty,
  effects,
  source,
  llm,
  onMode,
  onDifficulty,
  onEffects,
  onSource,
  onLlm,
  onStart,
}: SettingsScreenProps) {
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestStatus(null);
    const res = await testLlmConnection(llm);
    setTestStatus({ ok: res.ok, message: res.message });
    setTesting(false);
  }

  return (
    <div className="settings">
      <div className="settings-card">
        <div className="settings-title">
          <h1>斗地主</h1>
          <span className="seal">斗</span>
        </div>
        <p className="subtitle">绝对公平 · 三档 AI · 三人 / 四人两副牌</p>

        <div className="field">
          <label>游戏模式</label>
          <div className="option-row">
            <button className={`option ${mode.id === 'three' ? 'active' : ''}`} onClick={() => onMode(THREE_PLAYER)}>
              三人 · 一副牌
            </button>
            <button className={`option ${mode.id === 'four' ? 'active' : ''}`} onClick={() => onMode(FOUR_PLAYER)}>
              四人 · 两副牌
            </button>
          </div>
        </div>

        <div className="field">
          <label>AI 难度（也决定「提示」推荐质量）</label>
          <div className="option-row">
            {DIFFICULTIES.map((d) => (
              <button key={d} className={`option ${difficulty === d ? 'active' : ''}`} onClick={() => onDifficulty(d)}>
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>牌型特效</label>
          <div className="option-row">
            {EFFECTS_LEVELS.map((e) => (
              <button key={e.value} className={`option ${effects === e.value ? 'active' : ''}`} onClick={() => onEffects(e.value)}>
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>AI 来源</label>
          <div className="option-row">
            <button className={`option ${source === 'rule' ? 'active' : ''}`} onClick={() => onSource('rule')}>
              本地算法
            </button>
            <button className={`option ${source === 'llm' ? 'active' : ''}`} onClick={() => onSource('llm')}>
              接入 LLM
            </button>
          </div>
        </div>

        {source === 'llm' && (
          <div className="field llm-config">
            <label>API 地址（base URL）</label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={llm.baseUrl}
              onChange={(e) => onLlm({ ...llm, baseUrl: e.target.value })}
            />
            <label>模型名</label>
            <input
              type="text"
              placeholder="gpt-4o-mini / qwen2.5 / deepseek-flash"
              value={llm.model}
              onChange={(e) => onLlm({ ...llm, model: e.target.value })}
            />
            <label>API Key（本地服务可留空）</label>
            <input
              type="password"
              placeholder="sk-…"
              value={llm.apiKey}
              onChange={(e) => onLlm({ ...llm, apiKey: e.target.value })}
            />
            <button className="btn btn-test" onClick={handleTest} disabled={testing}>
              {testing ? '测试中…' : '测试连通性'}
            </button>
            {testStatus && (
              <p className={`test-status ${testStatus.ok ? 'ok' : 'fail'}`}>{testStatus.message}</p>
            )}
            <p className="hint">
              未填或调用失败（网络异常 / 超时 / 非法输出）时将自动回退到本地算法，对局不中断。
              配置会保存在本机（含明文 API Key），下次进入自动恢复。
            </p>
          </div>
        )}

        <button className="start-btn" onClick={onStart}>
          开始游戏
        </button>
      </div>
    </div>
  );
}
