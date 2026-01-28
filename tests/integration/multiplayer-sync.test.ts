import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer } from "../utils/mock-player";
import { type GameState } from "../../party/main";

describe("Multiplayer Synchronization", () => {
  let server: TestServer;

  beforeEach(() => {
    server = createTestServer("sync-test", {});
  });

  describe("State broadcast", () => {
    it("all players receive same state on player join", () => {
      const player1 = createMockPlayer(server, "Player1");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      // Clear messages after join
      player1.conn.clearMessages();
      player2.conn.clearMessages();
      player3.conn.clearMessages();

      // Join another player - should broadcast to all
      createMockPlayer(server, "Player4"); // Triggers state broadcast

      // All existing players should have received the state update
      const state1 = player1.getLastState();
      const state2 = player2.getLastState();
      const state3 = player3.getLastState();

      // All should show 4 players
      expect((state1?.players as unknown[]).length).toBe(4);
      expect((state2?.players as unknown[]).length).toBe(4);
      expect((state3?.players as unknown[]).length).toBe(4);
    });

    it("rapid joins maintain consistency", () => {
      // Simulate rapid joining
      const players: MockPlayer[] = [];
      for (let i = 0; i < 10; i++) {
        players.push(createMockPlayer(server, `RapidPlayer${i}`));
      }

      const state = server.getState() as GameState;
      expect(Object.keys(state.players)).toHaveLength(10);

      // All players should see 10 players
      players.forEach((player) => {
        const lastState = player.getLastState();
        expect((lastState?.players as unknown[]).length).toBe(10);
      });
    });

    it("answer submission broadcasts to all players", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      // Start game
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Clear messages
      host.conn.clearMessages();
      player2.conn.clearMessages();
      player3.conn.clearMessages();

      // Player2 submits answer
      player2.answer("Player2's answer");

      // All players should see updated submittedPlayerIds
      const hostState = host.getLastState();
      const player3State = player3.getLastState();

      expect(hostState?.submittedPlayerIds).toContain(player2.id);
      expect(player3State?.submittedPlayerIds).toContain(player2.id);
    });
  });

  describe("Personalized state in voting", () => {
    it("marks own answer during voting phase", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      host.answer("Host answer");
      player2.answer("Player2 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      // During voting, each player should see their own answer marked
      const hostState = host.getLastState();
      const player2State = player2.getLastState();

      const hostAnswers = hostState?.answers as { isOwn: boolean; answer: string }[];
      const player2Answers = player2State?.answers as { isOwn: boolean; answer: string }[];

      // Host should see one answer marked as own
      const hostOwnAnswer = hostAnswers.find((a) => a.isOwn);
      expect(hostOwnAnswer).toBeDefined();
      expect(hostOwnAnswer?.answer).toBe("Host answer");

      // Player2 should see their own answer marked
      const player2OwnAnswer = player2Answers.find((a) => a.isOwn);
      expect(player2OwnAnswer).toBeDefined();
      expect(player2OwnAnswer?.answer).toBe("Player2 answer");
    });
  });

  describe("Reveal state includes identities", () => {
    it("reveals player identities after voting ends", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      host.answer("Host answer");
      player2.answer("Player2 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      // Vote
      const state = server.getState() as GameState;
      const hostIndex = state.answerOrder.indexOf(host.id);
      const player2Index = state.answerOrder.indexOf(player2.id);

      // Each votes for the other
      host.vote(player2Index);
      player2.vote(hostIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      // In reveal phase, answers should include playerId
      const hostState = host.getLastState();
      const answers = hostState?.answers as { playerId: string; answer: string }[];

      // Find host's answer and verify identity is revealed
      const hostAnswer = answers.find((a) => a.playerId === host.id);
      expect(hostAnswer).toBeDefined();
      expect(hostAnswer?.answer).toBe("Host answer");
    });
  });
});
