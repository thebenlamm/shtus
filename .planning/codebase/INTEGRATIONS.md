# External Integrations

**Analysis Date:** 2026-01-29

## APIs & External Services

**AI Prompt Generation:**
- xAI Grok - Generates adult party game prompts
  - SDK/Client: Native `fetch()` API (no SDK)
  - Auth: Bearer token in `Authorization` header
  - Env var: `XAI_API_KEY`
  - Endpoint: `https://api.x.ai/v1/chat/completions`
  - Model: `grok-4-fast-non-reasoning`
  - Request type: POST with JSON body
  - Timeout: 30 seconds (AbortController)
  - Fallback: 100+ hardcoded adult prompts in `party/main.ts` when API key missing or request fails

## Data Storage

**Databases:**
- None - No persistent database. Game state is ephemeral, stored only in PartyKit memory per room.

**File Storage:**
- Local filesystem only - No cloud storage. Public assets served from `public/` directory.

**Caching:**
- None - Application-level. Chat history stored in server memory with soft/hard caps and automatic pruning.
  - Soft cap: 200 messages (pruned to 100)
  - Hard cap: 500 messages (pruned to 250)

**Client Storage:**
- localStorage - Persists player name across sessions (`NAME_STORAGE_KEY`)
- localStorage - Persists theme preference (dark/light mode) across sessions
- sessionStorage - Per-tab player ID storage for reconnection support within same tab/window
- sessionStorage - Per-tab admin key storage (cleared on tab close for security)

## Authentication & Identity

**Auth Provider:**
- Custom implementation (no external auth service)
- Player ID: Generated randomly per tab/room, persisted in sessionStorage
- Admin authentication: Secret key (`ADMIN_SECRET_KEY`) validated via timing-safe comparison
- Method: Query parameter (`?admin=<secret-key>`) passed on URL, stored in sessionStorage

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, LogRocket, or similar integration

**Logs:**
- Console logging only
  - Debug logs: `console.log("[DEBUG]")` for API calls, prompt generation, connection status
  - Error logs: `console.error()` for API failures, rate limiting violations, chat summarization errors
  - System logs: Not persisted; lost on server restart

## CI/CD & Deployment

**Hosting:**
- Vercel (Next.js frontend) - Inferred from `.vercel/` config and deploy scripts
- PartyKit platform (WebSocket server) - Real-time multiplayer server hosted on PartyKit infrastructure

**CI Pipeline:**
- GitHub Actions (via Playwright reporter: `reporter: "github"` in playwright.config.ts)
- PR artifacts: Screenshots on failure, videos on first retry, HTML reports
- Environment: CI retries = 2, single worker for PartyKit server stability

## Environment Configuration

**Required env vars (production):**
- `NEXT_PUBLIC_PARTYKIT_HOST` - Critical for production; WebSocket connections fail without it (e.g., `shtus-staging.thebenlamm.partykit.dev`)
- `XAI_API_KEY` - Optional; game falls back to hardcoded prompts if missing

**Optional env vars:**
- `NEXT_PUBLIC_CHAT_ENABLED` - Set to `"true"` to enable in-game chat (default: `false`)
- `ADMIN_SECRET_KEY` - Required only if admin panel features are used

**Secrets location:**
- `.env.local` - Development (not committed)
- Vercel environment variables panel - Production/staging secrets
- `sessionStorage` - Transient admin key (per-tab)

**Public env vars (embedded at build time):**
- `NEXT_PUBLIC_PARTYKIT_HOST` - Embedded in CSP header and WebSocket connection URLs
- `NEXT_PUBLIC_CHAT_ENABLED` - Feature flag checked at runtime

## Webhooks & Callbacks

**Incoming:**
- None - Game is purely client-server via WebSocket

**Outgoing:**
- None - No external webhooks or callbacks to third-party services

## Content Security Policy (CSP)

**Configured in next.config.ts:**
- Connect sources: `wss://${NEXT_PUBLIC_PARTYKIT_HOST}` (WebSocket) + `https://${NEXT_PUBLIC_PARTYKIT_HOST}` (HTTP fallback)
- Script sources: Self + unsafe-inline (required for Next.js and theme detection script)
- Style sources: Self + unsafe-inline (required for Tailwind/Next.js)
- Font sources: Self + Google Fonts (https://fonts.gstatic.com)
- Image sources: Self, data URIs, blob (for canvas/screenshots)

## Security Headers

**Implemented:**
- X-Frame-Options: DENY (prevent clickjacking)
- X-Content-Type-Options: nosniff (prevent MIME sniffing)
- X-XSS-Protection: 1; mode=block (XSS protection for older browsers)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: Camera, microphone, geolocation disabled
- DNS-Prefetch-Control: on

---

*Integration audit: 2026-01-29*
