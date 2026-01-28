import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { PHASES, type GameState } from "../../party/main";

describe("Game Flow - Full Lifecycle", () => {
  let server: TestServer;
  let host: MockPlayer;
  let player2: MockPlayer;
  let player3: MockPlayer;

  beforeEach(() => {
    // No API key = uses fallback prompts (synchronous)
    server = createTestServer("test-room", {});
    host = createMockPlayer(server, "Host");
    player2 = createMockPlayer(server, "Player2");
    player3 = createMockPlayer(server, "Player3");
  });

  describe("LOBBY phase", () => {
    it("starts in lobby phase", () => {
      const state = server.getState() as GameState;
      expect(state.phase).toBe(PHASES.LOBBY);
    });

    it("first player becomes host", () => {
      const state = server.getState() as GameState;
      expect(state.hostId).toBe(host.id);
    });

    it("tracks all players", () => {
      const state = server.getState() as GameState;
      expect(Object.keys(state.players)).toHaveLength(3);
      expect(state.players[host.id].name).toBe("Host");
      expect(state.players[player2.id].name).toBe("Player2");
    });

    it("requires at least 2 active players to start", () => {
      // With only one player, start should fail
      const singlePlayerServer = createTestServer();
      const soloPlayer = createMockPlayer(singlePlayerServer, "Solo");
      singlePlayerServer.sendMessage(soloPlayer.conn, {
        type: "start",
        theme: "test",
      });

      const state = singlePlayerServer.getState() as GameState;
      expect(state.phase).toBe(PHASES.LOBBY);
    });

    it("only host can start the game", () => {
      // Non-host trying to start
      server.sendMessage(player2.conn, { type: "start", theme: "test" });
      const state = server.getState() as GameState;
      expect(state.phase).toBe(PHASES.LOBBY);
    });
  });

  describe("Full game cycle", () => {
    it("completes LOBBY → WRITING → VOTING → REVEAL → FINAL flow", async () => {
      // Start game with round limit of 3 (valid values are 3, 5, 10, or null)
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test theme",
        roundLimit: 3,
      });

      // Wait for generation (uses fallback since no API key)
      await server.waitForGeneration();

      let state = server.getState() as GameState;
      expect(state.phase).toBe(PHASES.WRITING);
      expect(state.round).toBe(1);
      expect(state.theme).toBe("test theme");

      // Play through 3 rounds
      for (let round = 1; round <= 3; round++) {
        // Submit answers
        host.answer(`Host round ${round}`);
        player2.answer(`Player2 round ${round}`);
        player3.answer(`Player3 round ${round}`);

        // Host ends writing
        server.sendMessage(host.conn, { type: "end-writing" });

        state = server.getState() as GameState;
        expect(state.phase).toBe(PHASES.VOTING);

        // Players vote (not for themselves)
        const answerOrder = state.answerOrder;
        for (const player of [host, player2, player3]) {
          const selfIndex = answerOrder.indexOf(player.id);
          const otherIndex = selfIndex === 0 ? 1 : 0;
          player.vote(otherIndex);
        }

        // Host ends voting
        server.sendMessage(host.conn, { type: "end-voting" });

        state = server.getState() as GameState;
        expect(state.phase).toBe(PHASES.REVEAL);

        // Advance to next round (or FINAL if last round)
        // Wait for pre-generation to complete before advancing
        await server.waitForGeneration();
        server.sendMessage(host.conn, { type: "next-round" });

        state = server.getState() as GameState;
        if (round < 3) {
          expect(state.phase).toBe(PHASES.WRITING);
          expect(state.round).toBe(round + 1);
        } else {
          expect(state.phase).toBe(PHASES.FINAL);
        }
      }
    });

    it("supports endless mode (null roundLimit)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Endless prompt" } }],
        }))
      );

      // Start with no round limit
      server.sendMessage(host.conn, {
        type: "start",
        theme: "endless game",
        roundLimit: null,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.roundLimit).toBeNull();
      expect(state.phase).toBe(PHASES.WRITING);
    });
  });

  describe("Game restart", () => {
    it("resets scores and returns to lobby on restart", async () => {
      // Play a game to completion (roundLimit: 3 is the minimum valid limit)
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Play through all 3 rounds
      for (let round = 1; round <= 3; round++) {
        host.answer(`answer ${round}`);
        player2.answer(`answer ${round}`);
        player3.answer(`answer ${round}`);
        server.sendMessage(host.conn, { type: "end-writing" });

        const state = server.getState() as GameState;
        const player2Index = state.answerOrder.indexOf(player2.id);
        // Vote for player2's answer (they'll get points)
        for (const player of [host, player3]) {
          player.vote(player2Index);
        }
        const otherIndex = player2Index === 0 ? 1 : 0;
        player2.vote(otherIndex);

        server.sendMessage(host.conn, { type: "end-voting" });
        await server.waitForGeneration();
        server.sendMessage(host.conn, { type: "next-round" });
      }

      // Now in FINAL, player2 should have points
      let finalState = server.getState() as GameState;
      expect(finalState.phase).toBe(PHASES.FINAL);
      expect(finalState.players[player2.id].score).toBeGreaterThan(0);

      // Restart the game
      server.sendMessage(host.conn, { type: "restart" });

      finalState = server.getState() as GameState;
      expect(finalState.phase).toBe(PHASES.LOBBY);
      expect(finalState.round).toBe(0);
      // All scores reset
      Object.values(finalState.players).forEach((p) => {
        expect(p.score).toBe(0);
        expect(p.winStreak).toBe(0);
      });
    });
  });
});
