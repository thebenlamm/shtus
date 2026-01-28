import type * as Party from "partykit/server";
import ShtusServer from "../../party/main";

// Mock connection that simulates a WebSocket connection
export class MockConnection implements Party.Connection {
  id: string;
  messages: string[] = [];
  closed: boolean = false;

  // Party.Connection interface (cast to satisfy type, not actually used in tests)
  socket: WebSocket = null as unknown as WebSocket;
  state: unknown = undefined;
  setState(state: unknown) { this.state = state; }

  // Minimal WebSocket-like URL for protocol
  url = "ws://test/";
  unstable_startSocket() { /* no-op */ }

  constructor(id: string) {
    this.id = id;
  }

  send(message: string): void {
    if (!this.closed) {
      this.messages.push(message);
    }
  }

  close(): void {
    this.closed = true;
  }

  getLastMessage(): unknown {
    const last = this.messages[this.messages.length - 1];
    return last ? JSON.parse(last) : null;
  }

  getAllMessages(): unknown[] {
    return this.messages.map((m) => JSON.parse(m));
  }

  clearMessages(): void {
    this.messages = [];
  }
}

// Mock room that tracks connections
export class MockRoom implements Party.Room {
  id: string;
  env: Record<string, string>;
  connections: Map<string, MockConnection> = new Map();
  storage: Party.Storage;
  context: Party.Context;

  // Track broadcast messages
  broadcastMessages: string[] = [];

  constructor(id: string = "test-room", env: Record<string, string> = {}) {
    this.id = id;
    this.env = env;
    this.storage = new MockStorage();
    this.context = {
      parties: {} as Party.Context["parties"],
      ai: {} as Party.Context["ai"],
    };
  }

  broadcast(message: string, without?: string[]): void {
    this.broadcastMessages.push(message);
    for (const conn of this.connections.values()) {
      if (!without?.includes(conn.id)) {
        conn.send(message);
      }
    }
  }

  getConnection(id: string): MockConnection | undefined {
    return this.connections.get(id);
  }

  getConnections(): IterableIterator<MockConnection> {
    return this.connections.values();
  }

  addConnection(id: string): MockConnection {
    const conn = new MockConnection(id);
    this.connections.set(id, conn);
    return conn;
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
  }

  // Partial implementations of Party.Room interface
  get parties(): Party.Context["parties"] {
    return this.context.parties;
  }

  get ai(): Party.Context["ai"] {
    return this.context.ai;
  }

  get internalID(): string {
    return this.id;
  }
}

// Mock storage (in-memory)
class MockStorage implements Party.Storage {
  private data: Map<string, unknown> = new Map();

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.data.get(key) as T | undefined);
  }

  async list<T>(): Promise<Map<string, T>> {
    return this.data as Map<string, T>;
  }

  put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<boolean> {
    const existed = this.data.has(key);
    this.data.delete(key);
    return Promise.resolve(existed);
  }

  deleteAll(): Promise<void> {
    this.data.clear();
    return Promise.resolve();
  }

  getAlarm(): Promise<number | null> {
    return Promise.resolve(null);
  }

  setAlarm(): Promise<void> {
    return Promise.resolve();
  }

  deleteAlarm(): Promise<void> {
    return Promise.resolve();
  }

  // Transactional methods
  transaction<T>(fn: (txn: Party.Storage) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

// Context for connection
export class MockConnectionContext implements Party.ConnectionContext {
  request: Request;

  constructor(url: string = "http://test/") {
    this.request = new Request(url);
  }
}

// Test server wrapper
export interface TestServer {
  server: ShtusServer;
  room: MockRoom;
  // Helper methods
  connect(playerId: string): MockConnection;
  disconnect(playerId: string): void;
  sendMessage(conn: MockConnection, message: object): void;
  joinPlayer(name: string, playerId?: string, adminKey?: string): MockConnection;
  getState(): unknown;
  waitForGeneration(): Promise<void>;
}

export function createTestServer(
  roomId: string = "test-room",
  env: Record<string, string> = {}
): TestServer {
  const room = new MockRoom(roomId, env);
  const server = new ShtusServer(room as unknown as Party.Room);

  return {
    server,
    room,

    connect(playerId: string): MockConnection {
      const conn = room.addConnection(playerId);
      const ctx = new MockConnectionContext();
      server.onConnect(conn as unknown as Party.Connection, ctx);
      return conn;
    },

    disconnect(playerId: string): void {
      const conn = room.getConnection(playerId);
      if (conn) {
        server.onClose(conn as unknown as Party.Connection);
        room.removeConnection(playerId);
      }
    },

    sendMessage(conn: MockConnection, message: object): void {
      server.onMessage(JSON.stringify(message), conn as unknown as Party.Connection);
    },

    joinPlayer(name: string, playerId?: string, adminKey?: string): MockConnection {
      const id = playerId || crypto.randomUUID();
      const conn = this.connect(id);
      // Clear initial messages (connected + state)
      conn.clearMessages();
      const joinMessage: Record<string, string> = { type: "join", name };
      if (adminKey) {
        joinMessage.adminKey = adminKey;
      }
      this.sendMessage(conn, joinMessage);
      return conn;
    },

    getState(): unknown {
      // Return the server's game state
      return server.state;
    },

    async waitForGeneration(): Promise<void> {
      // Wait for prompt generation to complete
      const maxWait = 5000;
      const startTime = Date.now();
      while (server.state.isGenerating && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      // Allow microtask queue to process (startRound is called after isGenerating=false)
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}
