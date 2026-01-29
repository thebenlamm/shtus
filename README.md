# Shtus

A real-time multiplayer party game where players submit funny answers to prompts, then vote on their favorites. Think Cards Against Humanity meets a comedy roast.

## Quick Start

```bash
# Install dependencies
npm install

# Run both servers (Next.js + PartyKit)
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) to play.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | No | xAI API key for AI-generated prompts. Falls back to hardcoded prompts if not set. |
| `NEXT_PUBLIC_PARTYKIT_HOST` | No | PartyKit host URL. Defaults to `localhost:1999` in dev. |
| `CHAT_ENABLED` | No | Set to `true` to enable in-game chat. |
| `ADMIN_SECRET_KEY` | No | Secret key for admin features (prompt overrides). |

## Scripts

### Development

```bash
npm run dev:all      # Run Next.js + PartyKit together
npm run dev          # Next.js only (localhost:3000)
npm run party        # PartyKit only (localhost:1999)
```

### Testing

```bash
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run test:prompts # Interactive prompt tester (see below)
```

### Deployment

```bash
npm run deploy:staging     # Deploy to staging
npm run deploy:production  # Deploy to production
```

## Prompt Tester

Interactive CLI tool to test AI prompt generation without running a full game.

```bash
npm run test:prompts
```

Uses hardcoded player names (Ben, Sarah, Mike, Jordan, Alex) and the same system prompt as the real game. You provide:

1. **Theme** (optional) - e.g., "tech bros", "wine moms", or press Enter for default
2. **Chat themes** (optional) - pre-summarized chat context, e.g., "players joking about Ben's cooking disasters"

Generates 5 prompts, then you can:
- `y` - Generate 5 more with same inputs
- `n` - Start over with new inputs
- `q` - Quit

Requires `XAI_API_KEY` environment variable.

## Architecture

- **Next.js 16** - Frontend UI and routing
- **PartyKit** - Real-time game state via WebSockets
- **xAI Grok** - AI-generated prompts with hardcoded fallbacks
- **Tailwind CSS 4** - Styling with dark/light mode support

## Architecture Details

### Two-Server Architecture
- **Next.js App** (`src/app/`): Frontend UI, routing, static assets
- **PartyKit Server** (`party/main.ts`): Real-time game state, WebSocket connections, AI prompt generation

### Game State Machine
```
LOBBY → WRITING → VOTING → REVEAL → (loop to WRITING or FINAL)
```
