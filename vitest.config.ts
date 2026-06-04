import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Mirror the vite.config.ts define so tests see the same global.
    __APP_VERSION__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Only run the app's own tests. Without this, vitest's default glob also
    // sweeps test files inside leftover git worktrees under .claude/worktrees/
    // — those resolve a SECOND react/react-dom from the worktree's own
    // node_modules and fail with useContext-null "two Reacts" errors (773
    // phantom failures observed 2026-06-03). CI never sees this (clean
    // checkouts), so the breakage is local-only and easy to misread as real.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
