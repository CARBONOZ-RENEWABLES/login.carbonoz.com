#!/bin/bash

echo "Installing MongoDB..."

# Import MongoDB public key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update and install
sudo apt update
sudo apt install -y mongodb-org

# Start and enable MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Configure replica set
echo "Configuring replica set..."
sudo sed -i 's/#replication:/replication:\n  replSetName: "rs0"/' /etc/mongod.conf

# Restart MongoDB
sudo systemctl restart mongod

# Wait for MongoDB to start
sleep 5

# Initialize replica set
mongosh --eval "rs.initiate()"

echo "✅ MongoDB installed and configured with replica set 'rs0'"
echo "Status:"
sudo systemctl status mongod --no-pager
