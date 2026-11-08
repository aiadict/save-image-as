import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright suite in e2e/ runs separately (npm run e2e).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
