# Adversarial Review Prompts

Reusable prompts for reviewing the Shtus codebase. Run these periodically to catch bugs before they impact game night.

## Philosophy

These reviews focus on **"does it work?"** - not security, performance, or code quality. Shtus is a fun game for friends, so we care about:

- Players can join and play
- The game progresses correctly through phases
- Multiplayer stays in sync
- Prompts are funny and work reliably

## Available Reviews

| # | Review | Focus | When to Run |
|---|--------|-------|-------------|
| 1 | [Game Flow & State Machine](./01-game-flow-state-machine.md) | Phase transitions, rounds, answers, votes | After changing `party/main.ts` game logic |
| 2 | [Real-time Sync & Multiplayer](./02-realtime-sync-multiplayer.md) | WebSocket sync, reconnection, host transfer | After changing connection/player handling |
| 3 | [Prompt System & Fun Factor](./03-prompt-system-fun-factor.md) | AI prompts, fallbacks, admin controls | After changing prompt generation |

## How to Run

Copy the prompt content and run an adversarial review agent, or use Claude Code:

```bash
# In Claude Code, you can run these by referencing the file:
# "Run an adversarial review using docs/review-prompts/01-game-flow-state-machine.md"
```

## Severity Levels

- **CRITICAL**: Game breaks, unplayable
- **HIGH**: Feature broken, confusing experience
- **MEDIUM**: Annoying but game still playable
