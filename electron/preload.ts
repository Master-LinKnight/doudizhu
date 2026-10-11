// electron/preload.ts — 预加载脚本占位
//
// 本作是纯本地单机游戏，渲染层不需要 Node/Electron 能力，主进程当前不挂载 preload。
// 若后续需要 IPC（本地存档、系统菜单、退出确认等），在此通过 contextBridge 暴露最小接口，
// 再在 main.ts 的 webPreferences.preload 中挂载（注意 Electron 对 ESM preload 需 .mjs 扩展名）。
export {};
