import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer } from "../utils/mock-player";
import { type GameState } from "../../party/main";

describe("Admin Key Validation", () => {
  const ADMIN_KEY = "super-secret-admin-key-12345";
  let server: TestServer;

  beforeEach(() => {
    server = createTestServer("admin-test", {
      ADMIN_SECRET_KEY: ADMIN_KEY,
    });
  });

  describe("Admin authentication", () => {
    it("grants admin status with valid key", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);

      const state = server.getState() as GameState;
      expect(state.players[admin.id].isAdmin).toBe(true);
    });

    it("denies admin status with invalid key", () => {
      const notAdmin = createMockPlayer(server, "NotAdmin", undefined, "wrong-key");

      const state = server.getState() as GameState;
      expect(state.players[notAdmin.id].isAdmin).toBe(false);
    });

    it("denies admin status with no key", () => {
      const regular = createMockPlayer(server, "Regular");

      const state = server.getState() as GameState;
      expect(state.players[regular.id].isAdmin).toBe(false);
    });

    it("denies admin status with empty key", () => {
      const emptyKey = createMockPlayer(server, "EmptyKey", undefined, "");

      const state = server.getState() as GameState;
      expect(state.players[emptyKey.id].isAdmin).toBe(false);
    });

    it("re-validates admin on reconnect", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);
      const adminId = admin.id;

      // Verify admin status
      let state = server.getState() as GameState;
      expect(state.players[adminId].isAdmin).toBe(true);

      // Disconnect
      admin.disconnect();

      // Reconnect WITHOUT admin key
      server.joinPlayer("Admin", adminId); // No admin key

      state = server.getState() as GameState;
      // Should lose admin status since they didn't provide key on reconnect
      expect(state.players[adminId].isAdmin).toBe(false);
    });
  });

  describe("Per-action admin validation", () => {
    it("rejects admin-set-override from non-admin", () => {
      const regular = createMockPlayer(server, "Regular");
      createMockPlayer(server, "Admin", undefined, ADMIN_KEY); // Admin exists but action is from regular

      // Regular player tries to set exact question
      regular.setExactQuestion("Hacked question");

      const state = server.getState() as GameState;
      expect(state.exactQuestion).toBeNull();
    });

    it("accepts admin-set-override from admin", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);

      admin.setExactQuestion("Admin's question");

      const state = server.getState() as GameState;
      expect(state.exactQuestion).toBe("Admin's question");
    });
  });

  describe("exactQuestion override", () => {
    it("uses exactQuestion instead of AI-generated prompt", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "AI prompt" } }],
        }))
      );

      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);
      createMockPlayer(server, "Player2"); // Need 2 players to start

      // Admin sets exact question
      admin.setExactQuestion("Admin's custom question?");

      // Start game
      server.sendMessage(admin.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      const state = server.getState() as GameState;

      // Should use admin's question, not AI
      expect(state.currentPrompt).toBe("Admin's custom question?");
      expect(state.promptSource).toBe("admin");
    });

    it("clears exactQuestion after use (one-time)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          choices: [{ message: { content: "AI prompt" } }],
        }))
      );

      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);
      createMockPlayer(server, "Player2"); // Need 2 players to start

      admin.setExactQuestion("One-time question");

      server.sendMessage(admin.conn, {
        type: "start",
        theme: "test",
        roundLimit: 3,
      });
      await server.waitForGeneration();

      // exactQuestion should be cleared after use
      const state = server.getState() as GameState;
      expect(state.exactQuestion).toBeNull();
    });
  });

  describe("promptGuidance", () => {
    it("sets and persists prompt guidance", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);

      admin.setPromptGuidance("Focus on food-related topics");

      const state = server.getState() as GameState;
      expect(state.promptGuidance).toBe("Focus on food-related topics");
    });

    it("clears prompt guidance with null", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);

      admin.setPromptGuidance("Some guidance");
      admin.setPromptGuidance(null);

      const state = server.getState() as GameState;
      expect(state.promptGuidance).toBeNull();
    });

    it("sanitizes prompt guidance input", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);

      // Try to inject with special characters
      admin.setPromptGuidance("<script>alert('xss')</script>");

      const state = server.getState() as GameState;
      // Should be sanitized (special chars removed)
      expect(state.promptGuidance).not.toContain("<");
      expect(state.promptGuidance).not.toContain(">");
    });
  });

  describe("Admin state privacy", () => {
    it("does not expose isAdmin in broadcast state", () => {
      const admin = createMockPlayer(server, "Admin", undefined, ADMIN_KEY);
      const regular = createMockPlayer(server, "Regular");

      // Get the state that regular player receives
      const regularState = regular.getLastState();
      const players = regularState?.players as { id: string; isAdmin?: boolean }[];

      // Find admin in the player list
      const adminInList = players.find((p) => p.id === admin.id);

      // isAdmin should not be exposed (stripped from broadcast)
      expect(adminInList?.isAdmin).toBeUndefined();
    });
  });
});
