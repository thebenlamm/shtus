# Technology Stack

**Analysis Date:** 2026-01-29

## Languages

**Primary:**
- TypeScript 5 - All source code (frontend, backend, server)
- TSX - React components with embedded JSX

**Secondary:**
- CSS (Tailwind) - Styling with custom properties for theming
- JavaScript - Configuration files (ESLint, PostCSS, Next.js config uses `.mts`)

## Runtime

**Environment:**
- Node.js (version unspecified in package.json, inferred from dev tooling as v18+)

**Package Manager:**
- npm (with `package-lock.json` present)

## Frameworks

**Core:**
- Next.js 16.1.4 - Frontend framework, routing, API routes, SSR/SSG
- React 19.2.3 - UI library for components
- React DOM 19.2.3 - React rendering to DOM
- PartyKit 0.0.115 - Real-time WebSocket server for multiplayer state management
- PartySocket 1.1.10 - WebSocket client library (browser side)

**Testing:**
- Vitest 4.0.18 - Unit test runner (Node environment)
- Playwright 1.58.0 - E2E testing framework

**Build/Dev:**
- TypeScript 5 - Language compilation and type checking
- ESLint 9 - Code linting
- ESLint Config Next 16.1.4 - Next.js-specific ESLint rules
- Tailwind CSS 4 - Utility-first CSS framework
- @tailwindcss/postcss 4 - PostCSS plugin for Tailwind
- PostCSS - CSS transformation tool
- tsx 4.21.0 - TypeScript execution for scripts (`npm run test:prompts`)
- WebSocket (ws) 8.19.0 - WebSocket library (dev dependency for testing)

## Key Dependencies

**Critical:**
- PartyKit/PartySocket - Enables real-time multiplayer game state synchronization via WebSocket connections
- React 19 - Modern UI rendering with latest hooks and features

**Infrastructure:**
- Next.js 16 - Production-ready framework with built-in optimization, security headers, routing
- TypeScript 5 - Type safety across entire codebase

## Configuration

**Environment:**
- `XAI_API_KEY` - xAI API key for Grok prompt generation (PartyKit server only, not public)
- `NEXT_PUBLIC_PARTYKIT_HOST` - PartyKit host URL, required for production (e.g., `shtus-staging.thebenlamm.partykit.dev`)
- `NEXT_PUBLIC_CHAT_ENABLED` - Feature flag for in-game chat (default: `false`)
- `ADMIN_SECRET_KEY` - Secret for admin panel features (prompt overrides)

**Build:**
- `next.config.ts` - Next.js configuration with security headers (CSP, X-Frame-Options, etc)
- `tsconfig.json` - TypeScript compiler options with path aliases (`@/*` → `./src/*`)
- `eslint.config.mjs` - ESLint configuration (flat config format, Next.js + Core Web Vitals rules)
- `partykit.json` - PartyKit server configuration (entry point: `party/main.ts`, compatibility: 2024-01-01)
- `vitest.config.ts` - Vitest configuration (single-threaded, 10s timeout, Node environment)
- `playwright.config.ts` - Playwright E2E configuration (localhost:3000, auto-starts PartyKit + Next.js servers)
- `postcss.config.mjs` - PostCSS configuration (references Tailwind)

## Platform Requirements

**Development:**
- Node.js 18+
- npm 9+
- macOS/Linux/Windows with bash (scripts written for bash)

**Production:**
- Vercel (inferred from `.vercel/` directory and `.env.preview` format)
- PartyKit hosting for WebSocket server (referenced as `shtus-staging.thebenlamm.partykit.dev` in preview)
- xAI API access for Grok (optional - falls back to hardcoded prompts)

**Deployment:**
- Vercel for Next.js frontend
- PartyKit platform for real-time server (via `npm run deploy:staging` or `npm run deploy:production`)

---

*Stack analysis: 2026-01-29*
