import { createTestServer, TestServer } from "./party-test-server";
import { createMockPlayer, createPlayers, MockPlayer } from "./mock-player";
import { PHASES, type GameState } from "../../party/main";

export interface GameSimulatorOptions {
  /** Number of players (default: 3) */
  playerCount?: number;
  /** Number of rounds (null = endless) */
  rounds?: number | null;
  /** Number of players in voyeur mode (default: 0) */
  voyeurs?: number;
  /** Theme for the game (default: "test theme") */
  theme?: string;
  /** Room ID (default: random UUID) */
  roomId?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface SimulatedRound {
  round: number;
  prompt: string;
  answers: Map<string, string>;
  votes: Map<string, number>;
  winnerId: string | null;
  winnerScore: number;
}

export interface GameResult {
  rounds: SimulatedRound[];
  finalScores: Map<string, number>;
  winnerId: string;
  winnerName: string;
  winnerScore: number;
  totalPlayers: number;
  voyeurCount: number;
}

/**
 * GameSimulator - Helper class for running automated game simulations in tests
 *
 * Usage:
 * ```ts
 * const simulator = new GameSimulator({ playerCount: 4, rounds: 3 });
 * const result = await simulator.runFullGame();
 * expect(result.winnerId).toBeDefined();
 * ```
 */
export class GameSimulator {
  server: TestServer;
  players: MockPlayer[];
  host: MockPlayer;
  options: Required<GameSimulatorOptions>;
  rounds: SimulatedRound[] = [];

  constructor(options: GameSimulatorOptions = {}) {
    this.options = {
      playerCount: options.playerCount ?? 3,
      // Use 'in' check to distinguish explicit null from undefined
      rounds: "rounds" in options ? options.rounds ?? null : 3,
      voyeurs: options.voyeurs ?? 0,
      theme: options.theme ?? "test theme",
      roomId: options.roomId ?? `test-${crypto.randomUUID().slice(0, 8)}`,
      env: options.env ?? {},
    };

    // Validate options
    if (this.options.playerCount < 2) {
      throw new Error("Need at least 2 players");
    }
    if (this.options.voyeurs >= this.options.playerCount) {
      throw new Error("Cannot have all players as voyeurs");
    }
    if (
      this.options.rounds !== null &&
      ![3, 5, 10].includes(this.options.rounds)
    ) {
      throw new Error("Round limit must be 3, 5, 10, or null (endless)");
    }

    // Create server and players
    this.server = createTestServer(this.options.roomId, this.options.env);
    this.players = createPlayers(this.server, this.options.playerCount);
    this.host = this.players[0];

    // Set up voyeurs
    for (let i = 0; i < this.options.voyeurs; i++) {
      // Make last N players voyeurs
      const voyeurIndex = this.options.playerCount - 1 - i;
      this.players[voyeurIndex].toggleVoyeur();
    }
  }

  get activePlayers(): MockPlayer[] {
    const state = this.getState();
    return this.players.filter((p) => {
      const playerState = state.players[p.id];
      return playerState && !playerState.isVoyeur;
    });
  }

  getState(): GameState {
    return this.server.getState() as GameState;
  }

  /**
   * Start the game
   */
  async start(): Promise<void> {
    this.server.sendMessage(this.host.conn, {
      type: "start",
      theme: this.options.theme,
      roundLimit: this.options.rounds,
    });
    await this.server.waitForGeneration();
  }

  /**
   * Play a single round
   */
  async playRound(): Promise<SimulatedRound> {
    const state = this.getState();
    if (state.phase !== PHASES.WRITING) {
      throw new Error(`Expected WRITING phase, got ${state.phase}`);
    }

    const currentRound = state.round;
    const prompt = state.currentPrompt;
    const answers = new Map<string, string>();
    const votes = new Map<string, number>();

    // Active players submit answers
    for (const player of this.activePlayers) {
      const answer = `${player.name}'s answer for round ${currentRound}`;
      player.answer(answer);
      answers.set(player.id, answer);
    }

    // Host ends writing
    this.server.sendMessage(this.host.conn, { type: "end-writing" });

    const votingState = this.getState();
    if (votingState.phase !== PHASES.VOTING) {
      throw new Error(`Expected VOTING phase, got ${votingState.phase}`);
    }

    // Each active player votes for someone else's answer
    for (const player of this.activePlayers) {
      const answerOrder = votingState.answerOrder;
      const selfIndex = answerOrder.indexOf(player.id);
      // Vote for next player's answer (circular)
      const voteIndex = (selfIndex + 1) % answerOrder.length;
      player.vote(voteIndex);
      votes.set(player.id, voteIndex);
    }

    // Host ends voting
    this.server.sendMessage(this.host.conn, { type: "end-voting" });

    const revealState = this.getState();
    if (revealState.phase !== PHASES.REVEAL) {
      throw new Error(`Expected REVEAL phase, got ${revealState.phase}`);
    }

    // Find round winner
    const answerOrder = revealState.answerOrder;
    let maxVotes = 0;
    let winnerId: string | null = null;
    for (const playerId of answerOrder) {
      const voteCount = revealState.votes[playerId] || 0;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winnerId = playerId;
      }
    }

    const roundResult: SimulatedRound = {
      round: currentRound,
      prompt,
      answers,
      votes,
      winnerId,
      winnerScore: winnerId ? revealState.players[winnerId].score : 0,
    };

    this.rounds.push(roundResult);
    return roundResult;
  }

  /**
   * Advance to next round (or FINAL)
   */
  async advanceToNextRound(): Promise<void> {
    await this.server.waitForGeneration();
    this.server.sendMessage(this.host.conn, { type: "next-round" });
  }

  /**
   * Run a complete game from lobby to final
   */
  async runFullGame(): Promise<GameResult> {
    await this.start();

    const roundLimit = this.options.rounds;
    const maxRounds = roundLimit ?? 100; // Safety limit for endless mode testing

    for (let i = 0; i < maxRounds; i++) {
      await this.playRound();
      await this.advanceToNextRound();

      const state = this.getState();
      if (state.phase === PHASES.FINAL) {
        break;
      }
    }

    return this.getResults();
  }

  /**
   * Run N rounds without advancing to final (for endless mode testing)
   */
  async runRounds(count: number): Promise<SimulatedRound[]> {
    await this.start();

    const roundResults: SimulatedRound[] = [];
    for (let i = 0; i < count; i++) {
      const result = await this.playRound();
      roundResults.push(result);

      const state = this.getState();
      if (state.phase === PHASES.FINAL) {
        break;
      }

      await this.advanceToNextRound();
    }

    return roundResults;
  }

  /**
   * Get game results
   */
  getResults(): GameResult {
    const state = this.getState();
    const finalScores = new Map<string, number>();

    let winnerId = "";
    let winnerName = "";
    let winnerScore = 0;

    for (const [id, player] of Object.entries(state.players)) {
      finalScores.set(id, player.score);
      if (player.score > winnerScore) {
        winnerId = id;
        winnerName = player.name;
        winnerScore = player.score;
      }
    }

    return {
      rounds: this.rounds,
      finalScores,
      winnerId,
      winnerName,
      winnerScore,
      totalPlayers: this.options.playerCount,
      voyeurCount: this.options.voyeurs,
    };
  }

  /**
   * Add a late joiner mid-game
   */
  addLateJoiner(name: string): MockPlayer {
    const player = createMockPlayer(this.server, name);
    this.players.push(player);
    return player;
  }

  /**
   * Restart the game (from FINAL phase)
   */
  restart(): void {
    this.server.sendMessage(this.host.conn, { type: "restart" });
    this.rounds = [];
  }
}

/**
 * Convenience function for simple full-game simulations
 */
export async function simulateFullGame(
  playerCount: number = 3,
  rounds: number = 3,
  options?: Partial<GameSimulatorOptions>
): Promise<GameResult> {
  const simulator = new GameSimulator({
    playerCount,
    rounds,
    ...options,
  });
  return simulator.runFullGame();
}
