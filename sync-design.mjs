#!/usr/bin/env node
// sync-design.mjs — 把 Pencil 设计稿中的「设计变量（配色 + 字体）」抽取为 CSS 变量，
// 写入 src/renderer/styles/design-tokens.css，由 game.css @import 使用。
// 改设计稿里的颜色/字体变量后重跑一次，游戏 UI 即换肤。
//
// 用法：
//   npm run sync-design
//   node sync-design.mjs --pen <设计稿.pen> --out <css 路径>
//
// 依赖：@pen.dev/cli（首次需 `npx pen login` 登录 pen.dev）。

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);

// 设计稿变量名 → 生成的 CSS 变量名
// 注：ink-wood 而非 ink —— 设计稿原有 ink=#1B1B1B（原绿呢主题），勿覆盖。
const COLOR_VARS = {
  'wood': 'wood', 'wood-mid': 'wood-mid', 'wood-dark': 'wood-dark',
  'red': 'red', 'red-deep': 'red-deep', 'gold': 'gold', 'gold-light': 'gold-light',
  'cream': 'cream', 'ink-wood': 'ink', 'ink-gray': 'ink-gray', 'panel-dark': 'panel-dark',
  'blue': 'blue', 'gray': 'gray', 'farmer-blue': 'farmer-blue',
};

// 字体变量 → CSS 变量 + 系统回退栈
const FONT_VARS = {
  'font-serif': { css: '--serif', fallbacks: "'Songti SC', 'STSong', 'SimSun', serif" },
  'font-kai': { css: '--kai', fallbacks: "'Kaiti SC', 'STKaiti', 'KaiTi', cursive" },
};

function parseArgs(argv) {
  const a = {
    pen: path.join(ROOT, '斗地主.pen'),
    out: path.join(ROOT, 'src/renderer/styles/design-tokens.css'),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pen') a.pen = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

function runPen(penPath, commands) {
  const penBin = path.join(ROOT, 'node_modules', '.bin', 'pen');
  // -o /dev/null：只读同步，不把源 .pen 回写（避免加载字体失败时改写设计稿）
  const res = spawnSync(penBin, ['interactive', '-i', penPath, '-o', '/dev/null'], {
    input: commands.join('\n') + '\n',
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw new Error(`无法启动 pen CLI：${res.error.message}（请确认已 \`npx pen login\` 登录）`);
  if (res.status !== 0) throw new Error(`pen CLI 退出异常（${res.status}）：${res.stderr ?? ''}`);
  return res.stdout ?? '';
}

function main() {
  const { pen, out } = parseArgs(process.argv.slice(2));
  const cmd = "execute({ input: 'Print(\"TOKENS\\t\" + JSON.stringify(GetVariables()))' })";
  const raw = runPen(pen, [cmd, 'exit()']);

  const line = raw.split('\n').find((l) => l.startsWith('TOKENS\t'));
  if (!line) throw new Error('未能从设计稿读取变量（请先在 Pencil 中定义配色/字体变量）');
  const vars = JSON.parse(line.slice('TOKENS\t'.length)).variables ?? {};

  const lines = [':root {'];
  for (const [src, css] of Object.entries(COLOR_VARS)) {
    const def = vars[src];
    if (def && def.type === 'color') lines.push(`  --${css}: ${def.value};`);
  }
  for (const [src, { css, fallbacks }] of Object.entries(FONT_VARS)) {
    const def = vars[src];
    if (def && def.type === 'string') lines.push(`  ${css}: '${def.value}', ${fallbacks};`);
  }
  lines.push('}');

  writeFileSync(out, `/* 由 sync-design.mjs 生成 —— 勿手改；改 Pencil 设计稿变量后重跑 npm run sync-design */\n${lines.join('\n')}\n`);
  process.stdout.write(`已写入 ${path.relative(ROOT, out)}（${lines.length - 2} 个变量）\n`);
}

main();
