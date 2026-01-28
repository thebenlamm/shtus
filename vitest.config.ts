import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Single-threaded to avoid race conditions in WebSocket tests
    sequence: {
      concurrent: false,
    },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000,
  },
});
