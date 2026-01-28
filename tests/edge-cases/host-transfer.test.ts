import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer, TestServer } from "../utils/party-test-server";
import { createMockPlayer } from "../utils/mock-player";
import { type GameState } from "../../party/main";

describe("Host Transfer", () => {
  let server: TestServer;

  beforeEach(() => {
    server = createTestServer("host-test", {});
  });

  describe("On host disconnect", () => {
    it("transfers host to another connected active player", () => {
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      // Verify initial host
      let state = server.getState() as GameState;
      expect(state.hostId).toBe(host.id);

      // Host disconnects
      host.disconnect();

      state = server.getState() as GameState;

      // Host should transfer to one of the remaining players
      expect([player2.id, player3.id]).toContain(state.hostId);
    });

    it("prefers active players over voyeurs for host transfer", () => {
      const host = createMockPlayer(server, "Host");
      const voyeur = createMockPlayer(server, "Voyeur");
      const activePlayer = createMockPlayer(server, "Active");

      // Make voyeur a voyeur
      voyeur.toggleVoyeur();

      // Host disconnects
      host.disconnect();

      const state = server.getState() as GameState;

      // Should transfer to activePlayer, not voyeur
      expect(state.hostId).toBe(activePlayer.id);
    });

    it("sets host to null if no active players remain", () => {
      const host = createMockPlayer(server, "Host");
      const voyeur = createMockPlayer(server, "Voyeur");

      // Make voyeur a voyeur
      voyeur.toggleVoyeur();

      // Host disconnects
      host.disconnect();

      const state = server.getState() as GameState;

      // No active players remain, host should be null
      expect(state.hostId).toBeNull();
    });

    it("sets hostId to null if no players remain", () => {
      const host = createMockPlayer(server, "Host");

      host.disconnect();

      const state = server.getState() as GameState;
      expect(state.hostId).toBeNull();
    });
  });

  describe("Disconnected host on join", () => {
    it("new player becomes host if current host is disconnected", () => {
      const host = createMockPlayer(server, "Host");

      // Host disconnects
      host.disconnect();

      // New player joins
      const newPlayer = createMockPlayer(server, "NewPlayer");

      const state = server.getState() as GameState;
      expect(state.hostId).toBe(newPlayer.id);
    });

    it("reconnecting host regains host status if current host is disconnected", () => {
      const host = createMockPlayer(server, "OriginalHost");
      const player2 = createMockPlayer(server, "Player2");

      // Both disconnect
      player2.disconnect();
      host.disconnect();

      // Host reconnects
      host.reconnect();

      const state = server.getState() as GameState;
      expect(state.hostId).toBe(host.id);
    });
  });

  describe("Host transfer on voyeur toggle", () => {
    it("auto-transfers host when host becomes voyeur", () => {
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");

      // Verify initial host
      let state = server.getState() as GameState;
      expect(state.hostId).toBe(host.id);

      // Host becomes voyeur
      host.toggleVoyeur();

      state = server.getState() as GameState;

      // Host should transfer to player2
      expect(state.hostId).toBe(player2.id);
    });

    it("keeps host if no other active players when toggling voyeur", () => {
      const host = createMockPlayer(server, "Host");
      // Only one player (the host)

      // Try to toggle voyeur - should be blocked during LOBBY
      // Actually in lobby this is allowed, let's check the game state
      host.toggleVoyeur();

      const state = server.getState() as GameState;

      // In lobby with only one player, becoming voyeur is allowed
      // but there's no one to transfer host to
      // The host transfer logic finds no other active players
      // so host remains unchanged (self)
      // Actually looking at code, it sets hostId to newHost.id if found
      // If not found (no active players), hostId stays as current host
      expect(state.hostId).toBe(host.id); // Stays the same
    });
  });

  describe("Race condition handling", () => {
    it("handles simultaneous disconnect of multiple players", () => {
      const host = createMockPlayer(server, "Host");
      const player2 = createMockPlayer(server, "Player2");
      const player3 = createMockPlayer(server, "Player3");

      // Host and player2 disconnect at the same time
      host.disconnect();
      player2.disconnect();

      const state = server.getState() as GameState;

      // Only player3 remains - should be host
      expect(state.hostId).toBe(player3.id);
    });
  });
});
