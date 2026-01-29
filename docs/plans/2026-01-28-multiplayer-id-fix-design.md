# Multiplayer ID & Reconnection Fix

**Date**: 2026-01-28
**Status**: Approved

## Problem Statement

Two HIGH severity multiplayer bugs:

1. **Duplicate player IDs**: Client uses `localStorage` per room for player ID. Multiple tabs share localStorage, so they get the same ID. Server treats them as one player, causing state collisions.

2. **Reconnect loses data**: On disconnect, server immediately calls `removePlayerFromRoundData()` which deletes answers/votes. When player reconnects within the 5-minute grace period, their submission is gone.

## Solution

### Fix 1: Per-Tab ID with sessionStorage

Change client ID generation from `localStorage` to `sessionStorage`:

```typescript
// Before (localStorage - shared across tabs)
const storageKey = `shtus-user-${roomId}`;
let userId = localStorage.getItem(storageKey);

// After (sessionStorage - per-tab isolation)
const storageKey = `shtus-session-${roomId}`;
let userId = sessionStorage.getItem(storageKey);
```

**Behavior changes:**
- Two tabs in same browser → two distinct players (fixed)
- Refresh same tab → same player (reconnection works)
- Close tab and reopen → new player (acceptable for party game)

### Fix 2: Preserve Data During Grace Period

Move `removePlayerFromRoundData()` from immediate disconnect to grace period expiry:

**Remove from `onClose()`:**
```typescript
// DELETE these lines from onClose():
if (this.state.phase === PHASES.WRITING || this.state.phase === PHASES.VOTING) {
  this.removePlayerFromRoundData(conn.id);
}
```

**Add to `cleanupAbandonedPlayers()`:**
```typescript
// When grace period expires and player is being deleted:
this.removePlayerFromRoundData(id);
delete this.state.players[id];
```

**Behavior changes:**
- Disconnected player's answer/vote preserved during 5-min grace period
- If they reconnect, their submission is still there
- If grace expires, data cleaned up with player

## Edge Cases Verified

| Scenario | Handling |
|----------|----------|
| Phase transitions with disconnected players | `getActivePlayers()` excludes disconnected - won't stall |
| Vote counting | Already filters by `activePlayerIds` |
| Reveal UI for disconnected player's answer | Shows correctly - player still exists during grace |
| Resubmit after reconnect | Overwrites existing answer (fine) |

## Adversarial Review Fixes

After review, two additional issues were identified and fixed:

### Issue: endWriting() deleted answers from disconnected players

**Problem**: `endWriting()` used `getActivePlayers()` to filter answers, which excludes disconnected players. A player who disconnected during WRITING would lose their answer when the host ended the phase.

**Fix**: Added `getPlayersWithinGrace()` helper that includes disconnected players still within the 5-min grace period. `endWriting()` now uses this to preserve answers from players who might reconnect.

### Issue: VOTING could stall after disconnect

**Problem**: Removing `removePlayerFromRoundData()` from `onClose()` also removed the `checkVotingStall()` call. If a player disconnected during VOTING, the phase wouldn't auto-end even if no eligible voters remained.

**Fix**: Added explicit `checkVotingStall()` call to `onClose()` during VOTING phase, without deleting round data.

## Files Changed

- `src/app/game/[roomId]/page.tsx` - sessionStorage change
- `party/main.ts`:
  - Added `getPlayersWithinGrace()` helper method
  - Modified `endWriting()` to use grace-aware player set
  - Removed `removePlayerFromRoundData()` from `onClose()`
  - Added `checkVotingStall()` call to `onClose()` for VOTING phase
  - Added `removePlayerFromRoundData()` to `cleanupAbandonedPlayers()`

## Testing

1. Open same room in two tabs → should be two distinct players
2. Submit answer, disconnect network, reconnect → answer preserved
3. Submit vote, disconnect network, reconnect → vote preserved
4. Disconnect during WRITING, wait 5+ min → player and data removed
