import type { TestServer, MockConnection } from "./party-test-server";

export interface MockPlayer {
  conn: MockConnection;
  id: string;
  name: string;
  // Actions
  answer(text: string): void;
  vote(answerId: number): void;
  chat(text: string): void;
  toggleVoyeur(): void;
  disconnect(): void;
  reconnect(): MockConnection;
  // Admin actions
  setExactQuestion(question: string | null): void;
  setPromptGuidance(guidance: string | null): void;
  // Getters
  getLastState(): Record<string, unknown> | null;
  getLastChatMessage(): Record<string, unknown> | null;
  getAllStates(): Record<string, unknown>[];
}

export function createMockPlayer(
  server: TestServer,
  name: string,
  playerId?: string,
  adminKey?: string
): MockPlayer {
  const id = playerId || crypto.randomUUID();
  let conn = server.joinPlayer(name, id, adminKey);

  return {
    conn,
    id,
    name,

    answer(text: string): void {
      server.sendMessage(conn, { type: "answer", answer: text });
    },

    vote(answerId: number): void {
      server.sendMessage(conn, { type: "vote", votedFor: answerId });
    },

    chat(text: string): void {
      server.sendMessage(conn, { type: "chat", text });
    },

    toggleVoyeur(): void {
      server.sendMessage(conn, { type: "toggle-voyeur" });
    },

    disconnect(): void {
      server.disconnect(id);
    },

    reconnect(): MockConnection {
      conn = server.joinPlayer(name, id);
      return conn;
    },

    setExactQuestion(question: string | null): void {
      server.sendMessage(conn, {
        type: "admin-set-override",
        exactQuestion: question,
      });
    },

    setPromptGuidance(guidance: string | null): void {
      server.sendMessage(conn, {
        type: "admin-set-override",
        promptGuidance: guidance,
      });
    },

    getLastState(): Record<string, unknown> | null {
      const messages = conn.getAllMessages() as Record<string, unknown>[];
      const states = messages.filter((m) => m.type === "state");
      return states.length > 0 ? states[states.length - 1] : null;
    },

    getLastChatMessage(): Record<string, unknown> | null {
      const messages = conn.getAllMessages() as Record<string, unknown>[];
      const chatMsgs = messages.filter((m) => m.type === "chat_message");
      return chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;
    },

    getAllStates(): Record<string, unknown>[] {
      const messages = conn.getAllMessages() as Record<string, unknown>[];
      return messages.filter((m) => m.type === "state") as Record<string, unknown>[];
    },
  };
}

// Helper to create multiple players at once
export function createPlayers(
  server: TestServer,
  count: number,
  namePrefix: string = "Player"
): MockPlayer[] {
  const players: MockPlayer[] = [];
  for (let i = 1; i <= count; i++) {
    players.push(createMockPlayer(server, `${namePrefix}${i}`));
  }
  return players;
}
