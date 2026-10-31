import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs: one build serves from /, /<repo>/ on Pages, or any static host.
  base: './',
  server: { host: true, port: 5173 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
