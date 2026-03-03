#!/bin/bash

# Stop MongoDB if running
sudo systemctl stop mongod 2>/dev/null || true

# Backup original config
sudo cp /etc/mongod.conf /etc/mongod.conf.backup 2>/dev/null || true

# Update MongoDB config to enable replica set
sudo tee /etc/mongod.conf > /dev/null <<EOF
storage:
  dbPath: /var/lib/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1,192.168.160.190

replication:
  replSetName: "rs0"
EOF

# Start MongoDB
sudo systemctl start mongod

# Wait for MongoDB to start
sleep 5

# Initialize replica set
mongosh --eval "rs.initiate()"

# Check status
mongosh --eval "rs.status()"

echo "MongoDB replica set initialized successfully"
