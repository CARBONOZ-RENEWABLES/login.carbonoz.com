#!/bin/bash

SERVER="192.168.160.190"
USER="localadmin"
PASSWORD="Adgl5581"

echo "=== Quick OAuth Deployment ==="
echo "This will deploy the OAuth code to the server."
echo "You'll need to configure OAuth credentials separately."
echo ""

# Create temp directory structure
mkdir -p /tmp/oauth-deploy/backend/strategy
mkdir -p /tmp/oauth-deploy/backend/guard
mkdir -p /tmp/oauth-deploy/backend/interfaces
mkdir -p /tmp/oauth-deploy/backend/config
mkdir -p /tmp/oauth-deploy/frontend

# Copy backend files
cp server-api/src/auth/strategy/google.strategy.ts /tmp/oauth-deploy/backend/strategy/
cp server-api/src/auth/strategy/apple.strategy.ts /tmp/oauth-deploy/backend/strategy/
cp server-api/src/auth/guard/oauth.guard.ts /tmp/oauth-deploy/backend/guard/
cp server-api/src/auth/auth.controller.ts /tmp/oauth-deploy/backend/
cp server-api/src/auth/auth.service.ts /tmp/oauth-deploy/backend/
cp server-api/src/auth/auth.module.ts /tmp/oauth-deploy/backend/
cp server-api/src/__shared__/interfaces/index.ts /tmp/oauth-deploy/backend/interfaces/
cp server-api/src/__shared__/config/app.config.ts /tmp/oauth-deploy/backend/config/

# Copy frontend files
cp offsettingdashboard/src/components/auth/login.tsx /tmp/oauth-deploy/frontend/
cp offsettingdashboard/src/App.tsx /tmp/oauth-deploy/frontend/

echo "Step 1: Uploading files to server..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER "mkdir -p /tmp/oauth-deploy/backend/strategy /tmp/oauth-deploy/backend/guard /tmp/oauth-deploy/backend/interfaces /tmp/oauth-deploy/backend/config /tmp/oauth-deploy/frontend"

sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no -r /tmp/oauth-deploy/* $USER@$SERVER:/tmp/oauth-deploy/

echo "Step 2: Installing dependencies and deploying..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
cd /home/localadmin/login.carbonoz.com/server-api

# Install OAuth dependencies
echo "Installing OAuth packages..."
npm install passport-google-oauth20 passport-apple @types/passport-google-oauth20

# Backup existing files
echo "Creating backups..."
mkdir -p ~/oauth-backup-$(date +%Y%m%d-%H%M%S)
cp -r src/auth ~/oauth-backup-$(date +%Y%m%d-%H%M%S)/
cp -r src/__shared__ ~/oauth-backup-$(date +%Y%m%d-%H%M%S)/

# Deploy backend files
echo "Deploying backend files..."
cp /tmp/oauth-deploy/backend/strategy/* src/auth/strategy/
cp /tmp/oauth-deploy/backend/guard/oauth.guard.ts src/auth/guard/
cp /tmp/oauth-deploy/backend/auth.controller.ts src/auth/
cp /tmp/oauth-deploy/backend/auth.service.ts src/auth/
cp /tmp/oauth-deploy/backend/auth.module.ts src/auth/
cp /tmp/oauth-deploy/backend/interfaces/index.ts src/__shared__/interfaces/
cp /tmp/oauth-deploy/backend/config/app.config.ts src/__shared__/config/

# Build backend
echo "Building backend..."
npm run build

cd /home/localadmin/login.carbonoz.com/offsettingdashboard

# Backup frontend
echo "Backing up frontend..."
cp src/components/auth/login.tsx ~/oauth-backup-$(date +%Y%m%d-%H%M%S)/
cp src/App.tsx ~/oauth-backup-$(date +%Y%m%d-%H%M%S)/

# Deploy frontend files
echo "Deploying frontend files..."
cp /tmp/oauth-deploy/frontend/login.tsx src/components/auth/
cp /tmp/oauth-deploy/frontend/App.tsx src/

# Build frontend
echo "Building frontend..."
npm run build

# Restart services
echo "Restarting services..."
cd /home/localadmin/login.carbonoz.com
pm2 restart all
pm2 save

echo "Cleaning up..."
rm -rf /tmp/oauth-deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Backup created in: ~/oauth-backup-$(date +%Y%m%d-%H%M%S)/"
ENDSSH

# Cleanup local temp
rm -rf /tmp/oauth-deploy

echo ""
echo "=== Deployment Summary ==="
echo ""
echo "✅ OAuth code deployed successfully!"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Configure Google OAuth:"
echo "   - Visit: https://console.cloud.google.com/apis/credentials"
echo "   - Create OAuth 2.0 Client ID"
echo "   - Redirect URI: https://login.carbonoz.com/api/v1/auth/google/callback"
echo ""
echo "2. Configure Apple OAuth (requires Apple Developer account):"
echo "   - Visit: https://developer.apple.com/account/resources/identifiers"
echo "   - Create Service ID"
echo "   - Return URL: https://login.carbonoz.com/api/v1/auth/apple/callback"
echo ""
echo "3. Update server .env file:"
echo "   ssh $USER@$SERVER"
echo "   cd /home/localadmin/login.carbonoz.com/server-api"
echo "   nano .env"
echo ""
echo "   Add these lines:"
echo "   GOOGLE_CLIENT_ID=your_google_client_id"
echo "   GOOGLE_CLIENT_SECRET=your_google_client_secret"
echo "   APPLE_CLIENT_ID=your_apple_client_id"
echo "   APPLE_TEAM_ID=your_apple_team_id"
echo "   APPLE_KEY_ID=your_apple_key_id"
echo "   APPLE_PRIVATE_KEY=your_apple_private_key"
echo ""
echo "4. Restart services:"
echo "   pm2 restart all"
echo ""
echo "📖 Full setup guide: OAUTH_SETUP_GUIDE.md"
echo ""
