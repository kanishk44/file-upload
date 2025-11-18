#!/bin/bash

# Test upload endpoint
# Usage: ./test-upload.sh [HOST] [FILE]

HOST="${1:-http://localhost:3000}"
FILE="${2:-test-data/sample.json}"

echo "Testing upload endpoint..."
echo "Host: $HOST"
echo "File: $FILE"
echo ""

if [ ! -f "$FILE" ]; then
    echo "Error: File not found: $FILE"
    exit 1
fi

response=$(curl -s -w "\n%{http_code}" -F "file=@$FILE" "$HOST/upload")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_code" -eq 200 ]; then
    echo ""
    echo "✓ Upload successful!"
    
    # Extract fileId for follow-up processing
    fileId=$(echo "$body" | jq -r '.fileId' 2>/dev/null)
    if [ ! -z "$fileId" ] && [ "$fileId" != "null" ]; then
        echo "File ID: $fileId"
        echo ""
        echo "To process this file, run:"
        echo "  ./test-process.sh $HOST $fileId"
    fi
else
    echo ""
    echo "✗ Upload failed"
    exit 1
fi

