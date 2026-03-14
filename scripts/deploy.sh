#!/bin/bash

PROJECT="/root/robtic/robtic-system"

set -a
source $PROJECT/.env
set +a

WEBHOOK=$MONITOR_WEBHOOK

cd $PROJECT || exit

STATUS="success"
echo "Starting deployment pipeline..."

git fetch origin || STATUS="fail"
git reset --hard origin/main || STATUS="fail"
git pull origin main || STATUS="fail"
bun install || STATUS="fail"
bun run build || STATUS="fail"
pm2 restart robtic-app || STATUS="fail"

echo "Deployment finished."

if [ "$STATUS" = "fail" ]; then

echo "Deployment failed. Sending alert..."

curl -H "Content-Type: application/json" \
-d '{
"embeds":[
{
"title":"Deployment Failed",
"description":"Deployment pipeline failed on VPS",
"color":15158332
}
]
}' $WEBHOOK

else

curl -H "Content-Type: application/json" \
-d '{
"embeds":[
{
"title":"Deployment Successful",
"description":"Bot deployed successfully",
"color":5763719
}
]
}' $WEBHOOK

fi