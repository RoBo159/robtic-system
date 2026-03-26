#!/bin/bash

set -euo pipefail

PROJECT="/home/robtic/robtic-system"
SERVER="core.robtic.org"

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

cd "$PROJECT"

set -a
source "$PROJECT/.env"
set +a

WEBHOOK="${MONITOR_WEBHOOK}"

START_TIME=$(date +%s)

echo "🚀 Starting deployment pipeline..."

cleanup_failure() {
  FAILED_STEP="$1"
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  echo "❌ Deployment failed at step: $FAILED_STEP"

  curl -s -H "Content-Type: application/json" \
  -d "{
    \"embeds\": [
      {
        \"title\": \"❌ Robtic Deployment Failed\",
        \"description\": \"Deployment pipeline failed.\",
        \"color\": 15158332,
        \"fields\": [
          {
            \"name\": \"Failed Step\",
            \"value\": \"$FAILED_STEP\",
            \"inline\": false
          },
          {
            \"name\": \"Server\",
            \"value\": \"$SERVER\",
            \"inline\": true
          },
          {
            \"name\": \"Duration\",
            \"value\": \"${DURATION}s\",
            \"inline\": true
          }
        ]
      }
    ]
  }" "$WEBHOOK"

  exit 1
}

STEP="Install dependencies"
echo "📦 $STEP"
bun install || cleanup_failure "$STEP"

STEP="Build application"
echo "🏗 $STEP"
bun run build || cleanup_failure "$STEP"

STEP="Restart PM2"
echo "♻️ $STEP"
pm2 reload robtic-core || pm2 start ecosystem.config.js --only robtic-core || cleanup_failure "$STEP"

pm2 save

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B | head -n 1)
COMMIT_AUTHOR=$(git log -1 --pretty=%an)

echo "✅ Deployment successful."

curl -s -H "Content-Type: application/json" \
-d "{
  \"embeds\": [
    {
      \"title\": \"🚀 Robtic Deployment Successful\",
      \"color\": 5763719,
      \"fields\": [
        {
          \"name\": \"Commit\",
          \"value\": \"\`$COMMIT_HASH\`\",
          \"inline\": true
        },
        {
          \"name\": \"Author\",
          \"value\": \"$COMMIT_AUTHOR\",
          \"inline\": true
        },
        {
          \"name\": \"Message\",
          \"value\": \"$COMMIT_MSG\",
          \"inline\": false
        },
        {
          \"name\": \"Duration\",
          \"value\": \"${DURATION}s\",
          \"inline\": true
        },
        {
          \"name\": \"Server\",
          \"value\": \"$SERVER\",
          \"inline\": true
        }
      ]
    }
  ]
}" "$WEBHOOK"