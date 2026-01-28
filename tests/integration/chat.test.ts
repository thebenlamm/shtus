import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer, MockPlayer } from "../utils/mock-player";

describe("Chat Rate Limiting", () => {
  let server: TestServer;
  let player: MockPlayer;

  beforeEach(() => {
    server = createTestServer("chat-test", {});
    player = createMockPlayer(server, "Player");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rate limit enforcement", () => {
    it("allows 3 messages within 5 seconds", () => {
      player.chat("Message 1");
      player.chat("Message 2");
      player.chat("Message 3");

      // Check chat messages in server
      expect(server.server.chatMessages).toHaveLength(3);
    });

    it("blocks 4th message within 5 second window", () => {
      player.chat("Message 1");
      player.chat("Message 2");
      player.chat("Message 3");
      player.chat("Message 4"); // Should be blocked

      // Only 3 messages should have been recorded
      expect(server.server.chatMessages).toHaveLength(3);
    });

    it("allows messages after rate limit window expires", () => {
      const originalNow = Date.now;
      const startTime = Date.now();

      // Send 3 messages (at startTime)
      player.chat("Message 1");
      player.chat("Message 2");
      player.chat("Message 3");

      // 4th message should be blocked
      player.chat("Message 4");
      expect(server.server.chatMessages).toHaveLength(3);

      // Move time forward by 6 seconds
      vi.spyOn(Date, "now").mockReturnValue(startTime + 6000);

      // Now should be allowed
      player.chat("Message 5");
      expect(server.server.chatMessages).toHaveLength(4);

      // Restore
      Date.now = originalNow;
    });
  });

  describe("Per-player rate limiting", () => {
    it("rate limits are independent per player", () => {
      const player2 = createMockPlayer(server, "Player2");

      // Player1 sends 3 messages
      player.chat("P1 Message 1");
      player.chat("P1 Message 2");
      player.chat("P1 Message 3");

      // Player2 should still be able to send
      player2.chat("P2 Message 1");
      player2.chat("P2 Message 2");
      player2.chat("P2 Message 3");

      // All 6 messages should be recorded
      expect(server.server.chatMessages).toHaveLength(6);
    });
  });

  describe("Chat message validation", () => {
    it("rejects empty messages", () => {
      player.chat("");
      player.chat("   "); // Whitespace only

      expect(server.server.chatMessages).toHaveLength(0);
    });

    it("truncates messages over 150 characters", () => {
      const longMessage = "a".repeat(200);
      player.chat(longMessage);

      expect(server.server.chatMessages).toHaveLength(1);
      expect(server.server.chatMessages[0].text.length).toBe(150);
    });

    it("requires player to be joined", () => {
      // Create a connection that hasn't joined
      const rawConn = server.connect("unjoined");
      rawConn.clearMessages();

      // Try to chat without joining
      server.sendMessage(rawConn, { type: "chat", text: "Hello" });

      // Message should not be recorded
      expect(server.server.chatMessages).toHaveLength(0);
    });
  });

  describe("Chat broadcast", () => {
    it("broadcasts chat messages to all players", () => {
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      // Clear existing messages
      player.conn.clearMessages();
      player2.conn.clearMessages();
      player3.conn.clearMessages();

      // Player sends a message
      player.chat("Hello everyone!");

      // All players should receive the chat_message
      const allMessages = [
        ...player.conn.getAllMessages(),
        ...player2.conn.getAllMessages(),
        ...player3.conn.getAllMessages(),
      ];

      const chatMessages = allMessages.filter(
        (m: any) => m.type === "chat_message"
      );

      // Each player should receive the chat message
      expect(chatMessages.length).toBe(3);
    });

    it("includes player name in chat message", () => {
      player.chat("Test message");

      const chatMsg = server.server.chatMessages[0];
      expect(chatMsg.playerName).toBe("Player");
      expect(chatMsg.playerId).toBe(player.id);
    });
  });

  describe("Chat history", () => {
    it("sends chat history on connection", () => {
      // Add some chat messages
      player.chat("Message 1");
      player.chat("Message 2");

      // New player connects - use connect() directly to see chat_history
      const newConn = server.connect("new-player-id");

      // Should have received chat_history (sent on connect before join)
      const messages = newConn.getAllMessages() as { type: string; messages?: unknown[] }[];
      const historyMsg = messages.find((m) => m.type === "chat_history");

      expect(historyMsg).toBeDefined();
      expect(historyMsg?.messages).toHaveLength(2);
    });
  });
});
