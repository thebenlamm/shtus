# Testing Patterns

**Analysis Date:** 2026-01-29

## Test Framework

**Runner:**
- Vitest 4.0.18 - Unit and integration tests
- Playwright 1.58.0 - End-to-end tests
- Config files: `vitest.config.ts`, `playwright.config.ts`

**Assertion Library:**
- Vitest's built-in expect (compatible with Jest): `expect(value).toBe()`, `expect(array).toHaveLength()`

**Run Commands:**
```bash
npm run test              # Run all unit and integration tests (vitest run)
npm run test:watch       # Watch mode (vitest)
npm run test:e2e         # Run end-to-end tests (playwright test)
npm run test:e2e:ui      # Playwright UI mode
npm run test:all         # Run both test suites (unit + e2e)
npm run test:ci          # CI mode: unit tests + e2e with GitHub reporter
```

## Test File Organization

**Location:**
- Unit and integration tests: `tests/unit/` and `tests/integration/`
- Edge case tests: `tests/edge-cases/`
- End-to-end tests: `tests/e2e/`
- Test utilities and fixtures: `tests/utils/`
- Setup file: `tests/setup.ts`

**Naming:**
- `.test.ts` suffix for Vitest tests: `sanitize.test.ts`, `timing-safe.test.ts`
- `.spec.ts` suffix for Playwright tests: `smoke.spec.ts`, `full-game.spec.ts`

**Structure:**
```
tests/
├── unit/
│   ├── sanitize.test.ts          # Input validation functions
│   ├── timing-safe.test.ts       # Cryptographic functions
│   └── validate-question.test.ts # Question validation
├── integration/
│   ├── game-flow.test.ts          # Full game lifecycle
│   ├── multiplayer-sync.test.ts   # WebSocket sync
│   ├── chat.test.ts               # Chat system
│   ├── prompt-generation.test.ts  # AI prompt generation
│   ├── scoring.test.ts            # Score calculation
│   ├── admin.test.ts              # Admin actions
│   ├── reconnection.test.ts       # Reconnect handling
│   └── full-game-scenarios.test.ts # Complex scenarios
├── edge-cases/
│   ├── input-validation.test.ts    # Edge case validation
│   ├── round-limits.test.ts        # Round limit edge cases
│   ├── host-transfer.test.ts       # Host disconnection
│   ├── voyeur-mode.test.ts         # Voyeur edge cases
│   └── stale-async.test.ts         # Async result staleness
├── e2e/
│   ├── smoke.spec.ts               # Basic functionality
│   ├── multiplayer-sync.spec.ts    # Browser multiplayer
│   ├── reconnection.spec.ts        # Browser reconnect
│   └── full-game.spec.ts           # Full game in browser
└── utils/
    ├── party-test-server.ts        # Mock PartyKit server
    ├── mock-player.ts              # Mock player client
    ├── game-simulator.ts           # Game state utilities
    └── mock-xai.ts                 # Mock xAI API
```

## Test Structure

**Vitest Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Feature Name", () => {
  let server: TestServer;
  let player: MockPlayer;

  beforeEach(() => {
    // Setup before each test
    server = createTestServer();
    player = createMockPlayer(server, "TestPlayer");
  });

  describe("Sub-feature", () => {
    it("should do something specific", () => {
      // Arrange
      const expected = "value";

      // Act
      const result = myFunction(input);

      // Assert
      expect(result).toBe(expected);
    });

    it("should handle edge case", async () => {
      // For async tests, return Promise or use async/await
      const result = await asyncFunction();
      expect(result).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("should throw on invalid input", () => {
      expect(() => myFunction(null)).toThrow();
    });
  });
});
```

**Patterns:**
- `describe` blocks group related tests
- Nested `describe` for sub-features and error cases
- `beforeEach` for setup; `afterEach` for cleanup (global setup in `tests/setup.ts`)
- Tests are run sequentially (not concurrent) to avoid race conditions in WebSocket tests:
  ```typescript
  // From vitest.config.ts
  sequence: {
    concurrent: false,
  },
  ```

## Mocking

**Framework:** Vitest's `vi` (equivalent to Jest's jest.mock)

**Patterns:**

### Mocking External APIs (fetch):
```typescript
it("answer submission broadcasts to all players", async () => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      choices: [{ message: { content: "Test prompt" } }],
    }))
  );

  // Test code...
});
```

### Mock Setup/Cleanup:
```typescript
// From tests/setup.ts
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

**What to Mock:**
- External APIs (xAI Grok API via fetch)
- Time-dependent functions (optional with fake timers)
- Random number generation (optional)

**What NOT to Mock:**
- PartyKit server behavior - use `MockConnection` and `MockRoom` instead
- Game logic - test actual implementation
- Player interactions - simulate via mock players
- localStorage - test actual behavior (with try/catch for unavailable storage)

### MockConnection & MockRoom:
Rather than mocking, tests use stub implementations:
```typescript
// From tests/utils/party-test-server.ts
export class MockConnection implements Party.Connection {
  messages: string[] = [];
  send(message: string): void { this.messages.push(message); }
  getAllMessages(): unknown[] {
    return this.messages.map((m) => JSON.parse(m));
  }
}

export class MockRoom implements Party.Room {
  connections: Map<string, MockConnection> = new Map();
  broadcast(message: string, without?: string[]): void {
    // Send to all connections (except those in `without`)
  }
}
```

## Fixtures and Factories

**Test Data:**

MockPlayer factory creates realistic test players:
```typescript
// From tests/utils/mock-player.ts
export function createMockPlayer(
  server: TestServer,
  name: string,
  playerId?: string,
  adminKey?: string
): MockPlayer {
  const id = playerId || crypto.randomUUID();
  let conn = server.joinPlayer(name, id, adminKey);

  return {
    conn,
    id,
    name,
    answer(text: string): void { server.sendMessage(conn, { type: "answer", answer: text }); },
    vote(answerId: number): void { server.sendMessage(conn, { type: "vote", votedFor: answerId }); },
    chat(text: string): void { server.sendMessage(conn, { type: "chat", text }); },
    toggleVoyeur(): void { server.sendMessage(conn, { type: "toggle-voyeur" }); },
    disconnect(): void { server.disconnect(id); },
    reconnect(): MockConnection { conn = server.joinPlayer(name, id); return conn; },
    // Admin actions
    setExactQuestion(question: string | null): void { /* ... */ },
    setPromptGuidance(guidance: string | null): void { /* ... */ },
    // Getters
    getLastState(): Record<string, unknown> | null { /* ... */ },
    getLastChatMessage(): Record<string, unknown> | null { /* ... */ },
    getAllStates(): Record<string, unknown>[] { /* ... */ },
  };
}
```

**Test Server Factory:**
```typescript
// From tests/utils/party-test-server.ts
export class TestServer {
  room: MockRoom;
  server: ShtusServer;

  constructor(roomId: string = "test-room", env: Record<string, string> = {}) {
    this.room = new MockRoom(roomId, env);
    this.server = new ShtusServer(this.room);
  }

  joinPlayer(name: string, playerId?: string, adminKey?: string): MockConnection {
    const id = playerId || crypto.randomUUID();
    const conn = this.room.addConnection(id);
    this.server.onConnect(conn);
    this.server.onMessage(conn, JSON.stringify({ type: "join", name, adminKey }));
    return conn;
  }

  sendMessage(conn: MockConnection, message: Record<string, unknown>): void {
    this.server.onMessage(conn, JSON.stringify(message));
  }

  getState(): unknown {
    return this.server.gameState;
  }

  async waitForGeneration(): Promise<void> {
    // Wait for async prompt generation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
```

**Location:**
- `tests/utils/party-test-server.ts` - MockConnection, MockRoom, TestServer
- `tests/utils/mock-player.ts` - MockPlayer factory and helper functions
- `tests/utils/game-simulator.ts` - Game state utilities
- `tests/utils/mock-xai.ts` - Mock xAI API responses

**Usage Pattern:**
```typescript
beforeEach(() => {
  server = createTestServer("test-room", {});
  host = createMockPlayer(server, "Host");
  player2 = createMockPlayer(server, "Player2");
  player3 = createMockPlayer(server, "Player3");
});

it("completes game flow", async () => {
  server.sendMessage(host.conn, { type: "start", theme: "test", roundLimit: 3 });
  await server.waitForGeneration();

  host.answer("Host answer");
  player2.answer("Player2 answer");
  player3.answer("Player3 answer");

  const state = server.getState() as GameState;
  expect(state.phase).toBe(PHASES.VOTING);
});
```

## Coverage

**Requirements:** Not enforced (no coverage config in vitest.config.ts)

**Current Coverage:** ~3,578 lines of test code across 18 test files

**View Coverage:**
```bash
# No coverage command configured; would need vitest --coverage
# Currently testing via: npm run test (runs vitest run)
```

## Test Types

**Unit Tests:**
- Scope: Individual functions in isolation
- Location: `tests/unit/`
- Examples:
  - `sanitize.test.ts` - input sanitization functions
  - `timing-safe.test.ts` - cryptographic comparison
  - `validate-question.test.ts` - question validation
- Approach: Direct function calls with mocked dependencies (e.g., mocked fetch for API tests)

**Integration Tests:**
- Scope: Multiple components working together (game logic, state sync, chat)
- Location: `tests/integration/`
- Examples:
  - `game-flow.test.ts` - full game lifecycle (LOBBY → WRITING → VOTING → REVEAL → FINAL)
  - `multiplayer-sync.test.ts` - state broadcast to all players
  - `prompt-generation.test.ts` - AI prompt generation with fallbacks
  - `scoring.test.ts` - score calculation across rounds
  - `chat.test.ts` - chat message handling
  - `admin.test.ts` - admin override functionality
  - `reconnection.test.ts` - player reconnection after disconnect
- Approach: Use MockRoom/MockConnection to simulate WebSocket communication; send realistic message sequences
- Server: TestServer instance simulates full PartyKit server

**Edge Case Tests:**
- Scope: Boundary conditions and error scenarios
- Location: `tests/edge-cases/`
- Examples:
  - `input-validation.test.ts` - name validation, truncation, duplicates
  - `round-limits.test.ts` - game end conditions with different round limits
  - `host-transfer.test.ts` - host disconnection and new host selection
  - `voyeur-mode.test.ts` - voyeur toggle and inactive player handling
  - `stale-async.test.ts` - async prompt results after game restart
- Approach: Target specific error conditions and boundary values

**E2E Tests:**
- Scope: Full application in real browser against real servers
- Location: `tests/e2e/`
- Framework: Playwright with Chrome
- Examples:
  - `smoke.spec.ts` - basic create/join game flow
  - `multiplayer-sync.spec.ts` - multiple browsers see same state
  - `reconnection.spec.ts` - browser disconnect/reconnect
  - `full-game.spec.ts` - 3 players complete 3 rounds to victory screen
- Approach: Real browser navigation, DOM selectors with `data-testid`, wait for phase transitions
- Servers: Starts both PartyKit (port 1999) and Next.js (port 3000) automatically

## E2E Test Patterns

**Page Creation:**
```typescript
async function createPlayer(
  context: BrowserContext,
  roomId: string,
  name: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/game/${roomId}?name=${encodeURIComponent(name)}`);
  return page;
}
```

**Phase Waiting:**
```typescript
async function waitForPhase(page: Page, phase: string, timeout = 15000) {
  await page.waitForSelector(`[data-testid="${phase}-phase"]`, { timeout });
}
```

**Selectors:**
- Test IDs: `data-testid="answer-input"`, `data-testid="submit-answer-btn"`, `data-testid="voting-phase"`
- Helpers: `page.getByTestId("phase-name")`, `page.getByRole("button", { name: "ACTION" })`

**Player Actions:**
```typescript
async function playRound(players: Page[], host: Page) {
  // Submit answers
  for (let i = 0; i < players.length; i++) {
    const input = players[i].getByTestId("answer-input");
    if (await input.isVisible()) {
      await input.fill(`Player ${i + 1}'s answer for this round`);
      await players[i].getByTestId("submit-answer-btn").click();
    }
  }

  // Wait for voting phase
  await Promise.all(players.map((p) => waitForPhase(p, "voting")));

  // Vote
  for (const player of players) {
    const voteBtn = player.getByTestId("answer-option-0");
    if (await voteBtn.isVisible()) {
      await voteBtn.click();
    }
  }

  // Wait for reveal
  await Promise.all(players.map((p) => waitForPhase(p, "reveal")));
}
```

**Parallel Browsers:**
```typescript
test("3 players complete 3 rounds to FINAL", async ({ browser }) => {
  const roomId = `fullgame-${Date.now()}`;
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const players = await Promise.all(
    contexts.map((ctx, i) => createPlayer(ctx, roomId, names[i]))
  );
});
```

**Playwright Configuration:**
```typescript
// From playwright.config.ts
{
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  webServer: [
    { command: "npm run party", port: 1999, reuseExistingServer: !process.env.CI, timeout: 30000 },
    { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
}
```

## Common Patterns

**Async Testing in Vitest:**
```typescript
// Return Promise or use async/await
it("should complete async operation", async () => {
  await server.waitForGeneration();
  const state = server.getState() as GameState;
  expect(state.phase).toBe(PHASES.WRITING);
});
```

**Error Testing:**
```typescript
// Test that functions throw on invalid input
it("should throw on invalid input", () => {
  expect(() => myFunction(null)).toThrow();
});

// Or test error handling in async code
it("should handle API failure", async () => {
  vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));
  // Test error handling
});
```

**Type Casting in Tests:**
```typescript
// GameState type from server for assertions
const state = server.getState() as GameState;
expect(state.phase).toBe(PHASES.LOBBY);

// Mock data types
const lastState = player.getLastState() as Record<string, unknown>;
expect((lastState?.players as unknown[]).length).toBe(4);
```

**Message Inspection:**
```typescript
// Get last state broadcast to a player
const state = player.getLastState();

// Get all state messages (for tracking state transitions)
const allStates = player.getAllStates();
expect(allStates.length).toBeGreaterThan(0);

// Get last chat message
const chatMsg = player.getLastChatMessage();
expect(chatMsg?.text).toBe("Hello");
```

**Timing in Tests:**
```typescript
// Wait for async generation
await server.waitForGeneration();

// Playwright timeout
await page.waitForTimeout(2000);

// Wait for selector
await page.waitForSelector(`[data-testid="voting-phase"]`, { timeout: 15000 });
```

---

*Testing analysis: 2026-01-29*
