import { defineConfig } from 'vitest/config';

// 规则引擎为纯函数、无 DOM 依赖，测试环境用 node 即可
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
