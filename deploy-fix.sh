#!/bin/bash
set -e

echo "=== Carbonoz Complete Deployment Fix ==="

cd /home/localadmin/login.carbonoz.com

# 1. Setup Nginx
echo "Step 1: Configuring Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/carbonoz
sudo ln -sf /etc/nginx/sites-available/carbonoz /etc/nginx/sites-enabled/carbonoz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
echo "✓ Nginx configured"

# 2. Build Frontend
echo "Step 2: Building frontend..."
cd offsettingdashboard
npm run build
echo "✓ Frontend built"

# 3. Restart PM2 services
echo "Step 3: Restarting services..."
cd /home/localadmin/login.carbonoz.com
pm2 delete all || true
pm2 start ecosystem.config.js
pm2 save
echo "✓ Services restarted"

# 4. Check status
echo ""
echo "=== Deployment Complete ==="
echo "Services status:"
pm2 status
echo ""
echo "Access your application:"
echo "  - http://login.carbonoz.com"
echo "  - http://192.168.160.190"
echo ""
echo "API endpoint:"
echo "  - http://login.carbonoz.com/api/v1"
