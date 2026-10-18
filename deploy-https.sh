#!/bin/bash

SERVER="192.168.160.190"
USER="localadmin"
# The SSH password is NOT stored here: export CARBONOZ_SSH_PASSWORD from the password manager
# (better: SSH keys). Remote sudo runs non-interactively (sudo -n).
PASSWORD="${CARBONOZ_SSH_PASSWORD:?Set CARBONOZ_SSH_PASSWORD from the password manager}"

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
sudo -n cp /etc/nginx/sites-available/carbonoz /etc/nginx/sites-available/carbonoz.backup

# Deploy new config
echo "Deploying new Nginx configuration..."
sudo -n cp /tmp/nginx-https.conf /etc/nginx/sites-available/carbonoz

# Test Nginx configuration
echo "Testing Nginx configuration..."
sudo -n nginx -t

if [ $? -eq 0 ]; then
    echo "Configuration test passed. Reloading Nginx..."
    sudo -n systemctl reload nginx
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
    sudo -n cp /etc/nginx/sites-available/carbonoz.backup /etc/nginx/sites-available/carbonoz
fi

# Cleanup
rm -f /tmp/setup-ssl.sh /tmp/nginx-https.conf
EOF

echo "Deployment complete!"
