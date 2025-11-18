# File Upload & Processing Service

A production-ready Node.js backend service for streaming file uploads to AWS S3 and asynchronous file processing with MongoDB. Features a custom job queue system with crash recovery and support for processing extremely large files without memory buffering.

## Features

- 🚀 **Streaming uploads to S3** - Handles files of any size without memory buffering
- 📊 **Asynchronous file processing** - Custom job queue backed by MongoDB
- 💪 **Resilient processing** - Crash recovery, job retry, and error handling
- ⚡ **Optimized MongoDB writes** - Batched bulk inserts with configurable throttling
- 🔄 **Worker system** - Background processing with fair scheduling
- 📈 **Production-ready** - Health checks, structured logging, graceful shutdown

## Architecture

```
┌─────────────┐    Upload     ┌─────────────┐    Stream     ┌─────────────┐
│   Client    │ ─────────────>│   Express   │ ─────────────>│   AWS S3    │
└─────────────┘               │   Server    │               └─────────────┘
                              └─────────────┘
                                     │
                                     │ Create Job
                                     ▼
              ┌──────────────────────────────────────────┐
              │            MongoDB                        │
              │  ┌──────────┐  ┌──────┐  ┌──────────┐   │
              │  │  files   │  │ jobs │  │ records  │   │
              │  └──────────┘  └──────┘  └──────────┘   │
              └──────────────────────────────────────────┘
                                     ▲
                                     │ Claim & Process
                                     │
              ┌──────────────────────────────────────────┐
              │         Worker Process                    │
              │  • Stream from S3                         │
              │  • Parse line-by-line                     │
              │  • Batch MongoDB writes                   │
              │  • Error handling & recovery              │
              └──────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** v18+
- **MongoDB** (Atlas or self-hosted)
- **AWS Account** with S3 bucket
- **EC2 Instance** (for deployment) - Ubuntu 20.04+ recommended

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp env.example .env
```

Edit `.env` with your credentials:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/fileupload
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=your-bucket-name
ENABLE_WORKER=true
```

**⚠️ Important:** 
- `S3_BUCKET` should only contain the bucket name (e.g., `my-bucket`)
- Don't include `s3://` prefix or any paths

### 3. Start the Service

```bash
npm start
```

The service starts on `http://localhost:3000`

## API Endpoints

### Upload File
```
POST /upload
Content-Type: multipart/form-data
Body: file=<binary>

Response:
{
  "fileId": "673abc123...",
  "s3Key": "uploads/2025-11-18/...",
  "message": "uploaded",
  "metadata": {
    "originalName": "sample.json",
    "size": 1234,
    "contentType": "application/json",
    "uploadedAt": "2025-11-18T..."
  }
}
```

### Process File
```
POST /process/:fileId

Response:
{
  "jobId": "673def456...",
  "fileId": "673abc123...",
  "state": "queued",
  "message": "Job created and queued for processing"
}
```

### Get Job Status
```
GET /jobs/:jobId

Response:
{
  "jobId": "673def456...",
  "state": "completed",
  "progress": {
    "linesProcessed": 10000,
    "recordsInserted": 9987,
    "errors": 13
  },
  "result": { ... }
}
```

### Health Check
```
GET /healthz

Response:
{
  "status": "healthy",
  "services": {
    "mongodb": "healthy",
    "s3": "healthy"
  }
}
```

## Testing

### Using cURL

**Upload a file:**
```bash
curl -F "file=@path/to/file.json" http://localhost:3000/upload
```

**Process file:**
```bash
curl -X POST http://localhost:3000/process/<fileId>
```

**Check job status:**
```bash
curl http://localhost:3000/jobs/<jobId>
```

**Health check:**
```bash
curl http://localhost:3000/healthz
```

### Using Postman

1. **Upload File:**
   - Method: `POST`
   - URL: `http://localhost:3000/upload`
   - Body: `form-data`
   - Key: `file` (Type: **File**, not Text)
   - Value: Select your file

2. **Process File:**
   - Method: `POST`
   - URL: `http://localhost:3000/process/{fileId}`

3. **Check Status:**
   - Method: `GET`
   - URL: `http://localhost:3000/jobs/{jobId}`

## EC2 Deployment

### Automated Deployment

```bash
export EC2_HOST=ec2-XX-XXX-XXX-XXX.compute-1.amazonaws.com
./config/deployment/deploy.sh
```

### Manual Deployment

**1. SSH into EC2 Instance:**
```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

**2. Install Node.js and PM2:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

**3. Clone Repository:**
```bash
git clone <your-repo-url> file-upload-service
cd file-upload-service
```

**4. Configure Environment:**
```bash
nano .env
# Add your configuration
```

**5. Install Dependencies:**
```bash
npm ci --production
```

**6. Start with PM2:**
```bash
pm2 start src/server.js --name file-upload-service
pm2 save
pm2 startup  # Follow instructions
```

**7. Configure Security Group:**
- Allow port 22 (SSH)
- Allow port 3000 (Application)

## Docker Deployment

```bash
# Using docker-compose
docker-compose up -d

# Or build and run manually
docker build -t file-upload-service .
docker run -d -p 3000:3000 --env-file .env file-upload-service
```

## AWS IAM Configuration

Create an IAM policy for S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
    },
    {
      "Sid": "S3ObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/uploads/*"
    }
  ]
}
```

Attach this policy to:
- EC2 instance role (recommended), or
- IAM user credentials in `.env`

## Configuration Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `MONGODB_URI` | MongoDB connection string | - | Yes |
| `AWS_REGION` | AWS region | `us-east-1` | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | - | Yes* |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | - | Yes* |
| `S3_BUCKET` | S3 bucket name | - | Yes |
| `MAX_FILE_SIZE` | Max upload size (bytes) | `5368709120` (5GB) | No |
| `ALLOWED_FILE_TYPES` | Allowed MIME types | `text/plain,application/json,text/csv` | No |
| `JOB_BATCH_SIZE` | MongoDB batch size | `1000` | No |
| `JOB_WRITE_PAUSE_MS` | Pause between batches (ms) | `50` | No |
| `ENABLE_WORKER` | Enable background worker | `true` | No |
| `WORKER_ID` | Worker identifier | `worker-${pid}` | No |

\* Not required if using IAM role on EC2

## Project Structure

```
file-upload/
├── src/
│   ├── server.js              # Express server
│   ├── lib/
│   │   ├── config.js          # Configuration
│   │   ├── logger.js          # Logging
│   │   ├── db.js              # MongoDB connection
│   │   ├── s3.js              # S3 streaming
│   │   ├── fileModel.js       # File operations
│   │   ├── jobModel.js        # Job queue
│   │   ├── worker.js          # Background processor
│   │   └── lineParser.js      # File parsing
│   └── routes/
│       ├── upload.js          # POST /upload
│       ├── process.js         # POST /process, GET /jobs
│       └── health.js          # GET /healthz
├── config/deployment/
│   ├── deploy.sh              # Deployment script
│   ├── setup-ec2.sh           # EC2 setup
│   └── iam-policy.json        # IAM policy
├── package.json
├── env.example
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js        # PM2 config
└── README.md
```

## Key Technical Features

### 1. Streaming Architecture
- Files never loaded into memory
- Uses Node.js Transform streams with back-pressure
- S3 multipart upload with 5MB chunks

### 2. Custom Job Queue
- MongoDB-backed persistence
- Atomic job claiming using `findOneAndUpdate`
- Job states: queued → in_progress → completed/failed
- Lock mechanism prevents duplicate processing

### 3. Crash Recovery
- On startup, detects stale in-progress jobs
- Resets to queued if under max attempts
- Marks as failed if max attempts exceeded

### 4. Optimized Database Writes
- Batch inserts (default: 1000 records)
- Configurable throttling between batches
- Indexes on critical fields

### 5. Multiple Workers
- Supports horizontal scaling
- Atomic job claiming prevents conflicts
- Workers can run as separate processes

## Monitoring & Maintenance

### View Logs
```bash
pm2 logs file-upload-service
pm2 logs --lines 100
```

### Restart Service
```bash
pm2 restart file-upload-service
```

### Monitor Status
```bash
pm2 status
pm2 monit  # Interactive monitoring
```

### Check MongoDB
```bash
mongosh $MONGODB_URI

use fileupload
db.files.countDocuments()
db.jobs.countDocuments()
db.parsed_records.countDocuments()

# Check job states
db.jobs.aggregate([
  { $group: { _id: "$state", count: { $sum: 1 } } }
])
```

## Troubleshooting

### Upload Fails
- Check S3 bucket exists and credentials are correct
- Verify IAM permissions
- Check file size limits
- Ensure content-type is allowed

### Worker Not Processing Jobs
- Verify `ENABLE_WORKER=true` in .env
- Check MongoDB connection
- Ensure S3 file exists
- Check worker logs for errors

### Memory Issues
- Ensure streaming is working (not buffering)
- Reduce `JOB_BATCH_SIZE`
- Increase `JOB_WRITE_PAUSE_MS`

### High MongoDB Load
- Increase `JOB_WRITE_PAUSE_MS`
- Reduce `JOB_BATCH_SIZE`
- Scale MongoDB (use Atlas M10+ tier)

## Performance Characteristics

- **Memory usage:** ~150-200MB regardless of file size (streaming)
- **Throughput:** ~10,000-50,000 records/second (depends on MongoDB)
- **Concurrent uploads:** Limited by network/S3, not by server
- **Concurrent jobs:** Multiple workers supported

## Security Features

- Environment-based credential management
- Least-privilege IAM policies
- File type validation
- File size limits
- Input sanitization
- No stack traces to client

## License

ISC

## Support

For issues:
1. Check logs: `pm2 logs file-upload-service`
2. Verify health: `curl http://localhost:3000/healthz`
3. Review configuration in `.env`

---

**Production-Ready Node.js File Upload Service** | Built with Express, AWS S3, and MongoDB
