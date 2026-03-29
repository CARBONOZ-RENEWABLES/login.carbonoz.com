#!/bin/bash

# Carbonoz Production Deployment Script
# Run this on: localadmin@carbonoz-api:~/login.carbonoz.com

echo "🚀 Starting Carbonoz deployment..."

# 1. Pull latest changes from GitHub
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

# 2. Install/Update Backend Dependencies
echo "📦 Installing backend dependencies..."
cd server-api
npm install

# 3. Generate Prisma Client
echo "🔧 Generating Prisma client..."
npm run prisma:generate

# 4. Build Backend
echo "🏗️  Building backend..."
npm run build

# 5. Install/Update Frontend Dependencies
echo "📦 Installing frontend dependencies..."
cd ../offsettingdashboard
npm install

# 6. Build Frontend
echo "🏗️  Building frontend..."
npm run build

# 7. Restart PM2 Services
echo "🔄 Restarting PM2 services..."
cd ..
pm2 restart ecosystem.config.js

# 8. Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# 9. Show PM2 status
echo "✅ Deployment complete! Current PM2 status:"
pm2 status

echo ""
echo "🎉 Deployment finished successfully!"
echo "📊 Check logs with: pm2 logs"
echo "🔍 Monitor with: pm2 monit"
