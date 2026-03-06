#!/bin/bash

SERVER="192.168.160.190"
USER="localadmin"
PASSWORD="Adgl5581"

echo "=== Deploying OAuth Implementation ==="

# Copy all files to server
echo "Step 1: Copying files to server..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no \
  server-api/src/auth/strategy/google.strategy.ts \
  server-api/src/auth/strategy/apple.strategy.ts \
  server-api/src/auth/guard/oauth.guard.ts \
  server-api/src/auth/auth.controller.ts \
  server-api/src/auth/auth.service.ts \
  server-api/src/auth/auth.module.ts \
  server-api/src/__shared__/interfaces/index.ts \
  server-api/src/__shared__/config/app.config.ts \
  $USER@$SERVER:/tmp/

sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no \
  offsettingdashboard/src/components/auth/login.tsx \
  offsettingdashboard/src/App.tsx \
  $USER@$SERVER:/tmp/frontend/

echo "Step 2: Installing dependencies and updating backend..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
cd /home/localadmin/login.carbonoz.com/server-api

# Install OAuth dependencies
echo "Installing OAuth packages..."
npm install passport-google-oauth20 passport-apple @types/passport-google-oauth20

# Backup existing files
echo "Backing up existing files..."
mkdir -p /tmp/backup
cp src/auth/auth.controller.ts /tmp/backup/
cp src/auth/auth.service.ts /tmp/backup/
cp src/auth/auth.module.ts /tmp/backup/
cp src/__shared__/interfaces/index.ts /tmp/backup/
cp src/__shared__/config/app.config.ts /tmp/backup/

# Copy new files
echo "Deploying new backend files..."
cp /tmp/google.strategy.ts src/auth/strategy/
cp /tmp/apple.strategy.ts src/auth/strategy/
cp /tmp/oauth.guard.ts src/auth/guard/
cp /tmp/auth.controller.ts src/auth/
cp /tmp/auth.service.ts src/auth/
cp /tmp/auth.module.ts src/auth/
cp /tmp/index.ts src/__shared__/interfaces/
cp /tmp/app.config.ts src/__shared__/config/

# Build backend
echo "Building backend..."
npm run build

ENDSSH

echo "Step 3: Updating frontend..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
cd /home/localadmin/login.carbonoz.com/offsettingdashboard

# Backup existing files
echo "Backing up existing frontend files..."
cp src/components/auth/login.tsx /tmp/backup/
cp src/App.tsx /tmp/backup/

# Copy new files
echo "Deploying new frontend files..."
cp /tmp/frontend/login.tsx src/components/auth/
cp /tmp/frontend/App.tsx src/

# Build frontend
echo "Building frontend..."
npm run build

ENDSSH

echo "Step 4: Restarting services..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
cd /home/localadmin/login.carbonoz.com

# Restart PM2 services
pm2 restart all
pm2 save

echo "Services restarted successfully!"
ENDSSH

echo ""
echo "=== OAuth Deployment Complete ==="
echo ""
echo "⚠️  IMPORTANT: Configure OAuth Credentials"
echo ""
echo "1. Google OAuth Setup:"
echo "   - Go to: https://console.cloud.google.com/apis/credentials"
echo "   - Create OAuth 2.0 Client ID"
echo "   - Add authorized redirect URI: https://login.carbonoz.com/api/v1/auth/google/callback"
echo "   - Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server .env"
echo ""
echo "2. Apple OAuth Setup:"
echo "   - Go to: https://developer.apple.com/account/resources/identifiers"
echo "   - Create Service ID and configure Sign in with Apple"
echo "   - Add return URL: https://login.carbonoz.com/api/v1/auth/apple/callback"
echo "   - Add APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY to server .env"
echo ""
echo "3. Update server .env file:"
echo "   ssh $USER@$SERVER"
echo "   cd /home/localadmin/login.carbonoz.com/server-api"
echo "   nano .env"
echo ""
echo "4. Restart services after updating .env:"
echo "   pm2 restart all"
echo ""
