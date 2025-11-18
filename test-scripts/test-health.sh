#!/bin/bash

# Test health check endpoint
# Usage: ./test-health.sh [HOST]

HOST="${1:-http://localhost:3000}"

echo "Testing health check endpoint..."
echo "Host: $HOST"
echo ""

response=$(curl -s -w "\n%{http_code}" "$HOST/healthz")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_code" -eq 200 ]; then
    echo ""
    echo "✓ Service is healthy"
elif [ "$http_code" -eq 503 ]; then
    echo ""
    echo "⚠ Service is degraded (some dependencies unhealthy)"
else
    echo ""
    echo "✗ Service is unhealthy"
    exit 1
fi

