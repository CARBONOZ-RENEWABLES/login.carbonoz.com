#!/bin/bash

echo "=== Fixing Carbonoz Deployment ==="

# 1. Copy Nginx config
echo "1. Setting up Nginx..."
sudo cp /home/localadmin/login.carbonoz.com/nginx.conf /etc/nginx/sites-available/carbonoz
sudo ln -sf /etc/nginx/sites-available/carbonoz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# 2. Build and start frontend
echo "2. Building frontend..."
cd /home/localadmin/login.carbonoz.com/offsettingdashboard
npm run build

# 3. Update PM2 ecosystem
echo "3. Restarting services..."
cd /home/localadmin/login.carbonoz.com
pm2 restart ecosystem.config.js
pm2 save

echo "=== Deployment Fixed ==="
echo "Frontend: http://login.carbonoz.com"
echo "Backend API: http://login.carbonoz.com/api/v1"
