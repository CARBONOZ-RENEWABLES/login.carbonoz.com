#!/bin/bash

# Create SSL directory
echo "Creating SSL directory..."
echo 'Adgl5581' | sudo -S mkdir -p /etc/nginx/ssl

# Generate self-signed certificate
echo "Generating self-signed SSL certificate..."
echo 'Adgl5581' | sudo -S openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/login.carbonoz.com.key \
  -out /etc/nginx/ssl/login.carbonoz.com.crt \
  -subj "/C=US/ST=State/L=City/O=Carbonoz/CN=login.carbonoz.com" \
  -addext "subjectAltName=DNS:login.carbonoz.com,IP:192.168.160.190"

echo "SSL certificate created successfully!"
