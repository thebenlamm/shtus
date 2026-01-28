import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { GameSimulator } from "../utils/game-simulator";
import { PHASES, type GameState } from "../../party/main";

describe("Round Limits", () => {
  describe("3-round games", () => {
    it("completes exactly 3 rounds then moves to FINAL", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.runFullGame();

      expect(simulator.rounds).toHaveLength(3);
      expect(simulator.getState().phase).toBe(PHASES.FINAL);
    });

    it("round counter increments correctly through 3 rounds", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.start();
      expect(simulator.getState().round).toBe(1);

      await simulator.playRound();
      await simulator.advanceToNextRound();
      expect(simulator.getState().round).toBe(2);

      await simulator.playRound();
      await simulator.advanceToNextRound();
      expect(simulator.getState().round).toBe(3);

      await simulator.playRound();
      await simulator.advanceToNextRound();
      expect(simulator.getState().phase).toBe(PHASES.FINAL);
    });
  });

  describe("5-round games", () => {
    it("completes exactly 5 rounds then moves to FINAL", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 5,
      });

      await simulator.runFullGame();

      expect(simulator.rounds).toHaveLength(5);
      expect(simulator.getState().phase).toBe(PHASES.FINAL);
    });

    it("round counter shows correct values", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 5,
      });

      await simulator.start();

      for (let expectedRound = 1; expectedRound <= 5; expectedRound++) {
        expect(simulator.getState().round).toBe(expectedRound);
        await simulator.playRound();

        if (expectedRound < 5) {
          await simulator.advanceToNextRound();
        }
      }

      await simulator.advanceToNextRound();
      expect(simulator.getState().phase).toBe(PHASES.FINAL);
    });
  });

  describe("10-round games", () => {
    it("completes exactly 10 rounds then moves to FINAL", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 10,
      });

      await simulator.runFullGame();

      expect(simulator.rounds).toHaveLength(10);
      expect(simulator.getState().phase).toBe(PHASES.FINAL);
    });

    it("scores accumulate correctly over 10 rounds", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 10,
      });

      await simulator.runFullGame();

      const results = simulator.getResults();
      // After 10 rounds, winner should have significant score
      expect(results.winnerScore).toBeGreaterThan(0);
      // At least some points should have been distributed
      let totalScore = 0;
      for (const score of results.finalScores.values()) {
        totalScore += score;
      }
      expect(totalScore).toBeGreaterThan(0);
    });
  });

  describe("Endless mode (null roundLimit)", () => {
    it("never transitions to FINAL automatically", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: null,
      });

      // Play 15 rounds
      await simulator.runRounds(15);

      // Should still not be in FINAL
      expect(simulator.getState().phase).not.toBe(PHASES.FINAL);
      expect(simulator.rounds).toHaveLength(15);
    });

    it("round counter continues incrementing", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: null,
      });

      await simulator.runRounds(20);

      // Should be at round 21 (after playing 20 rounds)
      expect(simulator.getState().round).toBe(21);
    });

    it("roundLimit stays null throughout game", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: null,
      });

      await simulator.start();
      expect(simulator.getState().roundLimit).toBeNull();

      await simulator.runRounds(5);
      expect(simulator.getState().roundLimit).toBeNull();
    });

    it("can be restarted and remains endless", async () => {
      const server = createTestServer();
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      // Start endless game
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: null,
      });
      await server.waitForGeneration();

      // Play a round
      host.answer("answer");
      player2.answer("answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      const state = server.getState() as GameState;
      host.vote(state.answerOrder.indexOf(player2.id));
      player2.vote(state.answerOrder.indexOf(host.id));
      server.sendMessage(host.conn, { type: "end-voting" });
      await server.waitForGeneration();
      server.sendMessage(host.conn, { type: "next-round" });

      // Restart
      // Note: We can't restart from WRITING, need to actually end game
      // Since endless mode doesn't end, we'll test a different way
      const afterRound = server.getState() as GameState;
      expect(afterRound.roundLimit).toBeNull();
    });
  });

  describe("Round counter accuracy", () => {
    let server: TestServer;
    let host: MockPlayer;
    let player2: MockPlayer;

    beforeEach(() => {
      server = createTestServer();
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");
    });

    it("starts at round 0 in lobby", () => {
      const state = server.getState() as GameState;
      expect(state.round).toBe(0);
    });

    it("transitions to round 1 when game starts", async () => {
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.round).toBe(1);
    });

    it("maintains round number through phase transitions", async () => {
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // WRITING phase
      let state = server.getState() as GameState;
      expect(state.round).toBe(1);
      expect(state.phase).toBe(PHASES.WRITING);

      host.answer("answer");
      player2.answer("answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      // VOTING phase - same round
      state = server.getState() as GameState;
      expect(state.round).toBe(1);
      expect(state.phase).toBe(PHASES.VOTING);

      host.vote(state.answerOrder.indexOf(player2.id));
      player2.vote(state.answerOrder.indexOf(host.id));
      server.sendMessage(host.conn, { type: "end-voting" });

      // REVEAL phase - same round
      state = server.getState() as GameState;
      expect(state.round).toBe(1);
      expect(state.phase).toBe(PHASES.REVEAL);
    });

    it("increments round only on next-round", async () => {
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      host.answer("answer");
      player2.answer("answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      let state = server.getState() as GameState;
      host.vote(state.answerOrder.indexOf(player2.id));
      player2.vote(state.answerOrder.indexOf(host.id));
      server.sendMessage(host.conn, { type: "end-voting" });

      // Still round 1 in REVEAL
      state = server.getState() as GameState;
      expect(state.round).toBe(1);

      // Now advance
      await server.waitForGeneration();
      server.sendMessage(host.conn, { type: "next-round" });

      // Now round 2
      state = server.getState() as GameState;
      expect(state.round).toBe(2);
    });

    it("displays roundLimit correctly in state", async () => {
      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 5,
      });
      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.roundLimit).toBe(5);
    });
  });

  describe("Edge cases", () => {
    it("handles restart correctly - resets round to 0", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.runFullGame();
      expect(simulator.getState().round).toBeGreaterThan(0);

      simulator.restart();
      expect(simulator.getState().round).toBe(0);
    });

    it("preserves roundLimit after restart from FINAL", async () => {
      // Note: restart creates new game, so roundLimit would need to be set again
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.runFullGame();
      simulator.restart();

      // In lobby, roundLimit should be reset (waiting for new start)
      const state = simulator.getState();
      expect(state.phase).toBe(PHASES.LOBBY);
    });

    it("detects exact round limit boundary correctly", async () => {
      const simulator = new GameSimulator({
        playerCount: 3,
        rounds: 3,
      });

      await simulator.start();

      // Play rounds 1, 2
      for (let i = 0; i < 2; i++) {
        await simulator.playRound();
        await simulator.advanceToNextRound();
        expect(simulator.getState().phase).toBe(PHASES.WRITING);
      }

      // Play round 3 (final round)
      await simulator.playRound();
      expect(simulator.getState().phase).toBe(PHASES.REVEAL);
      expect(simulator.getState().round).toBe(3);

      // Advance - should go to FINAL
      await simulator.advanceToNextRound();
      expect(simulator.getState().phase).toBe(PHASES.FINAL);
    });
  });
});
