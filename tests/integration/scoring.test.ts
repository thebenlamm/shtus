import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { type GameState } from "../../party/main";

describe("Scoring System", () => {
  let server: TestServer;
  let host: MockPlayer;
  let player2: MockPlayer;
  let player3: MockPlayer;

  beforeEach(async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "Test prompt" } }],
      }))
    );

    server = createTestServer("scoring-test", {});
    host = createMockPlayer(server, "Host");
    player2 = createMockPlayer(server, "Player2");
    player3 = createMockPlayer(server, "Player3");

    // Start game
    server.sendMessage(host.conn, {
      type: "start",
      theme: "scoring test",
      roundLimit: 5,
    });
    await server.waitForGeneration();
  });

  describe("Points calculation", () => {
    it("awards 100 points per vote received", async () => {
      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      const hostIndex = state.answerOrder.indexOf(host.id);

      // Both player2 and player3 vote for host
      player2.vote(hostIndex);
      player3.vote(hostIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      const finalState = server.getState() as GameState;

      // Host received 2 votes = 200 points + 200 winner bonus = 400
      expect(finalState.players[host.id].score).toBe(400);
    });

    it("awards +200 winner bonus to highest vote getter", async () => {
      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      const player2Index = state.answerOrder.indexOf(player2.id);
      const hostIndex = state.answerOrder.indexOf(host.id);

      // Only host votes for player2 (1 vote)
      // Player2 votes for host (1 vote)
      // Player3 votes for host (1 vote)
      host.vote(player2Index);
      player2.vote(hostIndex);
      player3.vote(hostIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      const finalState = server.getState() as GameState;

      // Host: 2 votes (200) + winner bonus (200) = 400
      // Player2: 1 vote (100) + no bonus = 100
      expect(finalState.players[host.id].score).toBe(400);
      expect(finalState.players[player2.id].score).toBe(100);
    });

    it("handles tie for winner (both get bonus)", async () => {
      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      const player2Index = state.answerOrder.indexOf(player2.id);
      const hostIndex = state.answerOrder.indexOf(host.id);

      // Host votes for player2 (1 vote)
      // Player2 votes for host (1 vote)
      // Player3 votes for host (2 votes total)
      // Actually let's make it a tie: host=1, player2=1, player3=1
      const player3Index = state.answerOrder.indexOf(player3.id);

      host.vote(player2Index);
      player2.vote(player3Index);
      player3.vote(hostIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      const finalState = server.getState() as GameState;

      // All tied at 1 vote: each gets 100 + 200 = 300
      expect(finalState.players[host.id].score).toBe(300);
      expect(finalState.players[player2.id].score).toBe(300);
      expect(finalState.players[player3.id].score).toBe(300);
    });
  });

  describe("Win streak", () => {
    it("increments win streak for winner", async () => {
      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      const hostIndex = state.answerOrder.indexOf(host.id);

      // Everyone votes for host
      player2.vote(hostIndex);
      player3.vote(hostIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      const finalState = server.getState() as GameState;

      // Host won, streak = 1
      expect(finalState.players[host.id].winStreak).toBe(1);
      // Others reset to 0
      expect(finalState.players[player2.id].winStreak).toBe(0);
      expect(finalState.players[player3.id].winStreak).toBe(0);
    });

    it("resets win streak for non-winners", async () => {
      // Manually set a win streak
      const state = server.getState() as GameState;
      state.players[player2.id].winStreak = 3;

      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const votingState = server.getState() as GameState;
      const hostIndex = votingState.answerOrder.indexOf(host.id);

      // Host wins, player2 loses their streak
      player2.vote(hostIndex);
      player3.vote(hostIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      const finalState = server.getState() as GameState;
      expect(finalState.players[player2.id].winStreak).toBe(0);
    });
  });

  describe("Score persistence across rounds", () => {
    it("accumulates scores across multiple rounds", async () => {
      // Round 1
      host.answer("R1 answer");
      player2.answer("R1 answer");
      player3.answer("R1 answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      let state = server.getState() as GameState;
      const hostIndex = state.answerOrder.indexOf(host.id);
      player2.vote(hostIndex);
      player3.vote(hostIndex);
      server.sendMessage(host.conn, { type: "end-voting" });

      // Host has 400 points after round 1
      state = server.getState() as GameState;
      expect(state.players[host.id].score).toBe(400);

      // Wait for pre-generation before advancing
      await server.waitForGeneration();

      // Advance to round 2
      server.sendMessage(host.conn, { type: "next-round" });

      // Round 2
      host.answer("R2 answer");
      player2.answer("R2 answer");
      player3.answer("R2 answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      state = server.getState() as GameState;
      const hostIndex2 = state.answerOrder.indexOf(host.id);
      player2.vote(hostIndex2);
      player3.vote(hostIndex2);
      server.sendMessage(host.conn, { type: "end-voting" });

      // Host now has 800 points (400 + 400)
      state = server.getState() as GameState;
      expect(state.players[host.id].score).toBe(800);
    });
  });
});
