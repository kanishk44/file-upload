#!/bin/bash

# Test process endpoint
# Usage: ./test-process.sh [HOST] [FILE_ID]

HOST="${1:-http://localhost:3000}"
FILE_ID="${2}"

if [ -z "$FILE_ID" ]; then
    echo "Error: FILE_ID is required"
    echo "Usage: ./test-process.sh [HOST] [FILE_ID]"
    exit 1
fi

echo "Testing process endpoint..."
echo "Host: $HOST"
echo "File ID: $FILE_ID"
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST "$HOST/process/$FILE_ID")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_code" -eq 201 ]; then
    echo ""
    echo "✓ Job created successfully!"
    
    # Extract jobId
    jobId=$(echo "$body" | jq -r '.jobId' 2>/dev/null)
    if [ ! -z "$jobId" ] && [ "$jobId" != "null" ]; then
        echo "Job ID: $jobId"
        echo ""
        echo "To check job status, run:"
        echo "  curl $HOST/jobs/$jobId | jq '.'"
        echo ""
        echo "Checking status in 2 seconds..."
        sleep 2
        
        echo ""
        echo "Current job status:"
        curl -s "$HOST/jobs/$jobId" | jq '.'
    fi
else
    echo ""
    echo "✗ Job creation failed"
    exit 1
fi

