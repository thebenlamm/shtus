# Adversarial Review Report - Round 2

**Date:** January 26, 2026
**Target:** Psych! Game Clone (`psych` repo)
**Reviewer:** Gemini CLI

## Executive Summary
Following the resolution of the initial findings, a secondary "deep dive" review was conducted. This review focused on state persistence, edge case logic, and reliability.

**Key Findings:**
- **Critical:** Players lose their entire game session/identity upon page refresh.
- **Major:** Scoring logic malfunctions if the winning player disconnects before the round ends ("Ghost Winner" bug).
- **Minor:** Duplicate name prevention fails for maximum-length usernames.

---

## Detailed Findings

### 1. Session Loss on Refresh (State Persistence)
**Severity:** Critical
**Location:** `src/app/game/[roomId]/page.tsx`

**Description:**
The application instantiates a `new PartySocket` on every component mount (page load) without providing a stable identity or configuration.
```typescript
useEffect(() => {
  const socket = new PartySocket({ ... }); // Generates new random ID
  // ...
}, [roomId, name]);
```
When a user refreshes the page (or if a mobile browser reloads the tab), the user joins as a completely new player. The old player remains in the game state as a "zombie" until they time out or are removed, while the user restarts with 0 points and a new hand. This makes the game extremely fragile.

**Recommendation:**
Use `localStorage` to persist a generated `userId` (or "UUID") and pass it to the `PartySocket` constructor as the `id` property, or use `partykit`'s built-in identification params if available. This ensures the socket reconnects as the same logical user.

### 2. "Ghost Winner" Scoring Bug (Game Logic)
**Severity:** Major
**Location:** `party/main.ts` in `endVoting` method.

**Description:**
The scoring logic calculates `maxVotes` based on *all* votes cast, including those for players who may have disconnected.
```typescript
// 1. Calculate votes
Object.values(this.state.votes).forEach((votedFor) => {
  voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
});

// 2. Find max (e.g., Ghost has 5 votes, Player B has 3)
const maxVotes = Math.max(...Object.values(voteCounts), 0); // maxVotes = 5

// 3. Award points
Object.entries(voteCounts).forEach(([playerId, votes]) => {
  if (this.state.players[playerId]) { // Ghost is NOT in players
    // Player B has 3 votes. 3 === 5 is False.
    if (votes === maxVotes && maxVotes > 0) { ... }
  }
});
```
If the player with the most votes leaves before voting ends:
1.  They get no points (correct).
2.  **No other player** receives the "Round Winner" bonus (200 pts), because their vote count (3) does not equal `maxVotes` (5).
The round effectively has no winner.

**Recommendation:**
Filter `voteCounts` to only include currently active players *before* calculating `maxVotes`.

### 3. Duplicate Name Logic Failure (Edge Case)
**Severity:** Minor
**Location:** `party/main.ts` in `onMessage` (case "join").

**Description:**
The logic to handle duplicate names appends a suffix and *then* truncates.
```typescript
if (existingNames.includes(name)) {
  // ...
  name = `${name} ${suffix}`.slice(0, 20);
}
```
If a user chooses a 20-character name that is already taken (e.g., "WWWWWWWWWWWWWWWWWWWW"), the code appends " 2" making it 22 chars, then slices it back to the original 20 characters. The collision remains, resulting in two players with identical names.

**Recommendation:**
Truncate the base name *before* appending the suffix to ensure the result fits within the limit and is unique.
`name = ${name.slice(0, 20 - suffix.toString().length - 1)} ${suffix};`

