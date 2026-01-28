import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer } from "../utils/mock-player";
import { PHASES, type GameState } from "../../party/main";

describe("Stale Async Result Handling", () => {
  let server: TestServer;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("generationId check", () => {
    it("discards prompt results from previous game session", async () => {
      // Setup: slow API response that arrives after game restart
      let resolveSlowPromise: (value: Response) => void;
      const slowPromise = new Promise<Response>((resolve) => {
        resolveSlowPromise = resolve;
      });

      let callCount = 0;
      vi.spyOn(global, "fetch").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: slow response
          return slowPromise;
        }
        // Subsequent calls: fast response
        return new Response(JSON.stringify({
          choices: [{ message: { content: "New game prompt" } }],
        }));
      });

      server = createTestServer("stale-test", { XAI_API_KEY: "test-key" });
      const host = createMockPlayer(server, "Host");
      createMockPlayer(server, "Player2"); // Need 2 players to start

      // Start first game - slow generation starts
      server.sendMessage(host.conn, {
        type: "start",
        theme: "first game",
        roundLimit: 3,
      });

      // Get initial generationId
      let state = server.getState() as GameState;
      const firstGenId = state.generationId;
      expect(state.isGenerating).toBe(true);

      // Simulate: User gets impatient, game somehow returns to lobby
      // In practice this would be a restart from FINAL, but let's manipulate state
      // Actually, let's play through a full game to FINAL, then restart
      // That's too complex. Instead, let's verify the generationId mechanism directly.

      // The slow response finally arrives - we need to simulate the race
      // Let's use a different approach: manually increment generationId

      // Increment generationId (simulates game restart)
      server.server.state.generationId++;
      const newGenId = server.server.state.generationId;
      expect(newGenId).toBe(firstGenId + 1);

      // Now the slow promise resolves with "Old stale prompt"
      resolveSlowPromise!(new Response(JSON.stringify({
        choices: [{ message: { content: "Old stale prompt" } }],
      })));

      // Wait a tick for the promise to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The stale result should have been discarded
      // nextPrompt should still be null (not set to "Old stale prompt")
      state = server.getState() as GameState;

      // The stale prompt should have been discarded because generationId changed
      // This is the key behavior we're testing
      expect(state.nextPrompt).toBeNull();
    });

    it("increments generationId on game start", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      server = createTestServer("stale-test", { XAI_API_KEY: "test-key" });
      const host = createMockPlayer(server, "Host");
      createMockPlayer(server, "Player2"); // Need 2 players to start

      const initialState = server.getState() as GameState;
      const initialGenId = initialState.generationId;

      // Start game
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      const afterStartState = server.getState() as GameState;

      // generationId should have incremented
      expect(afterStartState.generationId).toBe(initialGenId + 1);
    });

    it("increments generationId on restart", async () => {
      // Use mockImplementation for multiple fetch calls
      vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      server = createTestServer("stale-test", { XAI_API_KEY: "test-key" });
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      // Play through a game to FINAL (roundLimit: 3 is minimum valid)
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Play 3 rounds to reach FINAL
      for (let round = 1; round <= 3; round++) {
        host.answer(`answer ${round}`);
        player2.answer(`answer ${round}`);
        server.sendMessage(host.conn, { type: "end-writing" });

        const state = server.getState() as GameState;
        const hostIndex = state.answerOrder.indexOf(host.id);
        const player2Index = state.answerOrder.indexOf(player2.id);
        host.vote(player2Index);
        player2.vote(hostIndex);

        server.sendMessage(host.conn, { type: "end-voting" });
        await server.waitForGeneration();
        server.sendMessage(host.conn, { type: "next-round" });
      }

      // Now in FINAL
      let state = server.getState() as GameState;
      expect(state.phase).toBe(PHASES.FINAL);

      const preRestartGenId = state.generationId;

      // Restart
      server.sendMessage(host.conn, { type: "restart" });

      state = server.getState() as GameState;

      // generationId should have incremented
      expect(state.generationId).toBe(preRestartGenId + 1);
      expect(state.phase).toBe(PHASES.LOBBY);
    });
  });

  describe("Chat summarization staleness", () => {
    it("increments summaryGenerationId on prune", () => {
      server = createTestServer("summary-test", { XAI_API_KEY: "test-key" });
      const host = createMockPlayer(server, "Host");

      const initialSummaryGenId = server.server.summaryGenerationId;

      // Fill chat to hard cap (500) to trigger prune
      for (let i = 0; i < 501; i++) {
        server.server.chatMessages.push({
          id: `msg-${i}`,
          playerId: host.id,
          playerName: "Host",
          text: `Message ${i}`,
          timestamp: Date.now(),
          type: "chat",
        });
      }

      // Manually call pruneChat
      server.server.pruneChat();

      // summaryGenerationId should have incremented
      expect(server.server.summaryGenerationId).toBe(initialSummaryGenId + 1);
    });
  });
});
