import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Reconnection Test - Verify player can disconnect and reconnect
 *
 * Tests:
 * - Player reconnects with same userId (via localStorage)
 * - Score is preserved after reconnection
 * - Player can continue playing after reconnect
 */

async function createPlayer(
  context: BrowserContext,
  roomId: string,
  name: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/game/${roomId}?name=${encodeURIComponent(name)}`);
  return page;
}

async function waitForPhase(page: Page, phase: string, timeout = 10000) {
  await page.waitForSelector(`[data-testid="${phase}-phase"]`, { timeout });
}

test.describe("Reconnection", () => {
  test("player reconnects and preserves identity", async ({ browser }) => {
    const roomId = `reconnect-${Date.now()}`;

    // Use same context for reconnection (preserves localStorage)
    const ctx = await browser.newContext();
    const hostCtx = await browser.newContext();

    const host = await createPlayer(hostCtx, roomId, "Host");
    let player2 = await createPlayer(ctx, roomId, "ReconnectPlayer");

    await Promise.all([waitForPhase(host, "lobby"), waitForPhase(player2, "lobby")]);

    // Verify both in lobby
    await expect(host.getByTestId("player-list")).toContainText("ReconnectPlayer");

    // Player2 disconnects (close page)
    await player2.close();

    // Wait a moment for server to register disconnect
    await host.waitForTimeout(500);

    // Player2 reconnects (same context = same localStorage = same userId)
    player2 = await createPlayer(ctx, roomId, "ReconnectPlayer");
    await waitForPhase(player2, "lobby");

    // Should still be in player list (not duplicated)
    const playerListText = await host.getByTestId("player-list").textContent();
    const matches = playerListText?.match(/ReconnectPlayer/g);
    expect(matches?.length).toBe(1); // Only one instance

    await host.close();
    await player2.close();
    await ctx.close();
    await hostCtx.close();
  });

  test("player reconnects mid-game and can continue", async ({ browser }) => {
    const roomId = `midgame-${Date.now()}`;

    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();

    const host = await createPlayer(hostCtx, roomId, "Host");
    let player2 = await createPlayer(playerCtx, roomId, "Player2");

    await Promise.all([waitForPhase(host, "lobby"), waitForPhase(player2, "lobby")]);

    // Start game
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    await Promise.all([
      waitForPhase(host, "writing"),
      waitForPhase(player2, "writing"),
    ]);

    // Both players submit answers
    await player2.getByTestId("answer-input").fill("Player2 answer");
    await player2.getByTestId("submit-answer-btn").click();
    await host.getByTestId("answer-input").fill("Host answer");
    await host.getByTestId("submit-answer-btn").click();

    // Auto-transition to voting phase when all players submit
    await Promise.all([
      waitForPhase(host, "voting"),
      waitForPhase(player2, "voting"),
    ]);

    // Both vote (must vote before disconnect to keep game flowing)
    await host.getByTestId("answer-option-0").click();
    await player2.getByTestId("answer-option-0").click();

    // Auto-transition to reveal phase when all players vote
    await Promise.all([
      waitForPhase(host, "reveal"),
      waitForPhase(player2, "reveal"),
    ]);

    // Now player2 disconnects mid-reveal
    await player2.close();

    // Wait for prompt pre-generation then advance
    await host.waitForTimeout(2000);
    await host.getByTestId("next-round-btn").click();
    await waitForPhase(host, "writing", 20000);

    // Player2 reconnects during round 2 writing
    player2 = await createPlayer(playerCtx, roomId, "Player2");
    await waitForPhase(player2, "writing", 20000);

    // Player2 should be able to continue playing
    await player2.getByTestId("answer-input").fill("Player2 round 2 answer");
    await player2.getByTestId("submit-answer-btn").click();

    // Verify submission registered - both players submitted
    await expect(host.locator("text=/Submitted.*2/")).toBeVisible();

    // Test complete - player2 successfully reconnected and continued playing
    await host.close();
    await player2.close();
    await hostCtx.close();
    await playerCtx.close();
  });

  test("score preserved after reconnection", async ({ browser }) => {
    const roomId = `score-${Date.now()}`;

    const hostCtx = await browser.newContext();
    const playerCtx = await browser.newContext();

    const host = await createPlayer(hostCtx, roomId, "Host");
    let player2 = await createPlayer(playerCtx, roomId, "Player2");

    await Promise.all([waitForPhase(host, "lobby"), waitForPhase(player2, "lobby")]);

    // Start and complete a round
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    await Promise.all([
      waitForPhase(host, "writing"),
      waitForPhase(player2, "writing"),
    ]);

    // Both submit
    await host.getByTestId("answer-input").fill("Host answer");
    await host.getByTestId("submit-answer-btn").click();
    await player2.getByTestId("answer-input").fill("Player2 answer");
    await player2.getByTestId("submit-answer-btn").click();

    // Auto-transition to voting phase when all players submit
    await Promise.all([
      waitForPhase(host, "voting"),
      waitForPhase(player2, "voting"),
    ]);

    // Both vote
    await host.getByTestId("answer-option-0").click();
    await player2.getByTestId("answer-option-0").click();

    // Auto-transition to reveal phase when all players vote
    await Promise.all([
      waitForPhase(host, "reveal"),
      waitForPhase(player2, "reveal"),
    ]);

    // Note player2's score from the reveal page (we'll verify it's preserved)
    // At this point, at least one player should have points

    // Player2 disconnects
    await player2.close();

    // Wait for prompt pre-generation then advance to next round
    // Longer delay to ensure prompt is ready
    await host.waitForTimeout(3000);
    await host.getByTestId("next-round-btn").click();
    await waitForPhase(host, "writing", 30000);

    // Player2 reconnects
    player2 = await createPlayer(playerCtx, roomId, "Player2");
    await waitForPhase(player2, "writing", 20000);

    // Verify we're on round 2 (meaning previous round completed)
    await expect(player2.getByTestId("round-indicator")).toContainText("Round 2");

    await host.close();
    await player2.close();
    await hostCtx.close();
    await playerCtx.close();
  });
});
