#!/bin/bash
# Stop MongoDB if running
brew services stop mongodb-community 2>/dev/null || true

# Start MongoDB with replica set
mongod --replSet rs0 --port 27017 --dbpath /usr/local/var/mongodb --bind_ip localhost &

# Wait for MongoDB to start
sleep 5

# Initialize replica set
mongosh --eval "rs.initiate()"

echo "MongoDB replica set initialized"
