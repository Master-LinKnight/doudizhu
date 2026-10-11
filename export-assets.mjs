#!/usr/bin/env node
// export-assets.mjs — 从 Pencil 设计稿按节点名批量导出 2× PNG，并按《规格书》第 8 节命名落盘。
//
// 背景：.pen 为加密格式，导出必须经 pen.dev 引擎，故本脚本通过 `pen interactive` 无头模式
//       调用 execute 的 Export 操作；随后把 <节点ID>.png 重命名并搬入 src/renderer/assets/。
//
// 用法：
//   node export-assets.mjs --pen <设计稿.pen>                       # 常规：经 pen CLI 导出
//   node export-assets.mjs --input-dir <已导出目录> --id-map <map>   # 复用已导出文件，仅重命名
//   node export-assets.mjs --dry-run                                 # 打印映射表，不落盘
//
// 依赖：@pen.dev/cli（`pen` 需在 PATH 中，且已 `pen login` 登录 pen.dev）。

import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);

// —— 节点名 → 相对 assets 根的落盘路径（规格书第 8 节：小写 + 连字符；cards / suits / ui 子目录）——
const TARGETS = [
  ['card-back', 'cards/card-back.png'],
  ['card-front-template', 'cards/card-front-template.png'],
  ['joker-small', 'cards/joker-small.png'],
  ['joker-big', 'cards/joker-big.png'],
  ['table-bg', 'ui/table-bg.png'],
  ['suit-spade', 'suits/suit-spade.png'],
  ['suit-heart', 'suits/suit-heart.png'],
  ['suit-club', 'suits/suit-club.png'],
  ['suit-diamond', 'suits/suit-diamond.png'],
];

const SCALE = 2;
const FORMAT = 'png';

function usage() {
  process.stderr.write('用法见文件头注释：--pen / --input-dir --id-map / --dry-run\n');
  process.exit(2);
}

function parseArgs(argv) {
  const args = { pen: null, inputDir: null, idMap: null, assetsDir: path.join(ROOT, 'src/renderer/assets'), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pen') args.pen = argv[++i];
    else if (a === '--input-dir') args.inputDir = argv[++i];
    else if (a === '--id-map') args.idMap = argv[++i];
    else if (a === '--assets-dir') args.assetsDir = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '-h' || a === '--help') usage();
    else { process.stderr.write(`未知参数：${a}\n`); usage(); }
  }
  return args;
}

/** 无头调用 pen interactive，把若干条 shell 命令通过 stdin 送入，返回 stdout */
function runPen(penPath, commands) {
  const res = spawnSync('pen', ['interactive', '-i', penPath, '-o', penPath], {
    input: commands.join('\n') + '\n',
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw new Error(`无法启动 pen CLI：${res.error.message}（请确认已安装 @pen.dev/cli 且 \`pen\` 在 PATH）`);
  return res.stdout ?? '';
}

/** 列出全部节点 id 与 name（Print 用固定前缀 NODE\t 便于解析） */
function listNodes(penPath) {
  const cmd = "execute({ input: 'Get((n,c)=>{Print(\"NODE\\t\"+n.id+\"\\t\"+n.name)})' })";
  const out = runPen(penPath, [cmd, 'exit()']);
  const nodes = new Map();
  for (const line of out.split('\n')) {
    if (!line.startsWith('NODE\t')) continue;
    const [, id, name] = line.split('\t');
    if (id && name !== undefined) nodes.set(name.trim(), id.trim());
  }
  return nodes; // name -> id
}

/** 匹配目标节点，得到 [节点ID, 落盘相对路径][]；缺失的打印警告 */
function resolveTargets(nameToId, targets) {
  const missing = [];
  const idToDest = [];
  for (const [name, dest] of targets) {
    const id = nameToId.get(name);
    if (!id) { missing.push(name); continue; }
    idToDest.push([id, dest]);
  }
  return { idToDest, missing };
}

/** 把 <tmp>/<id>.png 搬到 assets 下（同名覆盖） */
function placeFiles(tmpDir, idToDest, assetsDir, dryRun) {
  const moved = [];
  for (const [id, dest] of idToDest) {
    const src = path.join(tmpDir, `${id}.${FORMAT}`);
    if (!existsSync(src)) { process.stderr.write(`[跳过] 未找到导出文件 ${src}\n`); continue; }
    const target = path.join(assetsDir, dest);
    if (dryRun) { moved.push(dest); continue; }
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(src, target);
    moved.push(dest);
  }
  return moved;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const nameToDest = new Map(TARGETS);

  let idToDest;
  let tmpDir;

  if (args.inputDir) {
    // 复用已导出文件：需 id->name 映射（JSON：{ "<节点ID>": "<节点名>" }）
    if (!args.idMap) { process.stderr.write('--input-dir 需配合 --id-map <idToName.json>\n'); usage(); }
    const idToName = JSON.parse(readFileSync(args.idMap, 'utf8'));
    idToDest = [];
    for (const [id, name] of Object.entries(idToName)) {
      const dest = nameToDest.get(name);
      if (dest) idToDest.push([id, dest]);
    }
    tmpDir = args.inputDir;
  } else {
    if (!args.pen) { process.stderr.write('缺少 --pen <设计稿.pen>\n'); usage(); }
    if (!existsSync(args.pen)) { process.stderr.write(`设计稿不存在：${args.pen}\n`); process.exit(1); }
    const nameToId = listNodes(args.pen);
    const r = resolveTargets(nameToId, TARGETS);
    if (r.missing.length) process.stderr.write(`[警告] 未在设计稿中找到节点：${r.missing.join(', ')}\n`);
    idToDest = r.idToDest;
    tmpDir = path.join(ROOT, 'node_modules/.cache/ddz-assets-export');
    if (!args.dryRun && idToDest.length) {
      mkdirSync(tmpDir, { recursive: true });
      const ids = idToDest.map(([id]) => `"${id}"`).join(',');
      const cmd = `execute({ input: 'Export([${ids}], "${FORMAT}", "${tmpDir}", {scale:${SCALE}})' })`;
      runPen(args.pen, [cmd, 'exit()']);
    }
  }

  const moved = placeFiles(tmpDir, idToDest, args.assetsDir, args.dryRun);

  process.stdout.write(`\n共 ${moved.length} 个资产，落盘到 ${path.relative(ROOT, args.assetsDir)}：\n`);
  for (const d of moved) process.stdout.write(`  ${d}\n`);
  if (args.dryRun) process.stdout.write('（--dry-run 未实际写入）\n');
}

main();
