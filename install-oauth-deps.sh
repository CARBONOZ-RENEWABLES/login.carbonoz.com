#!/bin/bash

SERVER="192.168.160.190"
USER="localadmin"
# The SSH password is NOT stored here: export CARBONOZ_SSH_PASSWORD from the password manager
# (better: SSH keys). Remote sudo runs non-interactively (sudo -n).
PASSWORD="${CARBONOZ_SSH_PASSWORD:?Set CARBONOZ_SSH_PASSWORD from the password manager}"

echo "Installing OAuth dependencies..."

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'EOF'
cd /home/localadmin/login.carbonoz.com/server-api
sudo -n npm install passport-google-oauth20 passport-apple @types/passport-google-oauth20
echo "Dependencies installed successfully!"
EOF
