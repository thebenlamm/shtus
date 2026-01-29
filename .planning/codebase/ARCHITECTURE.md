# Architecture

**Analysis Date:** 2026-01-29

## Pattern Overview

**Overall:** Two-server distributed architecture with real-time WebSocket synchronization.

**Key Characteristics:**
- Frontend (Next.js) and backend (PartyKit) as separate deployed services communicating via WebSocket
- Single source of truth: `GameState` object on PartyKit server
- Client-side React state synced through message-based events
- Game state machine progression through fixed phases (LOBBY → WRITING → VOTING → REVEAL)

## Layers

**Frontend (Next.js Application):**
- Purpose: Render game UI, handle user input, display game state
- Location: `src/app/`, `src/components/`, `src/hooks/`
- Contains: Page components, game UI rendering, routing, theme management
- Depends on: PartyKit WebSocket connection, localStorage for player ID/name persistence
- Used by: Browser clients connecting to game rooms

**PartyKit Real-time Server:**
- Purpose: Manage game state, enforce game rules, generate prompts, broadcast events
- Location: `party/main.ts`
- Contains: Game state machine, player management, AI prompt generation, chat handling, rate limiting
- Depends on: xAI Grok API for AI prompts, hardcoded fallback prompts
- Used by: Multiple Next.js clients connecting via PartySocket WebSocket

**Presentation Layer (React Components):**
- Purpose: Render phases dynamically based on game state
- Location: `src/app/game/[roomId]/page.tsx`, `src/components/AdminPanel.tsx`
- Contains: Phase-specific UI (lobby, writing, voting, reveal, final), form inputs, chat interface
- Depends on: Game state from PartyKit, user event handlers
- Used by: Game page route

**Hooks & Utilities:**
- Purpose: Encapsulate cross-cutting concerns
- Location: `src/hooks/useTheme.ts`, `src/hooks/useIsMobile.ts`
- Contains: Theme detection/switching, responsive design utilities, localStorage sync
- Depends on: Browser APIs (localStorage, matchMedia)
- Used by: Game page and layout components

## Data Flow

**Game State Synchronization:**

1. **Initialization**: Client connects → PartyKit broadcasts full `GameState` → Client hydrates local state
2. **Action**: User submits answer/vote → Client sends message to PartyKit
3. **Processing**: PartyKit validates, updates `GameState`, increments phase if complete
4. **Broadcast**: PartyKit broadcasts updated state to all connected clients via `broadcast()`
5. **Render**: React state updates, component re-renders with new phase/data

**Prompt Generation Flow:**

1. **Trigger**: Writing phase starts, `isPromptLoading` is true, `generationId` incremented
2. **Generation**: Server starts async generation with current `generationId`
3. **Result**: When API returns (or timeout at 30s), result checked against current `generationId`
4. **Stale Detection**: If `generationId` mismatch (game restarted), result discarded
5. **Broadcast**: Valid prompt stored in `state.currentPrompt`, broadcasted with `promptSource` ("ai", "fallback", or "admin")

**Chat Message Flow:**

1. **Send**: Client sends `{ type: "chat", text, playerId }`
2. **Rate Limit**: Server checks `chatRateLimits[playerId]` (3 messages per 5 seconds)
3. **Storage**: Server adds to `chatMessages` array with timestamp
4. **Summarization**: If count exceeds soft cap (200), background summarization starts
5. **Pruning**: If hard cap (500) reached, truncate to hard prune level (250)
6. **Broadcast**: New message and/or summary broadcasted to clients

**State Management:**
- Server state: Single `GameState` object + separate `chatMessages` array (enables independent chat broadcast)
- Client state: React component state synced via incoming messages
- Player ID persistence: Stored in localStorage per room, used for reconnection
- Admin state: Separate `adminState` object containing `exactQuestion` and `promptGuidance`

## Key Abstractions

**GameState:**
- Purpose: Centralized game progress and player data
- Examples: `party/main.ts` lines 436-457
- Pattern: Immutable-style updates (create new objects, don't mutate), broadcast entire state on key changes

**Phase Machine:**
- Purpose: Enforce valid state transitions
- Examples: LOBBY → WRITING → VOTING → REVEAL → (WRITING or FINAL)
- Pattern: Guard checks before phase transitions (e.g., require minimum active players, all votes submitted)

**Player Object (server-side):**
- Purpose: Track individual player state within a room
- Properties: id, name, score, winStreak, disconnectedAt, isVoyeur, isAdmin
- Pattern: Soft delete on disconnect (set `disconnectedAt`), hard delete after 5-minute grace period

**RoundHistory:**
- Purpose: Store top answers and themes from previous rounds for context
- Pattern: Used in prompt generation to avoid repetition, sanitized before AI inclusion

**Prompt Generation:**
- Purpose: Create contextual prompts using AI or fallbacks
- Pattern: Async generation with timeout (30s), validation (must contain player name), fallback on API failure

## Entry Points

**Home Page:**
- Location: `src/app/page.tsx`
- Triggers: User visits root URL
- Responsibilities: Collect player name, generate room code, or accept room code for joining

**Game Page:**
- Location: `src/app/game/[roomId]/page.tsx`
- Triggers: User navigates from home or opens shared link
- Responsibilities: Establish WebSocket connection, render game UI, handle phase-specific actions

**PartyKit Server:**
- Location: `party/main.ts` class `ShtusServer`
- Triggers: Client connects via WebSocket
- Responsibilities: Initialize game state, manage connections, process messages, generate prompts

**Join Flow:**
- Location: `src/app/join/[code]/page.tsx` + `src/app/join/[code]/JoinForm.tsx`
- Triggers: User opens shared link `/join/[code]`
- Responsibilities: Pre-populate room code, show join form

## Error Handling

**Strategy:** Defensive programming with graceful degradation.

**Patterns:**
- **AI Fallback**: xAI API failure → use hardcoded prompt pool (no-op, game continues)
- **Connection Loss**: WebSocket disconnect → set `connectionStatus` to "reconnecting", attempt auto-reconnect
- **Input Sanitization**: `sanitizeForLLM()` removes dangerous characters before AI inclusion, prevents prompt injection
- **Validation**: `validateExactQuestion()` enforces length (1-500 chars), removes control characters
- **Rate Limiting**: Reject excess chat messages (3 per 5 seconds per player)
- **Stale Results**: `generationId` counter invalidates old async prompt results if game restarted
- **Timing-Safe Comparison**: `timingSafeEqual()` for admin secret validation (constant-time to prevent timing attacks)

## Cross-Cutting Concerns

**Logging:**
- Approach: Console logging in development, key events logged (API responses, connection status, admin actions)
- Examples: `party/main.ts` lines 142, 272, 282

**Validation:**
- Approach: Multiple layers - input sanitization, type checking, state guards
- Examples: Player name sanitization, room code regex validation, admin question length checks

**Authentication:**
- Approach: Admin mode via URL parameter (`?admin=true`) + timing-safe secret validation
- Pattern: Admin state not broadcast (sent separately in `admin-state` message), regular players never see admin controls

**Themed Responses:**
- Admin can provide `promptGuidance` (injected into AI prompt) or `exactQuestion` (bypasses AI entirely)
- Both sanitized before use to prevent prompt injection via admin panel

**Voyeur Mode:**
- Players can toggle `isVoyeur` flag to watch without participating
- Voyeurs excluded from active player count (don't affect minimum player requirements)
- Voyeurs don't see other players' answers revealed (can't see who wrote what)

---

*Architecture analysis: 2026-01-29*
