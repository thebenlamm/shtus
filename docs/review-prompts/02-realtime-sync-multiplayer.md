# Adversarial Review: Real-time Sync & Multiplayer

> Run this review periodically to ensure multiplayer functionality works correctly.

## Context

Shtus uses PartyKit (WebSockets) for real-time multiplayer. Multiple players connect to the same room, see the same game state, and their actions sync. Players can disconnect and reconnect within a 5-minute grace period.

## Priority

This is a fun game for friends. We only care that multiplayer WORKS - all players see consistent state, reconnection works, and the game doesn't desync.

## Files to Review

- `party/main.ts` (focus on: onConnect, onClose, broadcast, player management)
- `src/app/game/[roomId]/page.tsx` (WebSocket connection, message handling, state sync)

## What to Look For

### 1. State Synchronization
- Do all players see the same game state after every action?
- Is there any state that's local-only and could desync?
- What happens if broadcast fails to one player but succeeds for others?
- Does late-joining player get full current state?

### 2. Player Management
- Can two players have the same ID?
- Can two players have the same name?
- What happens if player joins mid-WRITING phase?
- What happens if player joins mid-VOTING phase?
- Is player list consistent across all clients?

### 3. Host Management
- Is there always a host when game is active?
- Does host transfer work when host disconnects?
- What if all players disconnect simultaneously?
- Can there be multiple hosts?
- Does new host have all the controls?

### 4. Reconnection
- Does 5-minute grace period work correctly?
- Does player keep their score on reconnect?
- Does player keep their submitted answer on reconnect?
- Does player keep their vote on reconnect?
- What happens if player reconnects after grace period expires?
- What happens if player reconnects during phase transition?

### 5. Race Conditions
- What if two players vote at exact same millisecond?
- What if player disconnects while their message is in-flight?
- What if phase changes while player action is being processed?
- What if two players try to start the game simultaneously?

### 6. Client-Side Issues
- Does client handle connection loss gracefully?
- Does client reconnect automatically?
- Does client show correct connection status?
- What if client receives messages out of order?

## Do NOT Review

- Security (assuming friends, not malicious actors)
- Performance/latency
- Mobile-specific UI issues
- Error message wording

## Output Format

List bugs/issues that would cause multiplayer to NOT WORK. For each issue:
- **Severity**: CRITICAL (game breaks), HIGH (desync/confusion), MEDIUM (annoying but playable)
- **Description**: What's wrong
- **Scenario**: How to trigger it
- **Suggested fix**: Brief recommendation
