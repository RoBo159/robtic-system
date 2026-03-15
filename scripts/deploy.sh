#!/bin/bash

PROJECT="/root/robtic/robtic-system"

set -a
source $PROJECT/.env
set +a

WEBHOOK=$MONITOR_WEBHOOK

cd $PROJECT || exit

STATUS="success"
MSG=""
echo "Starting deployment pipeline..."

git fetch origin || STATUS="fail" MSG="Failed to fetch latest code from repository."
git reset --hard origin/main || STATUS="fail" MSG="Failed to reset local code to match remote repository."
git pull origin main || STATUS="fail" MSG="Failed to pull latest code from repository."
bun install || STATUS="fail" MSG="Failed to install dependencies."
bun run build || STATUS="fail" MSG="Failed to build application."
pm2 restart robtic-app || STATUS="fail" MSG="Failed to restart application with PM2."

echo "Deployment finished."

if [ "$STATUS" = "fail" ]; then

echo "Deployment failed. Sending alert..."

curl -H "Content-Type: application/json" \
-d '{
"embeds":[
{
"title":"Deployment Failed",
"description":"Deployment pipeline failed on VPS \n Error: '"$MSG"'",
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