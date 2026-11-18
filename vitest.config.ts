import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests cover the platform-independent core (shared by web and mobile).
export default defineConfig({
  resolve: {
    alias: { '@dmm/core': path.resolve(import.meta.dirname, 'packages/core/src') },
  },
  test: {
    include: ['packages/core/src/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['packages/core/src/**'], exclude: ['**/*.test.ts', '**/seedData.ts'] },
  },
});
