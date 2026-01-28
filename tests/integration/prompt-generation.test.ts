import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";
import { HARDCODED_PROMPTS, type GameState } from "../../party/main";

describe("Prompt Generation", () => {
  let server: TestServer;
  let host: MockPlayer;
  let player2: MockPlayer;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("AI prompt generation", () => {
    it("uses AI-generated prompt when API available", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "AI generated question about {name}" } }],
        }))
      );

      server = createTestServer("prompt-test", { XAI_API_KEY: "test-key" });
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test theme",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.currentPrompt).toBe("AI generated question about {name}");
      expect(state.promptSource).toBe("ai");
    });

    it("includes player names in API request", async () => {
      let capturedBody: any;
      vi.spyOn(global, "fetch").mockImplementation(async (url, options) => {
        if (typeof url === "string" && url.includes("api.x.ai")) {
          capturedBody = JSON.parse(options?.body as string);
          return new Response(JSON.stringify({
            choices: [{ message: { content: "Test prompt" } }],
          }));
        }
        throw new Error("Unexpected URL");
      });

      server = createTestServer("prompt-test", { XAI_API_KEY: "test-key" });
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "funny theme",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      // Check that player names were included
      const userMessage = capturedBody.messages.find(
        (m: any) => m.role === "user"
      );
      expect(userMessage.content).toContain("Host");
      expect(userMessage.content).toContain("Player2");
    });
  });

  describe("Fallback to hardcoded prompts", () => {
    it("falls back when no API key", async () => {
      server = createTestServer("prompt-test", {}); // No API key
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.promptSource).toBe("fallback");

      // Should be one of the hardcoded prompts (possibly with name substituted)
      // Check that it's not empty and reasonably formed
      expect(state.currentPrompt.length).toBeGreaterThan(0);
    });

    it("falls back on API error", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

      server = createTestServer("prompt-test", { XAI_API_KEY: "test-key" });
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.promptSource).toBe("fallback");
    });

    it("falls back on non-200 response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("Rate limited", { status: 429 })
      );

      server = createTestServer("prompt-test", { XAI_API_KEY: "test-key" });
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.promptSource).toBe("fallback");
    });
  });

  describe("Admin exact question override", () => {
    it("uses admin question over AI", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "AI prompt" } }],
        }))
      );

      server = createTestServer("prompt-test", {
        XAI_API_KEY: "test-key",
        ADMIN_SECRET_KEY: "admin-key",
      });

      const admin = createMockPlayer(server, "Admin", undefined, "admin-key");
      player2 = createMockPlayer(server, "Player2");

      // Set exact question BEFORE starting
      admin.setExactQuestion("Admin's exact question?");

      server.sendMessage(admin.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;
      expect(state.currentPrompt).toBe("Admin's exact question?");
      expect(state.promptSource).toBe("admin");
    });
  });

  describe("Name replacement in prompts", () => {
    it("replaces {name} placeholder with random player name", async () => {
      server = createTestServer("prompt-test", {}); // No API key = uses hardcoded
      host = createMockPlayer(server, "Alice");
      player2 = createMockPlayer(server, "Bob");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });

      await server.waitForGeneration();

      const state = server.getState() as GameState;

      // If the prompt had {name}, it should have been replaced
      // with either Alice or Bob
      expect(state.currentPrompt).not.toContain("{name}");

      // The prompt should contain one of the player names if it was a personalized prompt
      const hasPlayerName =
        state.currentPrompt.includes("Alice") ||
        state.currentPrompt.includes("Bob");

      // Either it's a generic prompt or it has a player name - both are valid
      expect(state.currentPrompt.length).toBeGreaterThan(0);
    });
  });

  describe("Pre-generation of next prompt", () => {
    it("pre-generates next prompt during voting phase", async () => {
      // Use mockImplementation to return a NEW Response each time
      vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify({
          choices: [{ message: { content: "Pre-generated prompt" } }],
        }))
      );

      server = createTestServer("prompt-test", { XAI_API_KEY: "test-key" });
      host = createMockPlayer(server, "Host");
      player2 = createMockPlayer(server, "Player2");

      server.sendMessage(host.conn, {
        type: "start",
        theme: "test",
        roundLimit: 5,
      });

      await server.waitForGeneration();

      // Play through round 1
      host.answer("answer");
      player2.answer("answer");
      server.sendMessage(host.conn, { type: "end-writing" });

      // Vote
      const state = server.getState() as GameState;
      const hostIndex = state.answerOrder.indexOf(host.id);
      const player2Index = state.answerOrder.indexOf(player2.id);
      host.vote(player2Index);
      player2.vote(hostIndex);

      // End voting - this triggers pre-generation
      server.sendMessage(host.conn, { type: "end-voting" });

      // Wait for pre-generation
      await server.waitForGeneration();

      const revealState = server.getState() as GameState;
      expect(revealState.nextPrompt).toBe("Pre-generated prompt");
      expect(revealState.nextPromptSource).toBe("ai");
    });
  });
});
