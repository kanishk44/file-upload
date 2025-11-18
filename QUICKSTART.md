# Quick Start Guide

Get the File Upload & Processing Service running in 5 minutes!

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- AWS account with S3 bucket
- AWS credentials (or EC2 IAM role)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy example config
cp env.example .env

# Edit with your credentials
nano .env
```

**Required settings:**

```env
MONGODB_URI=mongodb://localhost:27017/fileupload
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET=your-bucket-name  # Just the bucket name, NOT s3://bucket-name
```

**⚠️ Important:** 
- `S3_BUCKET` should only contain the bucket name (e.g., `my-bucket`)
- Don't include `s3://` prefix or any paths
- ❌ Wrong: `s3://my-bucket/files/` or `my-bucket/files/`
- ✅ Correct: `my-bucket`

### 3. Start the Service

```bash
npm start
```

The service starts on `http://localhost:3000`

### 4. Test It!

**Upload a file:**

```bash
curl -F "file=@test-data/sample.json" http://localhost:3000/upload
```

**Process it:**

```bash
# Use fileId from upload response
curl -X POST http://localhost:3000/process/<fileId>
```

**Check status:**

```bash
# Use jobId from process response
curl http://localhost:3000/jobs/<jobId>
```

## 🐳 Docker Quick Start

```bash
# Edit .env with your AWS credentials
cp env.example .env
nano .env

# Start everything
docker-compose up -d

# Test
curl http://localhost:3000/healthz
```

## ☁️ EC2 Quick Deploy

```bash
# Set EC2 host
export EC2_HOST=ec2-XX-XXX-XXX-XXX.compute-1.amazonaws.com

# Deploy
./config/deployment/deploy.sh
```

## 📝 Example Workflow

```bash
# 1. Health check
curl http://localhost:3000/healthz

# 2. Upload file
UPLOAD=$(curl -s -F "file=@test-data/sample.json" http://localhost:3000/upload)
FILE_ID=$(echo $UPLOAD | jq -r '.fileId')
echo "File ID: $FILE_ID"

# 3. Process file
PROCESS=$(curl -s -X POST http://localhost:3000/process/$FILE_ID)
JOB_ID=$(echo $PROCESS | jq -r '.jobId')
echo "Job ID: $JOB_ID"

# 4. Wait a moment
sleep 2

# 5. Check job status
curl -s http://localhost:3000/jobs/$JOB_ID | jq '.'

# 6. Query results in MongoDB
mongosh $MONGODB_URI
use fileupload
db.parsed_records.find({ jobId: ObjectId("$JOB_ID") }).limit(5).pretty()
```

## 🧪 Test with Large File

```bash
# Generate 1 million records (~100MB)
node test-data/generate-large-file.js 1000000

# Upload
curl -F "file=@test-data/large-file.json" http://localhost:3000/upload

# Process (use fileId from response)
curl -X POST http://localhost:3000/process/<fileId>

# Monitor progress
watch -n 2 "curl -s http://localhost:3000/jobs/<jobId> | jq '.progress'"
```

## 🔍 Monitoring

**View logs:**

```bash
pm2 logs file-upload-service
```

**Check status:**

```bash
pm2 status
```

**Monitor resource usage:**

```bash
pm2 monit
```

## 🛠️ Common Commands

| Task            | Command                                                     |
| --------------- | ----------------------------------------------------------- |
| Start service   | `npm start`                                                 |
| Stop service    | `pm2 stop file-upload-service`                              |
| Restart service | `pm2 restart file-upload-service`                           |
| View logs       | `pm2 logs`                                                  |
| Health check    | `curl http://localhost:3000/healthz`                        |
| Upload file     | `curl -F "file=@path/to/file" http://localhost:3000/upload` |
| Process file    | `curl -X POST http://localhost:3000/process/:fileId`        |
| Check job       | `curl http://localhost:3000/jobs/:jobId`                    |

## 📖 Need More Help?

- **Full documentation**: See `README.md`
- **Testing guide**: See `TESTING.md`
- **Deployment details**: See `README.md` EC2 section
- **Troubleshooting**: See `README.md` troubleshooting section

## 🎯 API Reference

### Upload File

```bash
POST /upload
Content-Type: multipart/form-data
Body: file=<binary>

Response:
{
  "fileId": "string",
  "s3Key": "string",
  "message": "uploaded"
}
```

### Process File

```bash
POST /process/:fileId

Response:
{
  "jobId": "string",
  "fileId": "string",
  "state": "queued",
  "message": "Job created and queued for processing"
}
```

### Get Job Status

```bash
GET /jobs/:jobId

Response:
{
  "jobId": "string",
  "state": "queued|in_progress|completed|failed",
  "progress": {
    "linesProcessed": number,
    "recordsInserted": number,
    "errors": number
  }
}
```

### Health Check

```bash
GET /healthz

Response:
{
  "status": "healthy|degraded|unhealthy",
  "services": {
    "mongodb": "healthy|unhealthy",
    "s3": "healthy|unhealthy"
  }
}
```

## 🔐 Security Checklist

- [ ] Created IAM user/role with minimal S3 permissions
- [ ] Set strong MongoDB credentials
- [ ] Using .env file (not committing secrets)
- [ ] Configured firewall rules (EC2 security groups)
- [ ] Set appropriate MAX_FILE_SIZE
- [ ] Restricted ALLOWED_FILE_TYPES

## 💡 Pro Tips

1. **Multiple Workers**: Run `WORKER_ID=worker-2 PORT=3001 npm start` for parallel processing
2. **Monitor MongoDB**: Use MongoDB Atlas for metrics and alerting
3. **S3 Lifecycle**: Configure S3 lifecycle policies to archive old files
4. **Batch Size**: Tune `JOB_BATCH_SIZE` based on your record size
5. **Throttling**: Adjust `JOB_WRITE_PAUSE_MS` based on MongoDB performance

## ⚠️ Common Issues

**"MongoDB connection failed"**

- Check `MONGODB_URI` in .env
- Verify MongoDB is running
- Check network connectivity

**"S3 access denied"**

- Verify AWS credentials in .env
- Check IAM permissions
- Confirm S3 bucket exists

**"Worker not processing jobs"**

- Verify `ENABLE_WORKER=true` in .env
- Check worker logs for errors
- Ensure file exists in S3

**"Out of memory"**

- Check if streaming is working (shouldn't buffer files)
- Reduce `JOB_BATCH_SIZE`
- Increase `JOB_WRITE_PAUSE_MS`

---

**Ready to scale?** See README.md for production deployment and scaling strategies!
