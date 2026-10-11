// storage.ts — 设置持久化（localStorage）。仅持久化「AI 来源 + LLM 配置」，下次进入自动恢复。
//
// 注意：localStorage 为明文存储，apiKey 会以明文保存在本机；桌面本地使用可接受，
//       设置页有相应提示。

import type { AiSource, LlmConfig } from '../game/ai/llmProvider.js';

const KEY = 'doudizhu.settings.v1';

export interface PersistedSettings {
  source: AiSource;
  llm: LlmConfig;
}

/** 读取持久化设置；无记录 / 解析失败时返回 null（静默兜底） */
export function loadPersisted(): PersistedSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<PersistedSettings>;
    if (typeof obj !== 'object' || obj === null) return null;
    const source = obj.source === 'llm' ? 'llm' : 'rule';
    const llm = obj.llm;
    if (typeof llm !== 'object' || llm === null) return null;
    return {
      source,
      llm: {
        baseUrl: typeof llm.baseUrl === 'string' ? llm.baseUrl : '',
        apiKey: typeof llm.apiKey === 'string' ? llm.apiKey : '',
        model: typeof llm.model === 'string' ? llm.model : '',
        ...(typeof llm.timeoutMs === 'number' ? { timeoutMs: llm.timeoutMs } : {}),
      },
    };
  } catch {
    return null;
  }
}

/** 写入持久化设置；失败静默（隐私模式 / 配额满不影响游戏） */
export function savePersisted(settings: PersistedSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 忽略写入失败
  }
}
