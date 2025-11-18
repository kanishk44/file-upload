# File Upload & Processing Service

A production-ready Node.js backend service for streaming file uploads to AWS S3 and asynchronous file processing with MongoDB. Built with Express.js, featuring a custom job queue system with crash recovery and support for processing extremely large files.

## Features

- 🚀 **Streaming uploads to S3** - No memory buffering, handles files of any size
- 📊 **Asynchronous file processing** - Custom job queue backed by MongoDB
- 💪 **Resilient processing** - Crash recovery, job retry, and error handling
- ⚡ **Optimized MongoDB writes** - Batched bulk inserts with throttling
- 🔄 **Worker system** - Background processing with fair scheduling
- 📈 **Production-ready** - Health checks, logging, and graceful shutdown
- 🔒 **Secure** - Environment-based configuration, no secrets in code

## Architecture

```
┌─────────────┐     Upload      ┌─────────────┐     Stream      ┌─────────────┐
│   Client    │ ───────────────> │   Express   │ ──────────────> │   AWS S3    │
└─────────────┘                  │   Server    │                 └─────────────┘
                                 └─────────────┘
                                        │
                                        │ Create Job
                                        ▼
                 ┌─────────────────────────────────────────┐
                 │            MongoDB                       │
                 │  ┌──────────┐  ┌──────┐  ┌──────────┐  │
                 │  │  files   │  │ jobs │  │ records  │  │
                 │  └──────────┘  └──────┘  └──────────┘  │
                 └─────────────────────────────────────────┘
                                        ▲
                                        │ Claim Job
                                        │
                 ┌─────────────────────────────────────────┐
                 │         Worker Process                   │
                 │  • Stream from S3                        │
                 │  • Parse line-by-line                    │
                 │  • Batch MongoDB writes                  │
                 │  • Error handling & recovery             │
                 └─────────────────────────────────────────┘
```

## API Endpoints

### Upload File
```bash
POST /upload
Content-Type: multipart/form-data

# Response
{
  "fileId": "673abc123...",
  "s3Key": "uploads/2025-11-18/1234567890-abc123-sample.json",
  "message": "uploaded"
}
```

### Process File
```bash
POST /process/:fileId

# Response
{
  "jobId": "673def456...",
  "fileId": "673abc123...",
  "state": "queued",
  "message": "Job created and queued for processing"
}
```

### Get Job Status
```bash
GET /jobs/:jobId

# Response
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
```bash
GET /healthz

# Response
{
  "status": "healthy",
  "services": {
    "mongodb": "healthy",
    "s3": "healthy"
  }
}
```

## Prerequisites

- **Node.js** v18+ 
- **MongoDB** (Atlas or self-hosted)
- **AWS Account** with S3 bucket
- **EC2 Instance** (for deployment) - Ubuntu 20.04+ recommended

## Quick Start (Local Development)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd file-upload
npm install
```

### 2. Configure Environment

Create a `.env` file (use `env.example` as template):

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

### 3. Start MongoDB Locally (Optional)

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or use MongoDB Atlas (recommended for production)
```

### 4. Create S3 Bucket

```bash
aws s3 mb s3://your-bucket-name --region us-east-1
```

### 5. Start the Service

```bash
npm start
```

The service will start on `http://localhost:3000` with the worker enabled.

## Testing Locally

### Test Upload

```bash
./test-scripts/test-upload.sh http://localhost:3000 test-data/sample.json
```

### Test Processing

```bash
# Use the fileId returned from upload
./test-scripts/test-process.sh http://localhost:3000 <fileId>
```

### Test Health Check

```bash
./test-scripts/test-health.sh http://localhost:3000
```

### Generate Large Test File

```bash
# Generate 1 million lines (~100MB)
node test-data/generate-large-file.js 1000000 test-data/large-file.json

# Upload it
curl -F "file=@test-data/large-file.json" http://localhost:3000/upload
```

## EC2 Deployment

### Option 1: Automated Deployment (Recommended)

**Prerequisites:**
- EC2 instance running Ubuntu 20.04+
- SSH access configured
- Security group allows ports 22 (SSH) and 3000 (App)

**Deploy:**

```bash
# Set your EC2 host
export EC2_HOST=ec2-XX-XXX-XXX-XXX.compute-1.amazonaws.com

# Run deployment script
./config/deployment/deploy.sh
```

This script will:
1. Install Node.js and PM2 on EC2
2. Copy application files
3. Install dependencies
4. Copy .env file
5. Start the application with PM2
6. Configure PM2 to start on boot

### Option 2: Manual Deployment

**1. Launch EC2 Instance**

```bash
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key-pair \
  --security-groups file-upload-sg \
  --iam-instance-profile Name=FileUploadServiceRole \
  --region us-east-1
```

**2. Configure Security Group**

```bash
aws ec2 authorize-security-group-ingress \
  --group-name file-upload-sg \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0  # SSH (restrict to your IP)

aws ec2 authorize-security-group-ingress \
  --group-name file-upload-sg \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0  # Application
```

**3. SSH into Instance**

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

**4. Run Setup Script**

```bash
# Copy and run the setup script
curl -O https://raw.githubusercontent.com/<your-repo>/main/config/deployment/setup-ec2.sh
chmod +x setup-ec2.sh
./setup-ec2.sh
```

**5. Clone and Configure**

```bash
git clone <your-repo-url> file-upload-service
cd file-upload-service

# Create .env file
nano .env
# (paste your configuration)

# Install dependencies
npm ci --production
```

**6. Start with PM2**

```bash
pm2 start src/server.js --name file-upload-service
pm2 save
pm2 startup  # Follow the instructions
```

**7. Verify Deployment**

```bash
curl http://localhost:3000/healthz
```

## IAM Configuration

Create an IAM role for your EC2 instance or user with the following policy:

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

**Attach to EC2 Instance:**

```bash
aws iam create-role --role-name FileUploadServiceRole --assume-role-policy-document file://trust-policy.json
aws iam put-role-policy --role-name FileUploadServiceRole --policy-name S3Access --policy-document file://config/deployment/iam-policy.json
aws iam create-instance-profile --instance-profile-name FileUploadServiceRole
aws iam add-role-to-instance-profile --instance-profile-name FileUploadServiceRole --role-name FileUploadServiceRole
```

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
| `JOB_WRITE_PAUSE_MS` | Pause between batches | `50` | No |
| `ENABLE_WORKER` | Enable background worker | `true` | No |
| `WORKER_ID` | Worker identifier | `worker-${pid}` | No |

\* Not required if using IAM role on EC2

## Architecture Details

### File Upload Flow

1. Client sends multipart/form-data to `/upload`
2. Server uses `busboy` to stream the file (no memory buffering)
3. File is streamed directly to S3 using `@aws-sdk/lib-storage`
4. Metadata is saved to MongoDB `files` collection
5. Response includes `fileId` and `s3Key`

### Job Processing Flow

1. Client sends POST to `/process/:fileId`
2. Server creates job record in MongoDB `jobs` collection (state: `queued`)
3. Worker claims job atomically using `findOneAndUpdate`
4. Worker streams file from S3 line-by-line
5. Each line is parsed (JSON/CSV/text) and validated
6. Records are batched (default: 1000) and bulk-inserted into MongoDB
7. Progress is updated periodically
8. On completion, job state changes to `completed`
9. File status changes to `processed`

### Crash Recovery

On server start:
- Detects jobs with `state: in_progress` and expired `lockUntil`
- Resets them to `queued` if `attempts < MAX_ATTEMPTS`
- Marks as `failed` if max attempts exceeded

### Worker Concurrency

Multiple workers can run safely:
- Jobs are claimed atomically using MongoDB `findOneAndUpdate`
- Each worker has a unique `workerId`
- Lock timeout prevents job theft
- Workers can run as separate processes or in cluster mode

## Monitoring & Maintenance

### View Logs

```bash
# On EC2
ssh ubuntu@<EC2_HOST>
pm2 logs file-upload-service

# Follow logs in real-time
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
mongosh <MONGODB_URI>

# View collections
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

- Increase `max-memory-restart` in PM2: `pm2 start src/server.js --max-memory-restart 2G`
- Reduce `JOB_BATCH_SIZE`
- Ensure streaming is working (not buffering)

### High MongoDB Load

- Increase `JOB_WRITE_PAUSE_MS`
- Reduce `JOB_BATCH_SIZE`
- Add MongoDB indexes (already created automatically)
- Scale MongoDB (use Atlas M10+ tier)

## Performance Considerations

### Streaming

- Files are never fully loaded into memory
- Uses Node.js streams with back-pressure handling
- S3 multipart upload for large files (5MB chunks)

### MongoDB Optimization

- Bulk inserts reduce round-trips
- Throttling prevents overwhelming the database
- Indexes on `state`, `queuedAt`, `lockUntil` for efficient job queries
- Connection pooling (default: 2-10 connections)

### Scalability

- Horizontal: Run multiple worker processes
- Vertical: Increase EC2 instance size
- Database: Use MongoDB Atlas with auto-scaling
- S3: Unlimited storage, pay per use

## Project Structure

```
file-upload/
├── src/
│   ├── server.js              # Express server & startup
│   ├── lib/
│   │   ├── config.js          # Configuration loader
│   │   ├── logger.js          # Pino logger
│   │   ├── db.js              # MongoDB connection
│   │   ├── s3.js              # S3 streaming helpers
│   │   ├── fileModel.js       # File metadata model
│   │   ├── jobModel.js        # Job model & operations
│   │   ├── worker.js          # Worker loop & processing
│   │   └── lineParser.js      # Line parsing utilities
│   └── routes/
│       ├── upload.js          # POST /upload
│       ├── process.js         # POST /process/:fileId, GET /jobs/:jobId
│       └── health.js          # GET /healthz
├── config/
│   └── deployment/
│       ├── deploy.sh          # Automated deployment script
│       ├── setup-ec2.sh       # EC2 setup script
│       └── iam-policy.json    # IAM policy template
├── test-data/
│   ├── sample.json            # Sample JSON file
│   ├── sample.csv             # Sample CSV file
│   └── generate-large-file.js # Large file generator
├── test-scripts/
│   ├── test-upload.sh         # Upload test
│   ├── test-process.sh        # Process test
│   └── test-health.sh         # Health check test
├── package.json
├── env.example
└── README.md
```

## Example Usage

### Complete Workflow

```bash
# 1. Upload a file
curl -F "file=@test-data/sample.json" http://localhost:3000/upload
# Returns: { "fileId": "673abc123...", ... }

# 2. Create processing job
curl -X POST http://localhost:3000/process/673abc123...
# Returns: { "jobId": "673def456...", "state": "queued", ... }

# 3. Check job status
curl http://localhost:3000/jobs/673def456...
# Returns: { "state": "in_progress", "progress": {...}, ... }

# 4. Wait for completion (poll or wait)
sleep 5
curl http://localhost:3000/jobs/673def456...
# Returns: { "state": "completed", "result": {...}, ... }

# 5. Query processed records in MongoDB
mongosh $MONGODB_URI
db.parsed_records.find({ jobId: ObjectId("673def456...") })
```

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

## License

ISC

## Support

For issues and questions:
- Open a GitHub issue
- Check logs: `pm2 logs file-upload-service`
- Review health endpoint: `curl http://localhost:3000/healthz`

---

**Built with** ❤️ **using Node.js, Express, AWS S3, and MongoDB**

