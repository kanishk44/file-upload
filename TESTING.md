# Testing Guide

This document provides detailed testing procedures for the File Upload & Processing Service.

## Table of Contents

- [Quick Tests](#quick-tests)
- [Functional Tests](#functional-tests)
- [Performance Tests](#performance-tests)
- [Crash Recovery Tests](#crash-recovery-tests)
- [Concurrent Processing Tests](#concurrent-processing-tests)

## Quick Tests

### Prerequisites

```bash
# Ensure service is running
curl http://localhost:3000/healthz

# Should return status: "healthy"
```

### Test 1: Upload Small File

```bash
./test-scripts/test-upload.sh http://localhost:3000 test-data/sample.json
```

**Expected Result:**

- HTTP 200
- Returns `fileId` and `s3Key`
- File visible in S3 bucket

### Test 2: Process File

```bash
# Use fileId from previous test
./test-scripts/test-process.sh http://localhost:3000 <fileId>
```

**Expected Result:**

- HTTP 201
- Returns `jobId` with state "queued"
- Job transitions to "in_progress" then "completed"

### Test 3: Check Job Status

```bash
curl http://localhost:3000/jobs/<jobId> | jq '.'
```

**Expected Result:**

- Job state is "completed"
- Progress shows correct counts
- Records inserted into MongoDB

## Functional Tests

### Test Upload Different File Types

**JSON Lines:**

```bash
curl -F "file=@test-data/sample.json" http://localhost:3000/upload
```

**CSV:**

```bash
curl -F "file=@test-data/sample.csv" http://localhost:3000/upload
```

**Large File:**

```bash
# Generate large file first
node test-data/generate-large-file.js 100000 test-data/medium.json

curl -F "file=@test-data/medium.json" http://localhost:3000/upload
```

### Test Invalid Uploads

**No file provided:**

```bash
curl -X POST http://localhost:3000/upload
# Expected: HTTP 400 - Bad Request
```

**Invalid content type:**

```bash
curl -F "file=@test-data/sample.json" \
  -H "Content-Type: application/json" \
  http://localhost:3000/upload
# Expected: HTTP 400 - Content-Type must be multipart/form-data
```

### Test Job Processing Edge Cases

**Process non-existent file:**

```bash
curl -X POST http://localhost:3000/process/507f1f77bcf86cd799439011
# Expected: HTTP 404 - File not found
```

**Get non-existent job:**

```bash
curl http://localhost:3000/jobs/507f1f77bcf86cd799439011
# Expected: HTTP 404 - Job not found
```

**Invalid ID format:**

```bash
curl -X POST http://localhost:3000/process/invalid-id
# Expected: HTTP 400 - Invalid fileId format
```

## Performance Tests

### Test Large File Upload

Generate a large file (1 million lines, ~100MB):

```bash
node test-data/generate-large-file.js 1000000 test-data/large-1m.json
```

Upload and time it:

```bash
time curl -F "file=@test-data/large-1m.json" http://localhost:3000/upload
```

**Expected:**

- Upload completes without memory issues
- Time depends on network bandwidth
- Check server memory usage: `pm2 monit`

### Test Large File Processing

```bash
# Process the large file
curl -X POST http://localhost:3000/process/<fileId>

# Monitor job progress
watch -n 2 "curl -s http://localhost:3000/jobs/<jobId> | jq '.progress'"
```

**Expected:**

- Processing completes successfully
- Memory usage stays stable
- Records inserted in batches
- Check MongoDB: `db.parsed_records.countDocuments()`

### Stress Test: Multiple Concurrent Uploads

```bash
# Upload 10 files concurrently
for i in {1..10}; do
  curl -F "file=@test-data/sample.json" http://localhost:3000/upload &
done
wait

echo "All uploads complete"
```

**Expected:**

- All uploads succeed
- Server remains responsive
- No memory spikes

### Stress Test: Multiple Concurrent Jobs

```bash
# Upload and process 5 files concurrently
for i in {1..5}; do
  node test-data/generate-large-file.js 10000 "test-data/stress-$i.json"
  RESPONSE=$(curl -s -F "file=@test-data/stress-$i.json" http://localhost:3000/upload)
  FILE_ID=$(echo $RESPONSE | jq -r '.fileId')
  curl -X POST http://localhost:3000/process/$FILE_ID &
done
wait

echo "All jobs queued"
```

**Expected:**

- All jobs complete successfully
- Fair scheduling (no job starves)
- Server stays responsive
- Check: `curl http://localhost:3000/healthz`

## Crash Recovery Tests

### Test 1: Server Restart During Processing

**Setup:**

```bash
# Upload a large file
node test-data/generate-large-file.js 500000 test-data/crash-test.json
RESPONSE=$(curl -s -F "file=@test-data/crash-test.json" http://localhost:3000/upload)
FILE_ID=$(echo $RESPONSE | jq -r '.fileId')

# Start processing
curl -X POST http://localhost:3000/process/$FILE_ID
```

**Test:**

```bash
# While processing, restart the server
pm2 restart file-upload-service

# Wait a moment, then check jobs
sleep 5
curl http://localhost:3000/jobs/<jobId> | jq '.'
```

**Expected Result:**

- On restart, stale jobs are detected
- Job is reset to "queued" with incremented `attempts`
- Job is re-processed automatically
- Eventually completes successfully

### Test 2: Verify Job Recovery Mechanism

**Check MongoDB directly:**

```bash
mongosh $MONGODB_URI

use fileupload

// Find jobs that were reset
db.jobs.find({ attempts: { $gt: 1 } }).pretty()

// Check for failed jobs due to max attempts
db.jobs.find({ state: "failed" }).pretty()
```

### Test 3: Simulate Job Lock Expiration

**Manually expire a job lock:**

```bash
mongosh $MONGODB_URI

use fileupload

// Set lockUntil to past time
db.jobs.updateOne(
  { state: "in_progress" },
  { $set: { lockUntil: new Date(Date.now() - 60000) } }
)

// Wait for worker to claim it
// Job should be picked up by worker within WORKER_POLL_INTERVAL_MS
```

## Concurrent Processing Tests

### Test Multiple Workers

**Start additional worker:**

```bash
# Terminal 1: Main server with worker
pm2 start ecosystem.config.js --only file-upload-app

# Terminal 2: Additional worker
WORKER_ID=worker-2 PORT=3001 ENABLE_WORKER=true node src/server.js
```

**Create multiple jobs:**

```bash
# Queue 10 jobs
for i in {1..10}; do
  node test-data/generate-large-file.js 50000 "test-data/concurrent-$i.json"
  RESPONSE=$(curl -s -F "file=@test-data/concurrent-$i.json" http://localhost:3000/upload)
  FILE_ID=$(echo $RESPONSE | jq -r '.fileId')
  curl -X POST http://localhost:3000/process/$FILE_ID
done
```

**Verify:**

```bash
# Check that different workers are processing jobs
mongosh $MONGODB_URI

use fileupload
db.jobs.aggregate([
  { $match: { state: "in_progress" } },
  { $group: { _id: "$workerId", count: { $sum: 1 } } }
])
```

**Expected:**

- Jobs distributed across workers
- No job processed twice
- All jobs complete successfully

## MongoDB Tests

### Test Batch Writes

**Monitor MongoDB operations:**

```bash
# In one terminal, watch MongoDB operations
mongosh $MONGODB_URI

use fileupload
db.currentOp(true)

# Refresh periodically while a job is processing
```

**Expected:**

- See bulk insert operations
- Batch size matches `JOB_BATCH_SIZE` config
- Writes are throttled (not continuous)

### Test Data Integrity

**After processing, verify data:**

```bash
mongosh $MONGODB_URI

use fileupload

// Check record count matches processed lines
db.parsed_records.countDocuments({ jobId: ObjectId("<jobId>") })

// Verify no duplicate line numbers
db.parsed_records.aggregate([
  { $match: { jobId: ObjectId("<jobId>") } },
  { $group: { _id: "$lineNumber", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

// Should return empty (no duplicates)
```

## S3 Tests

### Verify Files in S3

```bash
aws s3 ls s3://YOUR-BUCKET/uploads/ --recursive

# Download a file to verify content
aws s3 cp s3://YOUR-BUCKET/uploads/2025-11-18/... test.txt
head -n 10 test.txt
```

### Test S3 Streaming

**Check that files are streamed, not buffered:**

```bash
# Upload very large file (>2GB)
node test-data/generate-large-file.js 20000000 test-data/huge.json

# Monitor server memory during upload
pm2 monit

# Upload
curl -F "file=@test-data/huge.json" http://localhost:3000/upload
```

**Expected:**

- Memory usage doesn't spike
- Upload completes successfully
- File appears in S3

## Error Handling Tests

### Test Parse Errors

**Create file with malformed lines:**

```bash
cat > test-data/malformed.json << 'EOF'
{"valid": "json", "line": 1}
{invalid json line}
{"valid": "json", "line": 3}
not json at all
{"valid": "json", "line": 5}
EOF

# Upload and process
RESPONSE=$(curl -s -F "file=@test-data/malformed.json" http://localhost:3000/upload)
FILE_ID=$(echo $RESPONSE | jq -r '.fileId')
curl -X POST http://localhost:3000/process/$FILE_ID
```

**Expected:**

- Job completes with status "completed"
- `progress.errors` shows error count
- Valid lines are inserted
- Error details in job.errors array

### Test MongoDB Connection Loss

**Temporarily block MongoDB:**

```bash
# Stop MongoDB
docker stop mongodb  # or sudo systemctl stop mongod

# Try operations
curl http://localhost:3000/healthz
# Should show MongoDB unhealthy

# Restart MongoDB
docker start mongodb
```

**Expected:**

- Health check reports degraded status
- Upload endpoints may fail gracefully
- Service recovers when MongoDB is back

## Monitoring Tests

### Test Health Endpoint

```bash
curl http://localhost:3000/healthz | jq '.'
```

**Expected Output:**

```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T...",
  "uptime": 12345.67,
  "services": {
    "mongodb": "healthy",
    "s3": "healthy"
  }
}
```

### Test Logging

**Check log output:**

```bash
pm2 logs file-upload-service --lines 100
```

**Expected:**

- Structured JSON logs (Pino format)
- Request logs for all endpoints
- Job processing progress
- Error logs with stack traces

## Cleanup After Testing

```bash
# Remove test files
rm -f test-data/stress-*.json
rm -f test-data/concurrent-*.json
rm -f test-data/large-*.json
rm -f test-data/malformed.json

# Optional: Clean MongoDB test data
mongosh $MONGODB_URI

use fileupload
db.files.deleteMany({})
db.jobs.deleteMany({})
db.parsed_records.deleteMany({})

# Optional: Clean S3 test files
aws s3 rm s3://YOUR-BUCKET/uploads/ --recursive
```

## Automated Testing

For CI/CD integration, consider creating automated tests:

```javascript
// tests/integration.test.js
import assert from "assert";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";

describe("File Upload Service", () => {
  const baseUrl = process.env.TEST_URL || "http://localhost:3000";

  it("should upload a file", async () => {
    const form = new FormData();
    form.append("file", fs.createReadStream("test-data/sample.json"));

    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      body: form,
    });

    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert(data.fileId);
    assert(data.s3Key);
  });

  // Add more tests...
});
```

## Performance Benchmarks

Document your results:

| Test        | File Size | Records | Time  | Memory Peak | Status |
| ----------- | --------- | ------- | ----- | ----------- | ------ |
| Small JSON  | 10 KB     | 10      | 0.5s  | 50 MB       | ✓      |
| Medium JSON | 10 MB     | 100K    | 30s   | 120 MB      | ✓      |
| Large JSON  | 100 MB    | 1M      | 5min  | 150 MB      | ✓      |
| Huge JSON   | 1 GB      | 10M     | 50min | 180 MB      | ✓      |

---

**Questions or Issues?** Review the logs and health endpoint, or consult the main README.md.
