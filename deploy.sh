#!/bin/bash

echo "🚀 Starting deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Stop existing PM2 processes
echo -e "${YELLOW}Stopping existing processes...${NC}"
pm2 stop ecosystem.config.js 2>/dev/null || true

# Backend deployment
echo -e "${YELLOW}Building backend...${NC}"
cd server-api
npm install --production=false
npm run build
cd ..

# Frontend deployment
echo -e "${YELLOW}Building frontend...${NC}"
cd offsettingdashboard
npm install
npm run build
cd ..

# Create logs directory
mkdir -p server-api/logs
mkdir -p offsettingdashboard/logs

# Start with PM2
echo -e "${YELLOW}Starting applications with PM2...${NC}"
pm2 start ecosystem.config.js
pm2 save

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "${GREEN}Frontend: http://192.168.160.190:5174${NC}"
echo -e "${GREEN}Backend API: http://192.168.160.190:3000${NC}"
echo -e "${GREEN}Domain: http://login.carbonoz.com${NC}"
echo ""
echo "Run 'pm2 logs' to view application logs"
echo "Run 'pm2 status' to check application status"
