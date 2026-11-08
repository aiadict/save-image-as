import { defineConfig } from "@playwright/test";

// Run with `npm run e2e` (builds dist-e2e/ first). One worker: every test
// shares one browser profile and the extension's storage.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [["list"]],
  outputDir: "../test-results",
});
