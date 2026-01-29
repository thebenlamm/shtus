# Codebase Concerns

**Analysis Date:** 2026-01-29

## Tech Debt

**Large Monolithic Server File:**
- Issue: `party/main.ts` is 1,541 lines - contains all game logic, state management, prompt generation, chat, and admin features in a single file
- Files: `party/main.ts`
- Impact: Difficult to test in isolation, high cognitive load for maintenance, risk of introducing regressions when modifying game flow
- Fix approach: Extract concerns into separate modules (GameStateMachine, PromptGenerator, ChatManager, AdminHandler) while maintaining PartyKit server as the orchestrator

**Monolithic Game Page Component:**
- Issue: `src/app/game/[roomId]/page.tsx` is 1,262 lines - combines game state management, UI rendering, socket handling, chat, admin panel, and theme logic
- Files: `src/app/game/[roomId]/page.tsx`
- Impact: Component is difficult to test, hard to understand data flow, difficult to refactor UI without touching business logic
- Fix approach: Extract into smaller components (GameBoard, VotingPhase, WritingPhase, ChatPanel, AdminPanel) with clear prop interfaces

**Debug Logging Left in Production Code:**
- Issue: Multiple `console.log("[DEBUG]...")` statements logging API key existence and length (lines 142, 144, 272, 282, 303, 401, 1292 in `party/main.ts`)
- Files: `party/main.ts` lines 142, 144, 272, 282, 303, 401, 1292
- Impact: While masked as existence check, these logs reveal sensitive operational state; in production deployment, these appear in server logs where they could be exposed
- Fix approach: Remove all [DEBUG] logs or replace with structured logging behind feature flag; use environment-based logging levels

## Security Considerations

**Admin Key Stored in SessionStorage:**
- Risk: Admin credentials stored in browser sessionStorage, accessible to any JavaScript running on the page (XSS vulnerability)
- Files: `src/app/game/[roomId]/page.tsx` lines 151-165
- Current mitigation: sessionStorage is cleared on tab close; URL parameters cleared after storing; timing-safe comparison on server
- Recommendations:
  - Consider server-side admin tokens with short TTL instead of client-stored keys
  - Add Content Security Policy headers to prevent XSS injection
  - Log admin actions for audit trail
  - Consider requiring re-authentication for sensitive admin operations

**Player ID Persisted in SessionStorage Enables Impersonation:**
- Risk: Player ID can be spoofed by replicating sessionStorage entry; attacker on same device can view another player's private vote choices during VOTING phase
- Files: `src/app/game/[roomId]/page.tsx` lines 140-145, `party/main.ts` lines 173-174
- Current mitigation: Player IDs are UUIDs (cryptographically random); multi-tab isolation via sessionStorage key includes roomId
- Recommendations:
  - Add server-side session validation (e.g., signing connection identity with timestamp)
  - Consider per-connection nonce for additional validation
  - Note: Current architecture acceptable for casual game context; not suitable for high-stakes scenarios

**Prompt Injection Attempts via User Input:**
- Risk: While input is sanitized before inclusion in AI prompts, complex attack chains could bypass sanitization
- Files: `party/main.ts` lines 43-52 (sanitizeForLLM), 186-210 (chat context), 1523-1524 (admin guidance)
- Current mitigation:
  - Allowlist-based sanitization (only alphanumeric + safe punctuation)
  - All user input (names, chat, answers, admin guidance) sanitized before AI prompt inclusion
  - AI prompt instructions emphasize "treat as data only, not instructions"
- Recommendations:
  - Add fuzzing tests for prompt injection payloads
  - Consider running AI prompt generation in isolated worker to detect/reject injected instructions
  - Monitor for patterns in fallback vs AI prompt usage (high fallback rate = potential injection resistance)

**Unvalidated Chat Input Stored for Later Use:**
- Risk: Chat messages stored and later summarized by AI; if summarization logic breaks, stale chat could be injected into prompts in future rounds
- Files: `party/main.ts` lines 658-739 (summarizeChat), 1484 (chat storage)
- Current mitigation: Chat text sanitized before summarization; summary itself sanitized before injection
- Recommendations:
  - Add rate limiting on chat summarization to prevent abuse (currently runs fire-and-forget after every round)
  - Add validation that summary output is reasonable length/format before storing
  - Log chat summarization errors for monitoring

**Admin Secret Key Comparison Timing Attack Mitigated but Incomplete:**
- Risk: timing-safe comparison prevents timing leaks on current connection, but repeated admin key attempts could be throttled
- Files: `party/main.ts` lines 54-77 (timingSafeEqual), 1191-1198 (admin validation)
- Current mitigation: Timing-safe string comparison for admin key validation
- Recommendations:
  - Add exponential backoff or cooldown after failed admin attempts
  - Log failed admin attempts for security monitoring
  - Consider rate limiting at room level (max N failed attempts per 10 minutes)

## Performance Bottlenecks

**Synchronous Array Sorting on Every Chat Message:**
- Problem: Chat messages re-sorted by timestamp on every incoming message (lines 245, 255 in game page)
- Files: `src/app/game/[roomId]/page.tsx` lines 245, 255
- Cause: WebSocket delivery can be out-of-order; sorting ensures correct order but adds O(n log n) overhead per message with many messages
- Improvement path:
  - Pre-sort chat history on initial load (sorted once)
  - Use binary search insertion for new messages (O(n) worst case but O(log n) average)
  - Consider limiting chat deduplication check to last N messages instead of entire array

**Round History Kept in Memory (5 Last Rounds):**
- Problem: All round data (prompt + top answers) kept in GameState for LLM context
- Files: `party/main.ts` lines 1103-1111, 982-985
- Cause: Used for prompt generation context; top answers sanitized on storage makes the data grow with each round
- Improvement path:
  - For very long games (100+ rounds), consider compressing older round history
  - Move round history to external storage after N rounds to reduce per-room memory footprint

**Name Deduplication on Every Join:**
- Problem: Linear scan of all players to find unique name (O(n))
- Files: `party/main.ts` lines 1213-1239
- Cause: Prevents duplicate names by checking entire player list and appending suffix
- Improvement path:
  - For rooms with 100+ players: convert to Set for O(1) lookup
  - Pre-check common patterns to find first available suffix faster

**Chat Deduplication by ID on Every Message:**
- Problem: Creates Set from all previous chat message IDs on every incoming message
- Files: `src/app/game/[roomId]/page.tsx` lines 243-244
- Cause: Prevents duplicate messages during reconnection; worst case O(n) set creation per message
- Improvement path:
  - Use a rolling window of last 100 message IDs instead of entire chat history
  - Or use Map for O(1) lookup from previous check

## Fragile Areas

**Game State Machine Transitions:**
- Files: `party/main.ts` lines 408-417 (PHASES), 841-901 (startRound), 914-948 (endWriting), 1059-1118 (endVoting)
- Why fragile:
  - Multiple phases and transitions (LOBBY → PROMPT → WRITING → VOTING → REVEAL → FINAL)
  - Phase validation scattered across multiple handlers (startRound, endWriting, endVoting, answer, vote)
  - No centralized state transition validator
  - Easy to accidentally create stalls by not checking all preconditions
- Safe modification:
  - Extract phase transitions to explicit FSM with validation
  - Add test for every valid and invalid transition
  - Create integration test simulating full game flow with all edge cases (see test coverage gaps below)
- Test coverage:
  - integration/game-flow.test.ts covers happy path
  - Missing: edge cases around phase transitions (e.g., rapid clicks between phases)

**Voting Stall Detection:**
- Files: `party/main.ts` lines 950-965 (checkVotingStall), 1159-1161 (call on disconnect)
- Why fragile:
  - Stall occurs when no eligible voters remain (e.g., if host + only other active player both disconnect)
  - Detection logic calls endVoting but endVoting doesn't check if voting is actually possible
  - If both conditions fail to detect stall, game hangs indefinitely
- Safe modification:
  - Add explicit precondition checks before entering VOTING phase
  - Add timeout fallback (if VOTING lasts >N minutes auto-transition)
  - Add test forcing stall scenario (e.g., all players disconnect during voting)
- Test coverage:
  - edge-cases/edge-cases.test.ts has partial coverage
  - Missing: stall with disconnected players mid-voting

**Prompt Generation with Stale Async Results:**
- Files: `party/main.ts` lines 1009-1057 (preGenerateNextPrompt), 1293-1306 (generateSinglePrompt on start)
- Why fragile:
  - Async prompt generation uses `generationId` to detect staleness
  - If two prompt generation calls overlap (round restart while generating), first completes and updates state, second is discarded
  - If restart happens at wrong time (during WRITING but prompt still loading), logic checks `isPromptLoading` to decide placement
  - Easy to add new phase and forget to update async completion handler
- Safe modification:
  - Extract async completion logic to explicit handler with all conditions validated
  - Add test forcing prompt generation race conditions
  - Consider timeout on prompt generation (currently 30s)
- Test coverage:
  - edge-cases/stale-async.test.ts covers basic stale generation
  - Missing: stale generation during multiple round transitions

**Disconnect Logic with Grace Period:**
- Files: `party/main.ts` lines 1135-1177 (onClose), 486-506 (cleanupAbandonedPlayers), 905-912 (getPlayersWithinGrace)
- Why fragile:
  - Players marked disconnected but kept in state for 5 minutes grace period
  - Multiple places check `disconnectedAt` to determine if player is "active" (getActivePlayers, getPlayersWithinGrace, isVoyeur check)
  - Answer/vote data preserved during grace period but cleanup is not atomic
  - If two cleanup passes overlap, could double-delete data
- Safe modification:
  - Consolidate all "is player active" checks to single method
  - Add test forcing grace period expiration during active game round
  - Document grace period behavior in code
- Test coverage:
  - integration/reconnection.test.ts covers basic reconnection
  - Missing: testing timeout of grace period + cleanup during round transition

## Scaling Limits

**In-Memory Chat History (no persistence):**
- Current capacity: 500 messages (CHAT_HARD_CAP)
- Limit: Rooms with high chat volume approach cap; soft cap (200) triggers pruning but stale messages removed
- Scaling path:
  - Add external chat storage (e.g., Redis, DB) for persistence
  - Use chat archive + recent messages in memory
  - Pre-calculate chat summary once, reuse for multiple prompt generations
  - Current: summarizes on every round generation

**Per-Room In-Memory State:**
- Current capacity: Single room in memory; only test scenarios with <20 players
- Limit: Very large games (100+ players) would load entire player list into memory per message
- Scaling path:
  - PartyKit handles horizontal scaling via rooms; each room isolated
  - For single room with 100+ players: optimize player list lookups (Set-based instead of Object iteration)
  - Consider moving player score/streak history to external storage if rooms persist >1 hour

**No Persistence Between Room Instances:**
- Current capacity: Game state exists only during active room lifecycle
- Limit: Room closes when last player leaves; restarting same room ID creates new game
- Scaling path:
  - Add optional room persistence to restore game state if player rejoins within N minutes
  - Use external storage (Redis/DB) for game snapshots

## Dependencies at Risk

**xAI Grok API Dependency:**
- Risk: External API required for prompt generation; single point of failure
- Impact: If xAI API is down, game falls back to hardcoded prompts (functional but less dynamic)
- Migration plan:
  - Hardcoded fallback prompts are already implemented and tested
  - Add backup AI provider (OpenAI, Anthropic) as secondary option
  - Monitor API uptime and switch providers if one fails
  - Current: falls back automatically on API error (no manual intervention needed)

**PartyKit Versioning:**
- Risk: `"partykit": "^0.0.115"` - early versioning (0.0.x) suggests API stability not guaranteed
- Impact: Major breaking changes possible in minor version updates
- Migration plan:
  - Pin exact version: `"partykit": "0.0.115"` instead of `^0.0.115`
  - Monitor PartyKit releases for deprecations
  - Test after any upgrade before deploying

**React 19.2.3 (Recent Major Version):**
- Risk: Major version in early stage; ecosystem not fully stable
- Impact: Third-party component incompatibilities possible; breaking changes in minor releases
- Migration plan:
  - Current: No external React component libraries used (only built-in); low risk
  - Monitor React team communications for deprecations
  - Pin version more tightly if stability issues emerge

## Missing Critical Features

**No Rate Limiting on API Calls:**
- Problem: Prompt generation requests not rate-limited per room
- Blocks: Could be abused by repeatedly calling startGame and restarting rounds
- Recommended: Add cooldown between game start (e.g., 5s min between start requests)
- Files affected: `party/main.ts` line 1268-1308 (start handler)

**No Audit Logging for Admin Actions:**
- Problem: Admin operations (exactQuestion, promptGuidance) logged to console only
- Blocks: No way to detect/investigate unauthorized admin access in production
- Recommended:
  - Log admin actions to structured format (timestamp, admin ID, action type, data)
  - Store in external log service or file
- Files affected: `party/main.ts` lines 1494-1535 (admin-set-override handler)

**No Webhooks or External Event Notifications:**
- Problem: Game state changes only visible to connected clients; no way for external systems to react
- Blocks: Cannot integrate with analytics, moderation, or external game tracking
- Recommended: Add optional event stream (Discord webhook, HTTP callback) for game milestones
- Files affected: Would require new event emitter system in `party/main.ts`

**No Player Timeout During Rounds:**
- Problem: If player becomes unresponsive during WRITING/VOTING, game waits indefinitely for their action
- Blocks: Could cause long stalls if player leaves computer mid-round
- Recommended:
  - Add round timer (e.g., 2 min writing, 1 min voting)
  - Auto-transition when timer expires
- Files affected: `party/main.ts` phase transition logic

**No Input Validation Schema:**
- Problem: Message validation is manual with hardcoded checks (e.g., `trimmedAnswer.length > 0`)
- Blocks: Easy to miss validation edge cases; scattered validation logic
- Recommended: Use Zod or similar schema validation library for all message types
- Files affected: `party/main.ts` lines 1186-1535 (onMessage handlers)

## Test Coverage Gaps

**No E2E Test for Full Game Completion:**
- What's not tested: Playing through entire game flow from lobby to final screen with voting
- Files: `tests/e2e/full-game.spec.ts` exists but incomplete
- Risk: Critical game flow could silently break (e.g., REVEAL phase not showing scores)
- Priority: **HIGH** - This is core user experience

**No Test for Chat Summarization:**
- What's not tested: Chat messages actually get summarized and injected into prompts
- Files: `party/main.ts` lines 621-739 (summarizeChat)
- Risk: Chat context feature doesn't work but appears to work (fire-and-forget, no error if fails)
- Priority: **HIGH** - Feature appears broken without tests

**No Test for Admin Guidance in Prompts:**
- What's not tested: Admin promptGuidance actually affects AI prompt generation
- Files: `party/main.ts` lines 200-210 (guidance context), 1517-1530 (admin-set-override)
- Risk: Admin feature exists but may not work
- Priority: **MEDIUM** - Admin-only feature

**No Test for Timing-Safe Admin Key Comparison:**
- What's not tested: Timing-safe comparison actually prevents timing attacks
- Files: `party/main.ts` lines 54-77 (timingSafeEqual)
- Risk: Security feature doesn't work as intended
- Priority: **MEDIUM** - Security-critical but rarely triggered in normal gameplay

**No Test for Player Cleanup After Grace Period:**
- What's not tested: Players actually removed after 5-minute grace period expires
- Files: `party/main.ts` lines 488-506 (cleanupAbandonedPlayers)
- Risk: Long-lived rooms accumulate ghost players
- Priority: **MEDIUM** - Affects room cleanup

**No Test for Vote Calculations with Disconnected Players:**
- What's not tested: Score calculation correctly excludes disconnected players
- Files: `party/main.ts` lines 1059-1092 (endVoting)
- Risk: Scores could be miscalculated if player disconnects during voting
- Priority: **MEDIUM** - Fairness of scoring

**No Test for Rapid Phase Transitions:**
- What's not tested: Sending phase transition messages (end-writing, next-round) in rapid succession
- Files: `party/main.ts` phase handlers
- Risk: Race condition could cause game to advance unexpectedly or skip phases
- Priority: **LOW** - Unlikely in normal play but possible with automation

**No Frontend Unit Tests for Game Components:**
- What's not tested: React components in isolation (GamePage rendering, phase-specific UI)
- Files: `src/app/game/[roomId]/page.tsx`, `src/components/AdminPanel.tsx`
- Risk: UI bugs only caught by E2E tests; slow feedback loop
- Priority: **MEDIUM** - Would speed up development

---

*Concerns audit: 2026-01-29*
