import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { type GameState } from "../../party/main";

describe("Player Reconnection", () => {
  let server: TestServer;
  let host: MockPlayer;
  let player2: MockPlayer;

  beforeEach(async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "Test prompt" } }],
      }))
    );

    server = createTestServer("reconnect-test", {});
    host = createMockPlayer(server, "Host");
    player2 = createMockPlayer(server, "Player2");
  });

  describe("Grace period (5 minutes)", () => {
    it("preserves score when reconnecting within grace period", async () => {
      const player3 = createMockPlayer(server, "Player3");

      // Start game and give player2 some points
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 5,
      });
      await server.waitForGeneration();

      host.answer("answer");
      player2.answer("answer");
      player3.answer("answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      const player2Index = state.answerOrder.indexOf(player2.id);

      // Vote for player2
      host.vote(player2Index);
      player3.vote(player2Index);
      server.sendMessage(host.conn, { type: "end-voting" });

      // Player2 now has points
      const afterVoting = server.getState() as GameState;
      const player2Score = afterVoting.players[player2.id].score;
      expect(player2Score).toBeGreaterThan(0);

      // Player2 disconnects
      player2.disconnect();

      // Player2 reconnects (same ID)
      const reconnected = player2.reconnect();

      // Score should be preserved
      const afterReconnect = server.getState() as GameState;
      expect(afterReconnect.players[player2.id].score).toBe(player2Score);
      expect(afterReconnect.players[player2.id].disconnectedAt).toBeUndefined();
    });

    it("marks player as disconnected (not removed) on close", () => {
      player2.disconnect();

      const state = server.getState() as GameState;

      // Player should still exist but marked as disconnected
      expect(state.players[player2.id]).toBeDefined();
      expect(state.players[player2.id].disconnectedAt).toBeDefined();
    });

    it("removes player after grace period expires", () => {
      // Mock Date.now to simulate time passing
      const originalNow = Date.now;
      const startTime = Date.now();

      player2.disconnect();

      // Move time forward by 6 minutes (past 5 min grace period)
      vi.spyOn(Date, "now").mockReturnValue(startTime + 6 * 60 * 1000);

      // Trigger cleanup (happens on join)
      const player3 = createMockPlayer(server, "Player3");

      const state = server.getState() as GameState;

      // Player2 should be removed
      expect(state.players[player2.id]).toBeUndefined();

      // Restore
      Date.now = originalNow;
    });
  });

  describe("Win streak preservation", () => {
    it("preserves win streak on reconnect", async () => {
      const player3 = createMockPlayer(server, "Player3");

      // Start game
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 5,
      });
      await server.waitForGeneration();

      // Give player2 a win streak
      const state = server.getState() as GameState;
      state.players[player2.id].winStreak = 5;

      // Disconnect and reconnect
      player2.disconnect();
      player2.reconnect();

      const afterReconnect = server.getState() as GameState;
      expect(afterReconnect.players[player2.id].winStreak).toBe(5);
    });
  });

  describe("Connection race handling", () => {
    it("handles new connection before old one closes", () => {
      // This tests the race condition where PartySocket opens a new connection
      // before the old one fully closes

      // Simulate: new connection opens with same ID
      const newConn = server.room.addConnection(player2.id);
      const ctx = { request: new Request("http://test/") };
      server.server.onConnect(newConn as any, ctx as any);

      // Old connection closes
      const oldConn = server.room.getConnection(player2.id);
      // Since both have same ID, only one exists in map

      const state = server.getState() as GameState;

      // Player should NOT be marked as disconnected
      expect(state.players[player2.id].disconnectedAt).toBeUndefined();
    });
  });

  describe("Answer preservation", () => {
    it("does not count disconnected player answers toward scoring", async () => {
      const player3 = createMockPlayer(server, "Player3");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 5,
      });
      await server.waitForGeneration();

      // All submit answers
      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      // Player2 disconnects before voting
      player2.disconnect();

      server.sendMessage(host.conn, { type: "end-writing" });

      // Vote - votes for player2 should not count
      const state = server.getState() as GameState;
      const player2Index = state.answerOrder.indexOf(player2.id);

      // Even if someone votes for player2's answer
      player3.vote(player2Index);

      const player3Index = state.answerOrder.indexOf(player3.id);
      host.vote(player3Index);

      server.sendMessage(host.conn, { type: "end-voting" });

      // Player2's score should not have increased (disconnected)
      const finalState = server.getState() as GameState;
      expect(finalState.players[player2.id].score).toBe(0);
    });
  });
});
