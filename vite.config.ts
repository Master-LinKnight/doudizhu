import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 渲染进程（React）开发/构建配置；规则引擎 src/game/ 无 UI 依赖，可独立于 Vite 测试
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
