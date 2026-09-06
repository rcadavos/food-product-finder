import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest transforms TSX with esbuild; the React plugin is only needed for
  // Fast Refresh, which tests do not use. Skipping it also keeps a single Vite
  // version in the tree.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
