import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', FINUP_TODAY: '2026-10-30' },
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
