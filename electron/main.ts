// electron/main.ts — Electron 主进程（ESM，兼容 package.json 的 "type": "module"）
//
// 运行方式（需先完成 electron 二进制下载）：
//   npm run build && npm run build:electron && electron .
// 开发时若 Vite dev server 已启动，可设置 VITE_DEV_SERVER_URL 指向它（默认加载 dist 产物）。

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#155a37',
    webPreferences: {
      // 纯本地单机游戏，渲染层不访问 Node；安全默认开启隔离与沙箱
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
