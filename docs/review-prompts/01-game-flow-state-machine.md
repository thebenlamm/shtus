# Adversarial Review: Game Flow & State Machine

> Run this review periodically to ensure the core game loop works correctly.

## Context

This is a party game called Shtus. Players join a room, answer funny prompts, vote on favorites, and see results. The game flows through phases: LOBBY → PROMPT → WRITING → VOTING → REVEAL → (loop or FINAL).

## Priority

This is a fun game for friends, not production software. We only care that it WORKS. Ignore security concerns, performance optimization, and edge cases involving malicious users.

## Files to Review

- `party/main.ts` (lines 1-600 focus on state machine, phase transitions, message handlers)
- `src/app/game/[roomId]/page.tsx` (UI rendering per phase)

## What to Look For

### 1. Phase Transitions
- Can the game get stuck in any phase?
- Are all phase transitions handled? (LOBBY→WRITING, WRITING→VOTING, etc.)
- What happens if host clicks "next round" rapidly?
- What happens if phase changes while a player is mid-action (typing answer, clicking vote)?

### 2. Round Progression
- Does round number increment correctly?
- Does round limit (3/5/10/endless) work correctly?
- What happens at round 3 of 3? Does it go to FINAL?
- Can the game restart properly from FINAL phase?

### 3. Answer/Vote Handling
- Can a player submit multiple answers in WRITING phase?
- Can a player vote multiple times?
- Can a player vote for themselves?
- What happens if player submits empty answer?
- What happens if answerOrder is empty or mismatched?

### 4. State Consistency
- Is `answers{}` cleared between rounds?
- Is `votes{}` cleared between rounds?
- Is `answerOrder` regenerated each round?
- Are `player.answer` and `player.vote` cleared between rounds?

### 5. Edge Cases
- What if game has 0 players when starting?
- What if game has 1 player?
- What if all players are voyeurs when trying to start?
- What if host leaves during WRITING phase?

## Do NOT Review

- Security vulnerabilities
- Performance concerns
- Code style/formatting
- Error message wording
- Logging practices

## Output Format

List bugs/issues that would cause the game to NOT WORK. For each issue:
- **Severity**: CRITICAL (game breaks), HIGH (feature broken), MEDIUM (annoying but playable)
- **Description**: What's wrong
- **Scenario**: How to trigger it
- **Suggested fix**: Brief recommendation
