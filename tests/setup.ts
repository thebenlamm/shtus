import { vi, beforeEach, afterEach } from "vitest";

// Polyfill crypto for Node.js if not available
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { webcrypto } = require("crypto");
  globalThis.crypto = webcrypto;
}

// Clean up mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
