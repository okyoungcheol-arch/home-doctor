import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Worktrees under .claude/worktrees/** have their own node_modules; without this
    // exclude, vitest run from the repo root also picks up their test files and resolves
    // imports against a second copy of the same packages (e.g. drizzle-orm), which
    // breaks module-identity checks like `server-only`.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
