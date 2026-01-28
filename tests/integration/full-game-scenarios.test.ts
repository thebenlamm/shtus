import { describe, it, expect, beforeEach } from "vitest";
import { GameSimulator, simulateFullGame } from "../utils/game-simulator";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { PHASES, type GameState } from "../../party/main";

describe("Full Game Scenarios", () => {
  describe("Basic game completion", () => {
    it("completes a 3-player, 3-round game", async () => {
      const result = await simulateFullGame(3, 3);

      expect(result.rounds).toHaveLength(3);
      expect(result.winnerId).toBeDefined();
      expect(result.winnerScore).toBeGreaterThan(0);
      expect(result.totalPlayers).toBe(3);
    });

    it("completes a 4-player, 5-round game", async () => {
      const result = await simulateFullGame(4, 5);

      expect(result.rounds).toHaveLength(5);
      expect(result.winnerId).toBeDefined();
      expect(result.finalScores.size).toBe(4);
    });

    it("completes a 6-player, 10-round game", async () => {
      const result = await simulateFullGame(6, 10);

      expect(result.rounds).toHaveLength(10);
      expect(result.totalPlayers).toBe(6);
    });
  });

  describe("Endless mode", () => {
    it("continues indefinitely without hitting FINAL", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: null, // Endless
      });

      // Play 5 rounds manually
      const rounds = await simulator.runRounds(5);

      expect(rounds).toHaveLength(5);
      // Should still be in WRITING phase, not FINAL
      const state = simulator.getState();
      expect(state.phase).toBe(PHASES.WRITING);
      expect(state.roundLimit).toBeNull();
    });

    it("tracks scores across many rounds", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: null,
      });

      await simulator.runRounds(10);

      const results = simulator.getResults();
      // At least one player should have accumulated significant score
      expect(results.winnerScore).toBeGreaterThan(0);
    });
  });

  describe("Voyeur mode", () => {
    it("completes game with 1 voyeur", async () => {
      const result = await simulateFullGame(4, 3, { voyeurs: 1 });

      expect(result.rounds).toHaveLength(3);
      expect(result.totalPlayers).toBe(4);
      expect(result.voyeurCount).toBe(1);
    });

    it("completes game with multiple voyeurs", async () => {
      const result = await simulateFullGame(5, 3, { voyeurs: 2 });

      expect(result.rounds).toHaveLength(3);
      expect(result.totalPlayers).toBe(5);
      expect(result.voyeurCount).toBe(2);
    });

    it("voyeurs do not appear in final scores competition", async () => {
      const simulator = new GameSimulator({
        playerCount: 4,
        rounds: 3,
        voyeurs: 1,
      });

      await simulator.runFullGame();

      const state = simulator.getState();
      // Find the voyeur
      const voyeur = Object.values(state.players).find((p) => p.isVoyeur);
      expect(voyeur).toBeDefined();
      // Voyeur should have 0 score (didn't participate)
      expect(voyeur!.score).toBe(0);
    });
  });

  describe("Late joiners", () => {
    it("allows players to join mid-game", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.start();

      // Play first round
      await simulator.playRound();
      await simulator.advanceToNextRound();

      // Add late joiner during round 2
      const lateJoiner = simulator.addLateJoiner("LatePlayer");

      // Late joiner should be in player list
      const state = simulator.getState();
      expect(Object.keys(state.players)).toContain(lateJoiner.id);
    });

    it("late joiner starts with 0 score", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.start();
      await simulator.playRound();
      await simulator.advanceToNextRound();

      const lateJoiner = simulator.addLateJoiner("LatePlayer");

      const state = simulator.getState();
      expect(state.players[lateJoiner.id].score).toBe(0);
    });
  });

  describe("Game restart", () => {
    it("resets all state after restart", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      // Play full game
      await simulator.runFullGame();
      const preRestartResults = simulator.getResults();
      expect(preRestartResults.winnerScore).toBeGreaterThan(0);

      // Restart
      simulator.restart();

      const state = simulator.getState();
      expect(state.phase).toBe(PHASES.LOBBY);
      expect(state.round).toBe(0);

      // All scores should be reset
      for (const player of Object.values(state.players)) {
        expect(player.score).toBe(0);
        expect(player.winStreak).toBe(0);
      }
    });

    it("can play another full game after restart", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      // First game
      await simulator.runFullGame();
      simulator.restart();

      // Second game
      await simulator.start();
      await simulator.playRound();
      await simulator.advanceToNextRound();

      const state = simulator.getState();
      expect(state.round).toBe(2);
      expect(state.phase).toBe(PHASES.WRITING);
    });
  });

  describe("Simultaneous actions", () => {
    let server: TestServer;
    let players: MockPlayer[];

    beforeEach(() => {
      server = createTestServer();
      players = [];
      for (let i = 0; i < 4; i++) {
        players.push(createMockPlayer(server, `Player${i + 1}`));
      }
    });

    it("handles all players submitting answers simultaneously", async () => {
      const host = players[0];

      // Start game
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // All players submit at "same time"
      for (const player of players) {
        player.answer(`${player.name}'s answer`);
      }

      const state = server.getState() as GameState;
      expect(Object.keys(state.answers)).toHaveLength(4);
    });

    it("handles all players voting simultaneously", async () => {
      const host = players[0];

      // Start and submit answers
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      for (const player of players) {
        player.answer(`${player.name}'s answer`);
      }

      server.sendMessage(host.conn, { type: "end-writing" });

      // All players vote at "same time"
      const state = server.getState() as GameState;
      for (let i = 0; i < players.length; i++) {
        const selfIndex = state.answerOrder.indexOf(players[i].id);
        const voteIndex = (selfIndex + 1) % players.length;
        players[i].vote(voteIndex);
      }

      const afterVote = server.getState() as GameState;
      // All players should have voted
      expect(Object.keys(afterVote.votes)).toHaveLength(4);
    });

    it("prevents double submission in same round", async () => {
      const host = players[0];

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Submit twice
      host.answer("First answer");
      host.answer("Second answer");

      const state = server.getState() as GameState;
      // Should only have the first answer
      expect(state.answers[host.id]).toBe("First answer");
    });

    it("prevents double voting in same round", async () => {
      const host = players[0];

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      for (const player of players) {
        player.answer(`${player.name}'s answer`);
      }
      server.sendMessage(host.conn, { type: "end-writing" });

      const beforeVote = server.getState() as GameState;
      const hostIndex = beforeVote.answerOrder.indexOf(host.id);
      // Find two different indices that aren't the host's own answer
      const otherIndex1 = hostIndex === 0 ? 1 : 0;
      const otherIndex2 = hostIndex === 0 ? 2 : (hostIndex === 1 ? 2 : 0);

      // Vote twice with different indices
      host.vote(otherIndex1);
      host.vote(otherIndex2);

      const state = server.getState() as GameState;
      // Should only count first vote (votes maps to player ID, not index)
      const firstVotedPlayerId = beforeVote.answerOrder[otherIndex1];
      expect(state.votes[host.id]).toBe(firstVotedPlayerId);
    });
  });

  describe("Player disconnection during game", () => {
    let server: TestServer;
    let players: MockPlayer[];

    beforeEach(() => {
      server = createTestServer();
      players = [];
      for (let i = 0; i < 3; i++) {
        players.push(createMockPlayer(server, `Player${i + 1}`));
      }
    });

    it("marks player as disconnected", async () => {
      const host = players[0];

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Player 2 disconnects
      players[1].disconnect();

      const state = server.getState() as GameState;
      expect(state.players[players[1].id].disconnectedAt).toBeDefined();
    });

    it("game continues with remaining players", async () => {
      const host = players[0];

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Disconnect player 2
      players[1].disconnect();

      // Remaining players submit
      host.answer("Host answer");
      players[2].answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      expect(state.phase).toBe(PHASES.VOTING);
    });

    it("disconnected player can reconnect", async () => {
      const host = players[0];

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Player 2 disconnects and reconnects
      players[1].disconnect();
      players[1].reconnect();

      const state = server.getState() as GameState;
      expect(state.players[players[1].id].disconnectedAt).toBeUndefined();
    });
  });

  describe("Win streak tracking", () => {
    it("tracks consecutive round wins", async () => {
      const server = createTestServer();
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // Play rounds where player2 always wins
      for (let round = 0; round < 2; round++) {
        host.answer(`Host answer ${round}`);
        player2.answer(`Player2 answer ${round}`);
        player3.answer(`Player3 answer ${round}`);

        server.sendMessage(host.conn, { type: "end-writing" });

        const state = server.getState() as GameState;
        const player2Index = state.answerOrder.indexOf(player2.id);

        // Host and player3 vote for player2
        host.vote(player2Index);
        player3.vote(player2Index);
        // Player2 votes for someone else
        const otherIndex = player2Index === 0 ? 1 : 0;
        player2.vote(otherIndex);

        server.sendMessage(host.conn, { type: "end-voting" });
        await server.waitForGeneration();
        server.sendMessage(host.conn, { type: "next-round" });
      }

      const state = server.getState() as GameState;
      // Player2 should have a win streak of 2
      expect(state.players[player2.id].winStreak).toBe(2);
    });
  });

  describe("Score calculation", () => {
    it("awards 200 base + 100 per vote to winner", async () => {
      const server = createTestServer();
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      host.answer("Host answer");
      player2.answer("Player2 answer");
      player3.answer("Player3 answer");

      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      const player2Index = state.answerOrder.indexOf(player2.id);

      // Both host and player3 vote for player2 (2 votes)
      host.vote(player2Index);
      player3.vote(player2Index);
      // Player2 votes for someone else
      const otherIndex = player2Index === 0 ? 1 : 0;
      player2.vote(otherIndex);

      server.sendMessage(host.conn, { type: "end-voting" });

      const afterVoting = server.getState() as GameState;
      // Winner gets: 200 base + (2 votes * 100) = 400 points
      expect(afterVoting.players[player2.id].score).toBe(400);
    });
  });
});
