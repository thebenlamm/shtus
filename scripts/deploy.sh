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
  vercel
else
  echo "Usage: ./scripts/deploy.sh [staging|production]"
  exit 1
fi

echo "Done!"
