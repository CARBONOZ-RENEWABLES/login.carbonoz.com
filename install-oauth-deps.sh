#!/bin/bash

SERVER="192.168.160.190"
USER="localadmin"
PASSWORD="Adgl5581"

echo "Installing OAuth dependencies..."

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'EOF'
cd /home/localadmin/login.carbonoz.com/server-api
echo 'Adgl5581' | sudo -S npm install passport-google-oauth20 passport-apple @types/passport-google-oauth20
echo "Dependencies installed successfully!"
EOF
