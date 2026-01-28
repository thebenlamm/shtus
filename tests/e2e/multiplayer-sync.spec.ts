import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Multiplayer Sync Test - Verify real-time state synchronization
 *
 * 4 browser contexts simulate 4 players to verify:
 * - All players see same state updates
 * - Answers/votes broadcast in real-time
 * - Player list updates for all
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

test.describe("Multiplayer Sync", () => {
  test("4 players see synchronized state", async ({ browser }) => {
    const roomId = `sync-${Date.now()}`;

    // Create 4 separate browser contexts (simulates 4 different users)
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);

    const players: Page[] = [];
    const names = ["Alice", "Bob", "Charlie", "Diana"];

    // Join all players
    for (let i = 0; i < 4; i++) {
      const page = await createPlayer(contexts[i], roomId, names[i]);
      players.push(page);
    }

    const [host, ...others] = players;

    // Wait for all to be in lobby
    await Promise.all(players.map((p) => waitForPhase(p, "lobby")));

    // Verify all players see each other
    for (const player of players) {
      for (const name of names) {
        await expect(player.getByTestId("player-list")).toContainText(name);
      }
    }

    // Host starts game
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    // All should transition to writing together
    await Promise.all(players.map((p) => waitForPhase(p, "writing")));

    // Verify all see the same prompt
    const prompts = await Promise.all(
      players.map((p) => p.getByTestId("current-prompt").textContent())
    );
    const firstPrompt = prompts[0];
    for (const prompt of prompts) {
      expect(prompt).toBe(firstPrompt);
    }

    // All players submit answers
    for (let i = 0; i < players.length; i++) {
      await players[i].getByTestId("answer-input").fill(`${names[i]}'s answer`);
      await players[i].getByTestId("submit-answer-btn").click();
    }

    // Auto-transition to voting phase when all players submit
    await Promise.all(players.map((p) => waitForPhase(p, "voting")));

    // Verify all see the same number of vote options (3 each - can't vote for self)
    for (const player of players) {
      const options = player.getByTestId("vote-options").locator("button");
      await expect(options).toHaveCount(3);
    }

    // All players vote for first available option
    for (const player of players) {
      await player.getByTestId("answer-option-0").click();
    }

    // Auto-transition to reveal phase when all players vote
    await Promise.all(players.map((p) => waitForPhase(p, "reveal")));

    // Verify all see results
    for (const player of players) {
      await expect(player.getByRole("heading", { name: "Results" })).toBeVisible();
    }

    // Cleanup
    for (const player of players) {
      await player.close();
    }
    for (const ctx of contexts) {
      await ctx.close();
    }
  });

  test("player list updates in real-time when new player joins", async ({
    browser,
  }) => {
    const roomId = `join-sync-${Date.now()}`;

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    // First player joins
    const host = await createPlayer(ctx1, roomId, "FirstPlayer");
    await waitForPhase(host, "lobby");

    // Verify only one player visible
    await expect(host.getByTestId("player-list")).toContainText("FirstPlayer");

    // Second player joins
    const player2 = await createPlayer(ctx2, roomId, "SecondPlayer");
    await waitForPhase(player2, "lobby");

    // Both should now see both players
    await expect(host.getByTestId("player-list")).toContainText("SecondPlayer");
    await expect(player2.getByTestId("player-list")).toContainText("FirstPlayer");

    await host.close();
    await player2.close();
    await ctx1.close();
    await ctx2.close();
  });

  test("submission progress updates in real-time", async ({ browser }) => {
    const roomId = `progress-${Date.now()}`;

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const host = await createPlayer(ctx1, roomId, "Host");
    const player2 = await createPlayer(ctx2, roomId, "Player2");

    await Promise.all([waitForPhase(host, "lobby"), waitForPhase(player2, "lobby")]);

    // Start game
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    await Promise.all([
      waitForPhase(host, "writing"),
      waitForPhase(player2, "writing"),
    ]);

    // Host submits
    await host.getByTestId("answer-input").fill("Host answer");
    await host.getByTestId("submit-answer-btn").click();

    // Player2 should see updated submission count (1/2)
    await expect(player2.locator("text=Submitted: 1/2")).toBeVisible();

    // Player2 submits
    await player2.getByTestId("answer-input").fill("Player2 answer");
    await player2.getByTestId("submit-answer-btn").click();

    // Auto-transition to voting phase when all players submit
    await Promise.all([
      waitForPhase(host, "voting"),
      waitForPhase(player2, "voting"),
    ]);

    await host.close();
    await player2.close();
    await ctx1.close();
    await ctx2.close();
  });
});
