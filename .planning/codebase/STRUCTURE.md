# Codebase Structure

**Analysis Date:** 2026-01-29

## Directory Layout

```
/Users/benlamm/Workspace/psych/
├── src/                       # Next.js frontend application
│   ├── app/                   # App router routes and layouts
│   │   ├── page.tsx           # Home page (create/join room)
│   │   ├── layout.tsx         # Root layout with theme script
│   │   ├── globals.css        # Tailwind + CSS custom properties
│   │   ├── error.tsx          # Error boundary for routes
│   │   ├── global-error.tsx   # Global error boundary
│   │   ├── game/[roomId]/     # Game page (main UI)
│   │   │   └── page.tsx       # Game state UI with WebSocket
│   │   └── join/[code]/       # Join via shareable link
│   │       ├── page.tsx       # Join page wrapper
│   │       └── JoinForm.tsx   # Join form component
│   ├── components/            # Reusable React components
│   │   └── AdminPanel.tsx     # Admin UI (exact question, guidance)
│   └── hooks/                 # Custom React hooks
│       ├── useTheme.ts        # Dark/light mode toggle
│       └── useIsMobile.ts     # Responsive design hook
├── party/                     # PartyKit real-time server
│   └── main.ts               # Game logic, state machine, prompt generation
├── tests/                     # Test suite
│   ├── unit/                 # Unit tests (sanitize, validation)
│   ├── integration/          # Integration tests (game flow, chat, admin)
│   ├── edge-cases/           # Edge case tests (host transfer, stale async, voyeur mode)
│   ├── e2e/                  # End-to-end tests (Playwright)
│   ├── utils/                # Test utilities and mocks
│   │   ├── party-test-server.ts  # Test server for integration tests
│   │   ├── mock-xai.ts          # Mock xAI API
│   │   ├── mock-player.ts       # Mock player generator
│   │   ├── game-simulator.ts    # Full game simulation
│   │   └── setup.ts            # Test setup (vitest)
│   └── setup.ts              # Global test setup
├── scripts/                   # Deployment and utility scripts
│   ├── deploy.sh            # Deploy to Vercel (staging/production)
│   └── test-prompts.ts      # Test AI prompt generation manually
├── public/                    # Static assets (favicon, fonts)
├── docs/                      # Documentation
│   ├── plans/               # Planning documents
│   └── review-prompts/      # Code review notes
├── .planning/               # GSD planning documents
│   └── codebase/           # Architecture/structure analysis
├── partykit.json           # PartyKit configuration
├── next.config.ts          # Next.js security headers, CSP
├── tsconfig.json           # TypeScript configuration
├── playwright.config.ts    # Playwright E2E test config
├── package.json            # Dependencies, scripts
└── .env.local             # Local dev environment variables
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router page routes and layouts
- Contains: Page components, error boundaries, global styles
- Key files: `page.tsx` (home), `game/[roomId]/page.tsx` (main game UI), `layout.tsx` (theme setup)

**`src/components/`:**
- Purpose: Reusable React components
- Contains: UI components extracted from pages
- Key files: `AdminPanel.tsx` (admin controls UI)

**`src/hooks/`:**
- Purpose: Custom React hooks for cross-cutting concerns
- Contains: Theme management, responsive detection
- Key files: `useTheme.ts` (dark/light + localStorage sync), `useIsMobile.ts` (media query hook)

**`party/`:**
- Purpose: PartyKit real-time server implementation
- Contains: Game state machine, player management, prompt generation, chat, rate limiting
- Key files: `main.ts` (entire server - 1541 lines)

**`tests/`:**
- Purpose: Test suite covering all layers
- Contains: Unit tests, integration tests, edge cases, E2E tests, test utilities
- Key files:
  - Unit: `unit/sanitize.test.ts`, `unit/timing-safe.test.ts`, `unit/validate-question.test.ts`
  - Integration: `integration/game-flow.test.ts`, `integration/prompt-generation.test.ts`, `integration/chat.test.ts`
  - Edge cases: `edge-cases/stale-async.test.ts`, `edge-cases/voyeur-mode.test.ts`, `edge-cases/host-transfer.test.ts`
  - E2E: `e2e/full-game.spec.ts`, `e2e/multiplayer-sync.spec.ts`, `e2e/reconnection.spec.ts`
  - Utilities: `utils/party-test-server.ts`, `utils/game-simulator.ts`, `utils/mock-xai.ts`

**`scripts/`:**
- Purpose: Automation scripts for deployment and testing
- Contains: Deploy script, prompt testing
- Key files: `deploy.sh` (Vercel deployment), `test-prompts.ts` (manual prompt generation testing)

**`public/`:**
- Purpose: Static assets served directly
- Contains: favicon, fonts, images
- Note: Not typically checked in for production (gitignored)

**`docs/`:**
- Purpose: Documentation and planning notes
- Contains: Architecture docs, review feedback, planning documents
- Subdirectories: `plans/` (implementation plans), `review-prompts/` (code review notes)

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Home page (create/join room) - root route
- `src/app/game/[roomId]/page.tsx`: Game UI - main gameplay interface
- `src/app/layout.tsx`: Root layout with theme initialization script
- `party/main.ts`: PartyKit server main entry point (configured in `partykit.json`)

**Configuration:**
- `next.config.ts`: Security headers, CSP policy, PartyKit host validation
- `partykit.json`: PartyKit server name and main file
- `tsconfig.json`: TypeScript compiler options
- `playwright.config.ts`: E2E test configuration
- `package.json`: Dependencies, build/dev scripts, test commands

**Core Logic:**
- `party/main.ts`: ALL game logic (1541 lines) - state machine, player management, prompt generation, chat, rate limiting
- `src/app/globals.css`: Tailwind CSS + CSS custom properties for theming
- `src/hooks/useTheme.ts`: Theme detection and switching with localStorage persistence

**Testing:**
- `tests/setup.ts`: Global test setup (vitest)
- `tests/utils/party-test-server.ts`: Test server for integration tests
- `tests/utils/game-simulator.ts`: Full game simulation utility
- `tests/integration/game-flow.test.ts`: Main game flow integration tests

## Naming Conventions

**Files:**
- Page routes: lowercase with hyphens (e.g., `page.tsx`, `join`, `game`)
- Components: PascalCase (e.g., `AdminPanel.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useTheme.ts`, `useIsMobile.ts`)
- Test files: `.test.ts` or `.spec.ts` suffix (e.g., `sanitize.test.ts`, `full-game.spec.ts`)

**Directories:**
- Feature directories: lowercase (e.g., `components/`, `hooks/`, `tests/`)
- Dynamic routes: square brackets (e.g., `[roomId]/`, `[code]/`)

## Where to Add New Code

**New Feature (Game Logic):**
- Primary code: `party/main.ts` (add methods to `ShtusServer` class)
- Tests: `tests/integration/` or `tests/edge-cases/` depending on complexity
- Example: New game phase would require state updates in `GameState`, phase transition logic, message handling

**New UI Component:**
- Implementation: `src/components/ComponentName.tsx` (PascalCase)
- Used in: `src/app/game/[roomId]/page.tsx` or other page component
- Example: New voting UI component would be created in `src/components/`, imported in game page

**New Hook (Cross-cutting Concern):**
- Implementation: `src/hooks/useNewFeature.ts`
- Used by: Components or page components
- Example: New responsive breakpoint hook would go in `src/hooks/`, used by game page

**New Page Route:**
- Implementation: `src/app/new-route/page.tsx`
- Layout: `src/app/new-route/layout.tsx` (if custom layout needed)
- Error handling: `src/app/new-route/error.tsx` (if custom error boundary)

**New Test:**
- Unit test: `tests/unit/feature.test.ts`
- Integration test: `tests/integration/feature.test.ts`
- Edge case: `tests/edge-cases/feature.test.ts`
- E2E test: `tests/e2e/feature.spec.ts`
- Utilities: `tests/utils/helper.ts`

## Special Directories

**`.partykit/`:**
- Purpose: PartyKit deployment artifacts and cache
- Generated: Yes (automatically by PartyKit)
- Committed: No (gitignored)

**`.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes (automatically by Next.js build)
- Committed: No (gitignored)

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (npm install)
- Committed: No (gitignored)

**`test-results/` and `playwright-report/`:**
- Purpose: Test output from Playwright E2E tests
- Generated: Yes (automatically by Playwright)
- Committed: No (gitignored)

**`.env.local`:**
- Purpose: Local environment variables (dev only)
- Contains: XAI_API_KEY, NEXT_PUBLIC_PARTYKIT_HOST
- Committed: No (sensitive data, gitignored)
- Note: Use `.env.preview` for preview environment

## Message Protocol (Client ↔ Server)

**Client → Server Messages:**
- `{ type: "join-game", playerName, isVoyeur?, admin? }` - Player joins room
- `{ type: "start-game", theme, roundLimit }` - Host starts game
- `{ type: "submit-answer", answer }` - Submit writing phase answer
- `{ type: "submit-vote", answerId }` - Submit vote
- `{ type: "set-voyeur-mode", isVoyeur }` - Toggle voyeur mode
- `{ type: "restart-game" }` - Host restarts game
- `{ type: "chat", text }` - Send chat message (if enabled)
- `{ type: "admin-exact-question", question }` - Admin sets exact question
- `{ type: "admin-prompt-guidance", guidance }` - Admin sets prompt guidance

**Server → Client Broadcasts:**
- `{ type: "state-update", state: GameState }` - Full state (on connect, major changes)
- `{ type: "admin-state", ...AdminState }` - Admin state (separate, only to admin)
- `{ type: "chat-message", message: ChatMessage }` - New chat message
- `{ type: "chat-summary", summary }` - Chat summary/prune
- `{ type: "player-left", playerId }` - Player disconnected

---

*Structure analysis: 2026-01-29*
