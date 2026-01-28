import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { PHASES, type GameState } from "../../party/main";

describe("Voyeur Mode", () => {
  let server: TestServer;

  beforeEach(() => {
    server = createTestServer("voyeur-test", { CHAT_ENABLED: "true" });
  });

  describe("Last active player protection", () => {
    it("prevents last active player from becoming voyeur mid-game", async () => {
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      // Start game (need 3 players to test this scenario)
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Player2 and player3 become voyeurs
      player2.toggleVoyeur();
      player3.toggleVoyeur();

      let state = server.getState() as GameState;
      expect(state.players[player2.id].isVoyeur).toBe(true);
      expect(state.players[player3.id].isVoyeur).toBe(true);

      // Host tries to become voyeur - should be blocked (would leave 0 active players)
      host.toggleVoyeur();

      state = server.getState() as GameState;

      // Host should NOT be voyeur (blocked) - isVoyeur is undefined or false
      expect(state.players[host.id].isVoyeur).toBeFalsy();
    });

    it("allows last player to become voyeur in lobby", () => {
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      // In lobby phase
      player2.toggleVoyeur();
      host.toggleVoyeur();

      const state = server.getState() as GameState;

      // Both can be voyeurs in lobby
      expect(state.players[host.id].isVoyeur).toBe(true);
      expect(state.players[player2.id].isVoyeur).toBe(true);
    });

    it("allows last player to become voyeur in final phase", async () => {
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      // Play to FINAL phase (roundLimit: 3 is minimum valid)
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
        server.sendMessage(host.conn, { type: "end-writing" });

        const state = server.getState() as GameState;
        const hostIndex = state.answerOrder.indexOf(host.id);
        player2.vote(hostIndex);
        const player2Index = state.answerOrder.indexOf(player2.id);
        host.vote(player2Index);

        server.sendMessage(host.conn, { type: "end-voting" });
        await server.waitForGeneration();
        server.sendMessage(host.conn, { type: "next-round" });
      }

      // Now in FINAL
      let finalState = server.getState() as GameState;
      expect(finalState.phase).toBe(PHASES.FINAL);

      // Both can become voyeurs in FINAL
      player2.toggleVoyeur();
      host.toggleVoyeur();

      finalState = server.getState() as GameState;
      expect(finalState.players[host.id].isVoyeur).toBe(true);
      expect(finalState.players[player2.id].isVoyeur).toBe(true);
    });
  });

  describe("Voyeur restrictions", () => {
    it("voyeurs cannot submit answers", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const voyeur = createMockPlayer(server, "Voyeur");

      // Make voyeur a voyeur before game starts
      voyeur.toggleVoyeur();

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Voyeur tries to submit answer
      voyeur.answer("Voyeur's answer");

      const state = server.getState() as GameState;

      // Voyeur's answer should not be recorded
      expect(state.answers[voyeur.id]).toBeUndefined();
    });

    it("voyeurs cannot vote", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const voyeur = createMockPlayer(server, "Voyeur");

      voyeur.toggleVoyeur();

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      host.answer("Host answer");
      player2.answer("Player2 answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      // Voyeur tries to vote
      const state = server.getState() as GameState;
      const hostIndex = state.answerOrder.indexOf(host.id);
      voyeur.vote(hostIndex);

      const afterVote = server.getState() as GameState;

      // Voyeur's vote should not be recorded
      expect(afterVote.votes[voyeur.id]).toBeUndefined();
    });

    it("voyeurs can still chat", () => {
      const host = createMockPlayer(server, "Host");
      const voyeur = createMockPlayer(server, "Voyeur");

      voyeur.toggleVoyeur();
      voyeur.chat("Voyeur can chat!");

      expect(server.server.chatMessages).toHaveLength(1);
      expect(server.server.chatMessages[0].playerName).toBe("Voyeur");
    });
  });

  describe("Voyeur counting", () => {
    it("voyeurs do not count toward minimum players to start", () => {
      const host = createMockPlayer(server, "Host");
      const voyeur = createMockPlayer(server, "Voyeur");

      voyeur.toggleVoyeur();

      // Try to start with only 1 active player
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      const state = server.getState() as GameState;

      // Should still be in lobby - need 2 active players
      expect(state.phase).toBe(PHASES.LOBBY);
    });

    it("voyeurs who submitted answers before toggling are excluded from voting phase", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "Test prompt" } }],
        }))
      );

      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // All submit answers
      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      // Player3 becomes voyeur after submitting
      player3.toggleVoyeur();

      server.sendMessage(host.conn, { type: "end-writing" });

      // Check the state - player3's answer should be removed before voting
      const state = host.getLastState();
      const submittedIds = state?.submittedPlayerIds as string[];
      const answers = state?.answers as { playerId?: string; answer: string }[];

      // Player3 should not be in submitted players (voyeur now)
      expect(submittedIds).not.toContain(player3.id);
      // Voting pool should exclude player3's answer
      expect(answers.length).toBe(2);
    });
  });

  describe("Voyeur toggle toggling", () => {
    it("can toggle voyeur mode on and off", () => {
      const player = createMockPlayer(server, "Player");

      // Toggle on
      player.toggleVoyeur();
      let state = server.getState() as GameState;
      expect(state.players[player.id].isVoyeur).toBe(true);

      // Toggle off
      player.toggleVoyeur();
      state = server.getState() as GameState;
      expect(state.players[player.id].isVoyeur).toBe(false);
    });
  });
});
