#!/bin/bash

SERVER="192.168.160.190"
USER="localadmin"
PASSWORD="Adgl5581"

echo "Deploying HTTPS configuration to $SERVER..."

# Copy files to server
echo "Copying configuration files..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no setup-ssl.sh nginx-https.conf $USER@$SERVER:/tmp/

# Execute setup on server
echo "Setting up SSL certificate..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'EOF'
cd /tmp
chmod +x setup-ssl.sh
./setup-ssl.sh

# Backup existing config
echo "Backing up existing configuration..."
echo 'Adgl5581' | sudo -S cp /etc/nginx/sites-available/carbonoz /etc/nginx/sites-available/carbonoz.backup

# Deploy new config
echo "Deploying new Nginx configuration..."
echo 'Adgl5581' | sudo -S cp /tmp/nginx-https.conf /etc/nginx/sites-available/carbonoz

# Test Nginx configuration
echo "Testing Nginx configuration..."
echo 'Adgl5581' | sudo -S nginx -t

if [ $? -eq 0 ]; then
    echo "Configuration test passed. Reloading Nginx..."
    echo 'Adgl5581' | sudo -S systemctl reload nginx
    echo "HTTPS configuration deployed successfully!"
    echo ""
    echo "You can now access:"
    echo "  - https://192.168.160.190"
    echo "  - https://login.carbonoz.com"
    echo ""
    echo "Note: You'll see a security warning because it's a self-signed certificate."
    echo "Click 'Advanced' and 'Proceed' to continue."
else
    echo "Configuration test failed. Restoring backup..."
    echo 'Adgl5581' | sudo -S cp /etc/nginx/sites-available/carbonoz.backup /etc/nginx/sites-available/carbonoz
fi

# Cleanup
rm -f /tmp/setup-ssl.sh /tmp/nginx-https.conf
EOF

echo "Deployment complete!"
