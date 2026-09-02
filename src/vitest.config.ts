import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests only. e2e/ holds Playwright specs, which import
    // @playwright/test and throw if a non-Playwright runner collects them.
    include: ['src/**/*.test.ts'],
  },
})
