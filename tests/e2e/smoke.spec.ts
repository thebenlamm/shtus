import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Smoke Test - Basic game flow verification
 *
 * 2 players complete 1 round to verify core functionality:
 * join → lobby → writing → voting → reveal
 */

// Helper to create a player page with a unique name
async function createPlayer(
  context: BrowserContext,
  roomId: string,
  name: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/game/${roomId}?name=${encodeURIComponent(name)}`);
  return page;
}

// Helper to wait for game state to sync
async function waitForPhase(page: Page, phase: string, timeout = 10000) {
  await page.waitForSelector(`[data-testid="${phase}-phase"]`, { timeout });
}

test.describe("Smoke Test", () => {
  test("2 players complete 1 round", async ({ browser }) => {
    // Generate unique room ID
    const roomId = `smoke-${Date.now()}`;

    // Use separate browser contexts so each player has their own localStorage
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    // Create two players
    const host = await createPlayer(ctx1, roomId, "Host");
    const player2 = await createPlayer(ctx2, roomId, "Player2");

    // Both should be in lobby
    await waitForPhase(host, "lobby");
    await waitForPhase(player2, "lobby");

    // Verify both players are visible in the player list
    await expect(host.getByTestId("player-list")).toContainText("Host");
    await expect(host.getByTestId("player-list")).toContainText("Player2");

    // Host configures and starts game
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    // Both should transition to writing phase
    await waitForPhase(host, "writing");
    await waitForPhase(player2, "writing");

    // Verify prompt is displayed
    const prompt = host.getByTestId("current-prompt");
    await expect(prompt).toBeVisible();
    const promptText = await prompt.textContent();
    expect(promptText).toBeTruthy();

    // Both players submit answers
    await host.getByTestId("answer-input").fill("Host's funny answer");
    await host.getByTestId("submit-answer-btn").click();

    await player2.getByTestId("answer-input").fill("Player2's hilarious response");
    await player2.getByTestId("submit-answer-btn").click();

    // Auto-transition to voting phase when all players submit
    await waitForPhase(host, "voting");
    await waitForPhase(player2, "voting");

    // Each player votes for the other's answer
    // Host votes for Player2's answer (first option since can't vote for self)
    await host.getByTestId("answer-option-0").click();

    // Player2 votes for Host's answer
    await player2.getByTestId("answer-option-0").click();

    // Auto-transition to reveal phase when all players vote
    await waitForPhase(host, "reveal");
    await waitForPhase(player2, "reveal");

    // Verify results are shown
    await expect(host.getByRole("heading", { name: "Results" })).toBeVisible();

    // Host advances to next round (will go to round 2)
    // Wait a bit for prompt pre-generation to complete
    await host.waitForTimeout(2000);
    await host.getByTestId("next-round-btn").click();

    // Should be in writing phase for round 2 (use longer timeout for prompt gen)
    await waitForPhase(host, "writing", 15000);
    await waitForPhase(player2, "writing", 15000);

    // Verify round counter
    await expect(host.getByTestId("round-indicator")).toContainText("Round 2");

    // Clean up
    await host.close();
    await player2.close();
    await ctx1.close();
    await ctx2.close();
  });

  test("player sees connection status while joining", async ({ page }) => {
    const roomId = `connection-${Date.now()}`;

    // Navigate to game
    await page.goto(`/game/${roomId}?name=TestPlayer`);

    // Should eventually connect and show lobby
    await waitForPhase(page, "lobby", 15000);

    // Room code should be visible
    await expect(page.getByTestId("room-code")).toContainText(roomId);
  });

  test("non-host cannot start game", async ({ browser }) => {
    const roomId = `nohost-${Date.now()}`;

    // Use separate browser contexts
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const host = await createPlayer(ctx1, roomId, "Host");
    const player2 = await createPlayer(ctx2, roomId, "Player2");

    await waitForPhase(host, "lobby");
    await waitForPhase(player2, "lobby");

    // Start button should only be visible for host
    await expect(host.getByTestId("start-game-btn")).toBeVisible();

    // Player2 should not see start button
    const player2StartBtn = player2.getByTestId("start-game-btn");
    await expect(player2StartBtn).not.toBeVisible();

    await host.close();
    await player2.close();
    await ctx1.close();
    await ctx2.close();
  });
});
