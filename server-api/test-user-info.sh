#!/bin/bash

# Test the /user/infos endpoint to verify it returns the correct user ID

echo "Testing /user/infos endpoint..."
echo ""
echo "You need to provide a valid JWT token for user: elitedesire0@gmail.com"
echo ""
echo "Usage: ./test-user-info.sh <JWT_TOKEN>"
echo ""

if [ -z "$1" ]; then
  echo "❌ Error: JWT token is required"
  echo "Example: ./test-user-info.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  exit 1
fi

TOKEN=$1
API_URL="http://localhost:3000/api/v1/user/infos"

echo "🔍 Making request to: $API_URL"
echo ""

RESPONSE=$(curl -s -X GET "$API_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "📋 Response:"
echo "$RESPONSE" | jq '.'
echo ""

USER_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$USER_ID" == "69b1b74f8000da6638899381" ]; then
  echo "✅ SUCCESS: Correct user ID returned!"
  echo "User ID: $USER_ID"
else
  echo "❌ FAILED: Wrong user ID returned!"
  echo "Expected: 69b1b74f8000da6638899381"
  echo "Got: $USER_ID"
fi
