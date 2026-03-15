#!/bin/bash

PROJECT="/root/robtic/robtic-system"

set -a
source $PROJECT/.env
set +a

WEBHOOK=$MONITOR_WEBHOOK

cd $PROJECT || exit 1

START_TIME=$(date +%s)

STATUS="success"
MSG=""
STEP=""

echo "🚀 Starting deployment pipeline..."

fail_step () {
    STATUS="fail"
    MSG="$1"
}

STEP="Install dependencies"
bun install || fail_step "$STEP"

STEP="Build application"
bun run build || fail_step "$STEP"
if ! bun run build; then fail_step "$STEP"

STEP="Restart PM2"
pm2 reload robtic-app || fail_step "$STEP"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

COMMIT_HASH=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B | head -n 1)
COMMIT_AUTHOR=$(git log -1 --pretty=%an)

echo "Deployment finished."

if [ "$STATUS" = "fail" ]; then

echo "❌ Deployment failed. Sending alert..."

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
\"value\": \"$MSG\",
\"inline\": false
},
{
\"name\": \"Server\",
\"value\": \"Robtic VPS\",
\"inline\": true
}
]
}
]
}" $WEBHOOK

else

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
\"value\": \"Robtic VPS\",
\"inline\": true
}
]
}
]
}" $WEBHOOK

fi