#!/bin/bash
set -e

ENV="${1:-staging}"

if [ "$ENV" = "production" ]; then
  echo "Deploying to PRODUCTION..."
  npx partykit deploy --name shtus
  vercel --prod
elif [ "$ENV" = "staging" ]; then
  echo "Deploying to STAGING..."
  npx partykit deploy --name shtus-staging
  DEPLOYMENT_URL=$(vercel 2>&1 | grep -E "^https://psych-.*\.vercel\.app$" | head -1)
  if [ -n "$DEPLOYMENT_URL" ]; then
    echo "Updating test.shtus.org alias..."
    vercel alias set "$DEPLOYMENT_URL" test.shtus.org
  else
    echo "Warning: Could not extract deployment URL, alias not updated"
  fi
else
  echo "Usage: ./scripts/deploy.sh [staging|production]"
  exit 1
fi

echo "Done!"
