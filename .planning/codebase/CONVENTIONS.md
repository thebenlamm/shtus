# Coding Conventions

**Analysis Date:** 2026-01-29

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `AdminPanel.tsx`, `JoinForm.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useTheme.ts`, `useIsMobile.ts`)
- Utility/helper functions: camelCase (e.g., `sanitizeForLLM`, `timingSafeEqual`)
- Constants: UPPER_SNAKE_CASE (e.g., `HARDCODED_PROMPTS`, `ROOM_CODE_REGEX`, `NAME_STORAGE_KEY`)

**Functions:**
- camelCase for all function names: `generateRoomCode()`, `isValidRoomCode()`, `getStoredName()`
- Arrow functions preferred for callbacks and React event handlers: `(e) => setName(e.target.value)`
- Factory functions with `create` prefix: `createTestServer()`, `createMockPlayer()`, `createPlayers()`
- Validator/type guard functions with `is` prefix: `isValidTheme()`, `isValidRoomCode()`
- Getter functions with `get` prefix: `getStoredName()`, `getStoredTheme()`, `getSystemPreference()`
- Setter functions with `set` prefix: `setStoredName()`, `setStoredTheme()`

**Variables:**
- camelCase for all variables: `roomCode`, `playerName`, `roomCodeError`, `isNavigating`
- Boolean variables prefixed with `is`, `has`, or `can`: `isValidRoomCode`, `hasSubmitted`, `hasVoted`, `mounted`
- State variables follow React convention: `useState` hook pairs with camelCase names
- Connection/room IDs use `id` suffix: `playerId`, `roomId`, `connectionId`

**Types:**
- PascalCase for all interfaces and type aliases: `GameState`, `Player`, `AdminState`, `Answer`, `ChatMessage`
- Discriminated union types use `type` property: `{ type: "chat" | "system" }`
- Generic types with descriptive names: `Record<string, unknown>` rather than `any`

## Code Style

**Formatting:**
- ESLint with Next.js core web vitals config (`eslint-config-next/core-web-vitals`)
- ESLint with TypeScript support (`eslint-config-next/typescript`)
- Flat ESLint config format (ESLint 9+) in `eslint.config.mjs`
- No Prettier config found; relies on ESLint formatting rules

**Linting:**
- ESLint 9 with Next.js rules enforced
- TypeScript strict mode enabled (`"strict": true` in `tsconfig.json`)
- React hooks rules checked via `eslint-config-next`

**Line Length:** Inferred ~100-120 chars (typical for Next.js projects)

**Indentation:** 2 spaces (Next.js standard)

## Import Organization

**Order:**
1. React/framework imports first: `import { useState, useEffect } from "react"`
2. Next.js imports: `import Link from "next/link"`, `import { useRouter } from "next/navigation"`
3. External packages: `import PartySocket from "partysocket"`
4. Path aliases: `import { useTheme } from "@/hooks/useTheme"`, `import AdminPanel from "@/components/AdminPanel"`
5. Type imports: `import type * as Party from "partykit/server"`
6. Local imports relative paths (rarely used due to `@/*` alias)

**Path Aliases:**
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)
- Used for all internal imports: `@/hooks/useTheme`, `@/components/AdminPanel`
- Prevents deep relative paths like `../../../hooks/useTheme`

**Type Imports:**
- Explicit `import type` for type-only imports: `import type * as Party from "partykit/server"`
- Mixed imports separate types: `import { useState } from "react"` (value), `import type { FC } from "react"` (type, if needed)

## Error Handling

**Patterns:**
- Silent catch blocks when storage is unavailable (localStorage API usage):
  ```typescript
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // localStorage unavailable - silently ignore
  }
  ```
- Return guard clauses to prevent undefined behavior:
  ```typescript
  function getStoredName(): string {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }
  ```
- Type guards for validation before use:
  ```typescript
  function isValidTheme(value: unknown): value is Theme {
    return value === "light" || value === "dark";
  }
  ```
- Null/undefined defaults for storage: `localStorage.getItem(...) || ""`
- Error boundaries via Next.js error.tsx (file: `src/app/error.tsx`) - logs to console in development, shows user-friendly message
- Console logging for errors: `console.error("Application error:", error)` with context

## Logging

**Framework:** `console` (no dedicated logging library)

**Patterns:**
- Use `console.error()` in error handlers with context: `console.error("Application error:", error)`
- Error UI boundary logs to console (see `src/app/error.tsx`)
- No logger.error() or dedicated error tracking in current codebase

## Comments

**When to Comment:**
- Explain WHY, not WHAT (code is self-explanatory for WHAT)
- Security implications (e.g., sanitization, timing-safe comparisons)
- Complex algorithms or non-obvious logic
- Hardcoded fallbacks and their purpose

**Examples:**
- `// Allowlist approach: only permit safe characters` - explains security choice
- `// Pads to same length to avoid leaking length information` - explains timing-safe approach
- `// Collapse all whitespace to single spaces (prevents newline injection attacks)` - explains security rationale
- `// Personalized roasts (everyone answers ABOUT the named person)` - explains game mechanic
- `// eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync with localStorage on mount` - explains ESLint override

**JSDoc/TSDoc:**
- Not extensively used; only for public exports and complex types
- Interface/type comments document purpose: `interface Player { id: string; name: string; score: number; ... }`
- Function signatures are self-documenting via TypeScript types

## Function Design

**Size:** Functions typically 5-30 lines; break into smaller functions if exceeding 50 lines

**Parameters:**
- Use explicit parameters, not object destructuring unless multiple related params
- Callbacks as arrow functions: `(value: string) => setRoomCode(value)`
- Type all parameters explicitly

**Return Values:**
- Early returns for guard clauses:
  ```typescript
  if (!trimmedName || isNavigating) return;
  ```
- Implicit void return for event handlers and effects
- Explicit return types on public functions: `function isValidRoomCode(code: string): boolean`

**Example Function:**
```typescript
// From src/app/page.tsx - typical pattern
function generateRoomCode(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const code = Array.from(array)
    .map((b) => b.toString(36))
    .join("")
    .toUpperCase()
    .slice(0, 6)
    .padEnd(6, "0");
  return code;
}
```

## Module Design

**Exports:**
- Default exports for page components and main server: `export default function Home() {}`
- Named exports for utilities, hooks, and factories: `export function createMockPlayer(...)`
- Mix of default and named exports in same file (less common but used in PartyKit server)

**Re-exports/Barrel Files:**
- Not used; imports are direct to source files
- Each file exports its own utilities/components

**Type Exports:**
- Type exports alongside function exports: `export type GameState = { ... }` with `export function createTestServer(...)`
- Discriminated unions exported as types: `type Message = { type: "answer"; ... } | { type: "vote"; ... }`

## React Patterns

**Hooks:**
- `useState` for local component state
- `useEffect` for side effects (localStorage sync, media query listeners, event listeners)
- `useCallback` for memoized callbacks: `useCallback(() => { ... }, [dependencies])`
- `useRef` for reference values not triggering re-renders
- `use()` for Promise resolution in Server Components: `const { roomId } = use(params)`

**Component Structure:**
- Client components marked with `"use client"` directive
- Props destructured in function signature
- JSX on separate lines for readability
- Semantic HTML: `<main>`, `<label>`, `<button>` with proper accessibility attrs

**State Management:**
- Separate concerns: UI state (isNavigating, answer text) vs game state (received from server)
- Never mutate state directly; always use setState setters
- Complex state objects passed as-is from server: `GameState` interface matches server broadcast shape

## Accessibility

**Patterns:**
- Labels linked to inputs via `htmlFor`: `<label htmlFor="player-name">`
- `aria-invalid` on inputs with errors: `aria-invalid={!!roomCodeError}`
- `aria-describedby` to link error messages: `aria-describedby={roomCodeError ? "room-code-error" : undefined}`
- Error messages with `role="alert"`: `<p role="alert">{roomCodeError}</p>`
- Screen reader text with `sr-only` class: `<label className="sr-only">Your Name</label>`
- Keyboard navigation support: Enter key triggers actions

## TypeScript Patterns

**Strict Mode:** Enabled - all types must be explicit or inferable

**Type Narrowing:**
- Type guards with `is` predicate: `function isValidTheme(value: unknown): value is Theme`
- Discriminated unions for message types
- null/undefined checks before use

**Generic Types:**
- `Record<string, T>` for object maps: `Record<string, string>`, `Record<string, unknown>`
- No `any` types in public interfaces; use `unknown` with type guards instead

---

*Convention analysis: 2026-01-29*
