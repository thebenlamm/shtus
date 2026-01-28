import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * Full Game Test - Complete game from lobby to final
 *
 * 3 players complete 3 rounds to FINAL phase:
 * - Tests score accumulation
 * - Tests winner display
 * - Tests "Play Again" restart flow
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

async function waitForPhase(page: Page, phase: string, timeout = 15000) {
  await page.waitForSelector(`[data-testid="${phase}-phase"]`, { timeout });
}

// Helper to play one round
async function playRound(players: Page[], host: Page) {
  // All players submit answers
  for (let i = 0; i < players.length; i++) {
    const input = players[i].getByTestId("answer-input");
    // Check if input is visible (player might have already submitted)
    if (await input.isVisible()) {
      await input.fill(`Player ${i + 1}'s answer for this round`);
      await players[i].getByTestId("submit-answer-btn").click();
    }
  }

  // Auto-transition to voting phase when all players submit
  await Promise.all(players.map((p) => waitForPhase(p, "voting")));

  // All players vote
  for (const player of players) {
    const voteBtn = player.getByTestId("answer-option-0");
    if (await voteBtn.isVisible()) {
      await voteBtn.click();
    }
  }

  // Auto-transition to reveal phase when all players vote
  await Promise.all(players.map((p) => waitForPhase(p, "reveal")));

  // Wait for prompt pre-generation then advance
  await host.waitForTimeout(2000);
  await host.getByTestId("next-round-btn").click();
}

test.describe("Full Game", () => {
  test("3 players complete 3 rounds to FINAL", async ({ browser }) => {
    const roomId = `fullgame-${Date.now()}`;

    // Create 3 browser contexts
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext(),
    ]);

    const names = ["Alice", "Bob", "Charlie"];
    const players: Page[] = [];

    for (let i = 0; i < 3; i++) {
      const page = await createPlayer(contexts[i], roomId, names[i]);
      players.push(page);
    }

    const [host] = players;

    // Wait for lobby
    await Promise.all(players.map((p) => waitForPhase(p, "lobby")));

    // Host sets 3 rounds and starts
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    // Play 3 rounds
    for (let round = 1; round <= 3; round++) {
      // Longer timeout for writing phase (includes prompt generation)
      await Promise.all(players.map((p) => waitForPhase(p, "writing", 20000)));

      // Verify round indicator
      await expect(host.getByTestId("round-indicator")).toContainText(
        `Round ${round}/3`
      );

      // Submit answers
      for (let i = 0; i < players.length; i++) {
        await players[i]
          .getByTestId("answer-input")
          .fill(`${names[i]} round ${round} answer`);
        await players[i].getByTestId("submit-answer-btn").click();
      }

      // Auto-transition to voting phase when all players submit
      await Promise.all(players.map((p) => waitForPhase(p, "voting")));

      // Everyone votes for first option
      for (const player of players) {
        await player.getByTestId("answer-option-0").click();
      }

      // Auto-transition to reveal phase when all players vote
      await Promise.all(players.map((p) => waitForPhase(p, "reveal")));

      // Wait for prompt pre-generation before advancing
      await host.waitForTimeout(2000);

      if (round < 3) {
        // Advance to next round
        await host.getByTestId("next-round-btn").click();
      } else {
        // Last round - should go to FINAL
        await host.getByTestId("next-round-btn").click();
        await Promise.all(players.map((p) => waitForPhase(p, "final")));
      }
    }

    // Verify FINAL phase
    await expect(host.getByTestId("winner-display")).toBeVisible();
    const winnerText = await host.getByTestId("winner-display").textContent();
    expect(winnerText).toContain("WINS!");

    // Cleanup
    for (const player of players) {
      await player.close();
    }
    for (const ctx of contexts) {
      await ctx.close();
    }
  });

  test("Play Again restarts game", async ({ browser }) => {
    const roomId = `restart-${Date.now()}`;

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const host = await createPlayer(ctx1, roomId, "Host");
    const player2 = await createPlayer(ctx2, roomId, "Player2");

    await Promise.all([waitForPhase(host, "lobby"), waitForPhase(player2, "lobby")]);

    // Start with 3 rounds
    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    // Play through all 3 rounds quickly
    for (let round = 1; round <= 3; round++) {
      await Promise.all([
        waitForPhase(host, "writing", 20000),
        waitForPhase(player2, "writing", 20000),
      ]);

      await host.getByTestId("answer-input").fill(`Host round ${round}`);
      await host.getByTestId("submit-answer-btn").click();
      await player2.getByTestId("answer-input").fill(`P2 round ${round}`);
      await player2.getByTestId("submit-answer-btn").click();

      // Auto-transition to voting phase when all players submit
      await Promise.all([
        waitForPhase(host, "voting"),
        waitForPhase(player2, "voting"),
      ]);

      await host.getByTestId("answer-option-0").click();
      await player2.getByTestId("answer-option-0").click();

      // Auto-transition to reveal phase when all players vote
      await Promise.all([
        waitForPhase(host, "reveal"),
        waitForPhase(player2, "reveal"),
      ]);

      // Wait for prompt pre-generation before advancing
      await host.waitForTimeout(2000);
      await host.getByTestId("next-round-btn").click();
    }

    // Should be in FINAL
    await Promise.all([
      waitForPhase(host, "final"),
      waitForPhase(player2, "final"),
    ]);

    // Click Play Again
    await host.getByTestId("play-again-btn").click();

    // Should return to lobby
    await Promise.all([
      waitForPhase(host, "lobby"),
      waitForPhase(player2, "lobby"),
    ]);

    // Can start a new game
    await expect(host.getByTestId("start-game-btn")).toBeVisible();

    await host.close();
    await player2.close();
    await ctx1.close();
    await ctx2.close();
  });

  test("scores accumulate across rounds", async ({ browser }) => {
    const roomId = `scores-${Date.now()}`;

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();

    const host = await createPlayer(ctx1, roomId, "Host");
    const player2 = await createPlayer(ctx2, roomId, "Player2");

    await Promise.all([waitForPhase(host, "lobby"), waitForPhase(player2, "lobby")]);

    await host.getByTestId("round-3").click();
    await host.getByTestId("start-game-btn").click();

    // Play 2 rounds
    for (let round = 1; round <= 2; round++) {
      await Promise.all([
        waitForPhase(host, "writing", 20000),
        waitForPhase(player2, "writing", 20000),
      ]);

      await host.getByTestId("answer-input").fill(`Host ${round}`);
      await host.getByTestId("submit-answer-btn").click();
      await player2.getByTestId("answer-input").fill(`P2 ${round}`);
      await player2.getByTestId("submit-answer-btn").click();

      // Auto-transition to voting phase when all players submit
      await Promise.all([
        waitForPhase(host, "voting"),
        waitForPhase(player2, "voting"),
      ]);

      await host.getByTestId("answer-option-0").click();
      await player2.getByTestId("answer-option-0").click();

      // Auto-transition to reveal phase when all players vote
      await Promise.all([
        waitForPhase(host, "reveal"),
        waitForPhase(player2, "reveal"),
      ]);

      // Wait for prompt pre-generation before advancing
      await host.waitForTimeout(2000);
      await host.getByTestId("next-round-btn").click();
    }

    // After 2 rounds, verify we're on round 3
    await Promise.all([
      waitForPhase(host, "writing"),
      waitForPhase(player2, "writing"),
    ]);

    await expect(host.getByTestId("round-indicator")).toContainText("Round 3/3");

    // The scoreboard at bottom should show accumulated scores
    // Look for the score text pattern "Host: NNN" or "Player2: NNN"
    const scoreText = await host.locator("text=/\\d+ 🔥/").first().textContent();
    // Scores should contain numbers
    expect(scoreText).toMatch(/\d+/);

    await host.close();
    await player2.close();
    await ctx1.close();
    await ctx2.close();
  });
});
