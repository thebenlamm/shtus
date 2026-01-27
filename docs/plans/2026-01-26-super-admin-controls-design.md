# Super Admin Controls Design

**Date:** 2026-01-26
**Status:** Approved
**Author:** Ben + Claude

## Overview

Add super admin controls during gameplay that allow the app creator to influence question generation - either by writing exact questions or injecting guidance into the AI prompts.

## Authentication

- Access via URL param: `?admin=SECRET_KEY`
- Server validates against `ADMIN_SECRET_KEY` environment variable
- On valid auth, player marked with `isAdmin: true`
- Admin status persists for session (stored in localStorage alongside userId)

## State Changes

### Player Interface
```typescript
interface Player {
  // ... existing fields
  isAdmin?: boolean;  // Set when admin key validated
}
```

### GameState Interface
```typescript
interface GameState {
  // ... existing fields
  exactQuestion?: string | null;   // Admin override - bypasses AI, clears after use
  promptGuidance?: string | null;  // Admin guidance - injected into AI prompt, persists until cleared
}
```

## UI Design

Floating panel on left side (mirrors chat panel on right):

```
┌─────────────────────────────┐
│ 🔧 Admin Controls      [−] │
├─────────────────────────────┤
│ NEXT QUESTION               │
│ ┌─────────────────────────┐ │
│ │ Type exact question...  │ │
│ └─────────────────────────┘ │
│ [Clear]           [Queue]   │
│                             │
│ AI GUIDANCE                 │
│ ┌─────────────────────────┐ │
│ │ Guide the AI...         │ │
│ │ e.g. "roast Dave about  │ │
│ │ his terrible dancing"   │ │
│ └─────────────────────────┘ │
│ [Clear]           [Apply]   │
│                             │
│ STATUS                      │
│ ✓ Question queued: "What..." │
│ ✓ Guidance active           │
└─────────────────────────────┘
```

- Desktop: Always-visible collapsible sidebar (~280px)
- Mobile: Floating button (bottom-left) → drawer overlay
- Visible in voyeur mode (admin can spectate while controlling prompts)

## Server Logic

### Prompt Generation Flow

```
startRound() called
    │
    ├─► Check exactQuestion?
    │       YES → Use as currentPrompt, clear exactQuestion, skip AI
    │       NO  → Continue to AI generation
    │
    └─► generateSinglePrompt()
            │
            ├─► Check promptGuidance?
            │       YES → Inject into system prompt
            │       NO  → Use standard prompt
            │
            └─► Call Grok API / fallback
```

### Guidance Injection

```typescript
// In the LLM system prompt, after theme context:
`Theme: ${theme}
${guidance ? `\nSPECIAL DIRECTION FROM HOST: ${sanitizeForLLM(guidance)}` : ''}
Players: ${playerNames.join(', ')}
...`
```

### Validation

- `exactQuestion`: No sanitization (trusted admin), but validate non-empty and reasonable length (<500 chars)
- `promptGuidance`: Sanitized via `sanitizeForLLM()` since it's injected into AI prompt

## WebSocket Messages

### Client → Server

```typescript
// Set override values (null to clear)
{
  type: "admin-set-override",
  exactQuestion?: string | null,
  promptGuidance?: string | null
}
```

### Server → Admin Client Only

```typescript
// Sent with every state broadcast to admin players
{
  type: "admin-state",
  exactQuestion: string | null,
  promptGuidance: string | null
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `party/main.ts` | Add `isAdmin` to Player, add override fields to GameState, validate admin on join, handle `admin-set-override` message, modify `generateSinglePrompt()` and `startRound()` |
| `src/app/game/[roomId]/page.tsx` | Detect `?admin=` param, include in join message, track admin state, render AdminPanel when admin |
| `src/components/AdminPanel.tsx` | New component - floating panel with text fields and status |
| `.env.local` | Add `ADMIN_SECRET_KEY` |
| `partykit.json` or deployment config | Add `ADMIN_SECRET_KEY` to PartyKit environment |

## Edge Cases

| Case | Behavior |
|------|----------|
| Admin disconnects/reconnects | `isAdmin` restored via localStorage admin key + server re-validation |
| Multiple admins | All see same override state, last write wins |
| Override set during WRITING | Takes effect next round |
| Admin toggles voyeur mode | Admin panel remains visible |
| exactQuestion + promptGuidance both set | exactQuestion used for next round (skips AI), guidance applies to subsequent AI-generated rounds |

## Security

- Admin key never sent to non-admin clients
- Server validates admin key on every join (not just stored client-side)
- `admin-set-override` messages rejected if sender is not admin
- Guidance sanitized before AI injection
- Admin actions logged to server console

## Implementation Order

1. Add `ADMIN_SECRET_KEY` to env files
2. Add types to `party/main.ts` (Player.isAdmin, GameState override fields)
3. Server: validate admin on join, send admin-state
4. Server: handle admin-set-override message
5. Server: modify startRound() to use exactQuestion
6. Server: modify generateSinglePrompt() to inject guidance
7. Client: detect admin param, include in join
8. Client: create AdminPanel component
9. Client: render panel when isAdmin, handle admin-state
10. Test end-to-end
