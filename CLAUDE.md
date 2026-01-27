# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Psych! is a real-time multiplayer party game built with Next.js 16 and PartyKit. Players submit funny answers to prompts, then vote on their favorites. The game features AI-generated prompts via xAI's Grok API with hardcoded fallbacks.

## Commands

```bash
# Development (runs both Next.js and PartyKit servers)
npm run dev:all

# Individual servers
npm run dev        # Next.js only (localhost:3000)
npm run party      # PartyKit only (localhost:1999)

# Build & production
npm run build      # Next.js production build
npm run start      # Start production server

# Linting
npm run lint       # ESLint with Next.js + TypeScript configs
```

## Architecture

### Two-Server Architecture
- **Next.js App** (`src/app/`): Frontend UI, routing, static assets
- **PartyKit Server** (`party/main.ts`): Real-time game state, WebSocket connections, AI prompt generation

### Key Files
- `party/main.ts` - All game logic: state machine, player management, chat, AI integration
- `src/app/game/[roomId]/page.tsx` - Main game UI (lobby, writing, voting, reveal, final phases)
- `src/app/page.tsx` - Home page (create/join room)
- `src/app/join/[code]/page.tsx` - Join via shareable link
- `src/hooks/useTheme.ts` - Dark/light mode with system preference detection

### Game State Machine
```
LOBBY → WRITING → VOTING → REVEAL → (loop to WRITING or FINAL)
```

### State Management
- Server: `GameState` object in PartyKit (single source of truth)
- Client: React state synced via WebSocket messages
- Player ID persisted in localStorage per room for reconnection support

### Styling
- Tailwind CSS 4 with CSS custom properties for theming
- Light/dark mode via `.dark` class on `<html>`
- Theme colors defined in `src/app/globals.css`

## Environment Variables

- `XAI_API_KEY` - xAI API key for Grok prompt generation (PartyKit server)
- `NEXT_PUBLIC_PARTYKIT_HOST` - PartyKit host URL (defaults to `localhost:1999`)

## Key Patterns

### Prompt Generation
AI prompts are generated asynchronously with fallback to hardcoded prompts. The `generationId` counter prevents stale async results after game restarts.

### Input Sanitization
User input (names, themes, chat) is sanitized via `sanitizeForLLM()` before inclusion in AI prompts to prevent prompt injection.

### Rate Limiting
Chat messages are rate-limited per player (3 messages per 5 seconds). Chat history has soft/hard caps with automatic pruning.

### Voyeur Mode
Players can toggle "voyeur mode" to watch without participating. Voyeurs don't count toward active player requirements.
