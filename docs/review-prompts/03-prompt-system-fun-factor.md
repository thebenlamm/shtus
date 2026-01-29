# Adversarial Review: Prompt System & Fun Factor

> Run this review periodically to ensure prompts work and stay funny.

## Context

The game generates funny prompts for players to answer. It uses xAI's Grok API for AI generation with hardcoded fallbacks. Admins can override prompts or provide guidance. The fun of the game depends on prompts being funny and appropriate.

## Priority

The prompts need to WORK and be FUNNY. If AI fails, fallbacks must work. Admin controls must work. We don't care about prompt injection attacks or API rate limits.

## Files to Review

- `party/main.ts` (focus on: generateSinglePrompt, FALLBACK_PROMPTS, admin message handlers)
- `src/components/AdminPanel.tsx`

## What to Look For

### 1. AI Prompt Generation
- Does generation work when API key exists?
- Does fallback work when API key is missing?
- Does fallback work when API call fails/times out?
- Is there a loading state shown to users while generating?
- What if generation takes too long? (>30 seconds?)

### 2. Fallback Prompts
- Are fallbacks actually funny?
- Does `{name}` replacement work correctly?
- What if there are no players to substitute names?
- Are there enough fallback prompts to avoid repetition in short games?
- Are fallbacks appropriate for a friend group? (not offensive)

### 3. Prompt Timing
- Is next prompt pre-generated during voting? (no delay between rounds)
- What if pre-generation fails? Is there a backup?
- Does `generationId` correctly invalidate stale results?
- What if game restarts while generation is in-flight?

### 4. Admin Controls
- Does "exact question" override work for next round?
- Is exact question cleared after use (one-time)?
- Does "prompt guidance" persist across rounds?
- Can admin clear guidance?
- Does admin panel show current queued question/active guidance?
- What if admin sets override during WRITING phase? (too late)

### 5. Prompt Quality
- Does AI prompt include theme correctly?
- Does AI prompt include player names?
- Does AI prompt include round history for variety?
- Are prompts varied enough across rounds?
- What if theme is empty or very generic?

### 6. Edge Cases
- What happens with very long player names in prompts?
- What happens with unusual characters in theme?
- What if all previous prompts were fallbacks? (no history for AI)
- What if chat summary is empty?

## Do NOT Review

- Prompt injection attacks
- API rate limiting
- Cost optimization
- Security of admin key

## Output Format

List bugs/issues that would make prompts NOT WORK or NOT BE FUN. For each issue:
- **Severity**: CRITICAL (no prompts), HIGH (prompts broken), MEDIUM (prompts less fun)
- **Description**: What's wrong
- **Scenario**: How to trigger it
- **Suggested fix**: Brief recommendation
