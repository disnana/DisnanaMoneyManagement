import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Mobile library tests stub the native APIs used by device preferences.
export default defineConfig({
  // These Node tests also run in a web-only install, without Expo's base tsconfig.
  tsconfig: './tsconfig.json',
  resolve: {
    alias: { '@dmm/core': path.resolve(import.meta.dirname, 'packages/core/src') },
  },
  test: {
    include: ['packages/core/src/**/*.test.ts', 'apps/mobile/src/lib/**/*.test.mjs'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/core/src/**'], exclude: ['**/*.test.ts', '**/seedData.ts'] },
  },
});
