#!/bin/bash
# Carbonoz Production Deployment Script
# Run this on: localadmin@carbonoz-api:~/login.carbonoz.com
#
# Stops at the first failing step, BEFORE pm2 is restarted, so a failed install
# or build never restarts the running services onto a broken build. Note: both
# builds empty their output folder first (nest deleteOutDir, vite emptyOutDir),
# so after a failed build do not restart pm2 by hand — roll back first
# (docs/deployment-runbook.md).
#
#   ./deploy-update.sh            # deploy origin/main
#   SKIP_DB_PUSH=1 ./deploy-update.sh  # skip `prisma db push` (schema unchanged)
#   DEPLOY_ROLE=api ./deploy-update.sh       # backend host: API only (pm2 carbonoz-api)
#   DEPLOY_ROLE=frontend ./deploy-update.sh  # web host: frontend only (pm2 carbonoz-frontend)
#   (default DEPLOY_ROLE=all: both on this host)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs

ROLE="${DEPLOY_ROLE:-all}"
case "$ROLE" in all|api|frontend) ;; *) echo "❌ DEPLOY_ROLE must be all, api or frontend"; exit 2 ;; esac
echo "🚀 Starting Carbonoz deployment (role: $ROLE)..."

# 0. Rollback point: the commit that was running before THIS deployment.
#    logs/deploy-in-progress exists from the start until success, so re-running
#    after a failure keeps the original rollback commit instead of recording the
#    half-deployed one.
#    Written before `git pull`, so a failed pull leaves it holding the commit
#    that is still checked out and running.
if [ -f logs/deploy-in-progress ]; then
  PREVIOUS=$(cat logs/deploy-in-progress)
  if ! git cat-file -e "${PREVIOUS}^{commit}" 2>/dev/null; then
    echo "❌ logs/deploy-in-progress does not name a commit of this repository; check it (docs/deployment-runbook.md section 5) before deploying"
    exit 1
  fi
  echo "⚠️  Resuming an unfinished deployment; rollback point stays $PREVIOUS"
else
  PREVIOUS=$(git rev-parse HEAD)
  echo "$PREVIOUS" > logs/deploy-in-progress.tmp
  mv logs/deploy-in-progress.tmp logs/deploy-in-progress
fi
echo "$PREVIOUS" > logs/previous-commit
echo "↩️  Rollback commit: $PREVIOUS (saved in logs/previous-commit)"

# 1. Pull latest changes from GitHub (fast-forward only: never a surprise merge on the server)
echo "📥 Pulling latest changes from GitHub..."
git pull --ff-only origin main
echo "📌 Deploying commit: $(git rev-parse HEAD)"

if [ "$ROLE" != "frontend" ]; then
# 2. Install Backend Dependencies (as CI does: Nest 9/10 peer ranges need --legacy-peer-deps)
echo "📦 Installing backend dependencies..."
cd server-api
npm ci --legacy-peer-deps

# 3. Generate Prisma Client
echo "🔧 Generating Prisma client..."
npm run prisma:generate

# 4. Read-only: installations sharing a systemId. Exits non-zero if there are
#    any, which stops the deployment here: BEFORE the schema change, the
#    builds and the restart. Nothing above this line writes to the database.
echo "🔎 Checking for duplicate installation systemIds..."
node scripts/installation-system-id-index.js check

# 5. Database schema: MongoDB collections and indexes. Additive: `db push`
#    creates missing collections/indexes and never drops data on MongoDB. It
#    fails (and the deploy stops) if a new unique index meets duplicate data.
if [ "${SKIP_DB_PUSH:-0}" != "1" ]; then
  echo "🗄️  Applying database schema (prisma db push)..."
  npx prisma db push --skip-generate
fi

# 6. Build Backend
echo "🏗️  Building backend..."
npm run build
test -f dist/src/main.js
cd ..
fi

if [ "$ROLE" != "api" ]; then
# 7. Install Frontend Dependencies
echo "📦 Installing frontend dependencies..."
cd offsettingdashboard
npm ci

# 8. Build Frontend
echo "🏗️  Building frontend..."
npm run build
test -f dist/index.html
cd ..
fi

# 9. Restart PM2 Services (only this host's part)
echo "🔄 Restarting PM2 services..."
case "$ROLE" in
  api) pm2 startOrRestart ecosystem.config.js --only carbonoz-api ;;
  frontend) pm2 startOrRestart ecosystem.config.js --only carbonoz-frontend ;;
  *) pm2 restart ecosystem.config.js ;;
esac

# 10. Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# 11. Show PM2 status
echo "✅ Deployment complete! Current PM2 status:"
pm2 status
rm -f logs/deploy-in-progress

echo ""
echo "🎉 Deployment finished successfully!"
echo "📊 Check logs with: pm2 logs"
echo "🔍 Monitor with: pm2 monit"
echo "↩️  Roll back with the steps in docs/deployment-runbook.md (previous commit in logs/previous-commit)"
