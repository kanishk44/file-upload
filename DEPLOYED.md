# Deployment Information

This file contains information about the deployed instance of the File Upload & Processing Service.

## Live URLs

**🚀 Deployed Instance:** `http://YOUR-EC2-HOST:3000`

Replace `YOUR-EC2-HOST` with your actual EC2 public DNS or IP address.

### Endpoints

- **Service Info:** http://YOUR-EC2-HOST:3000/
- **Upload File:** http://YOUR-EC2-HOST:3000/upload (POST)
- **Process File:** http://YOUR-EC2-HOST:3000/process/:fileId (POST)
- **Job Status:** http://YOUR-EC2-HOST:3000/jobs/:jobId (GET)
- **Health Check:** http://YOUR-EC2-HOST:3000/healthz (GET)

## Quick Test Commands

### 1. Check Health

```bash
curl http://YOUR-EC2-HOST:3000/healthz
```

### 2. Upload a File

```bash
curl -F "file=@test-data/sample.json" http://YOUR-EC2-HOST:3000/upload
```

Response:
```json
{
  "fileId": "673abc123...",
  "s3Key": "uploads/2025-11-18/...",
  "message": "uploaded"
}
```

### 3. Process the File

```bash
curl -X POST http://YOUR-EC2-HOST:3000/process/673abc123...
```

Response:
```json
{
  "jobId": "673def456...",
  "state": "queued",
  "message": "Job created and queued for processing"
}
```

### 4. Check Job Status

```bash
curl http://YOUR-EC2-HOST:3000/jobs/673def456...
```

## Deployment Details

- **Deployment Date:** [Fill in deployment date]
- **EC2 Instance Type:** [e.g., t3.medium]
- **Region:** [e.g., us-east-1]
- **MongoDB:** [e.g., MongoDB Atlas M10]
- **S3 Bucket:** [Your bucket name]

## Access Information

**SSH Access:**
```bash
ssh -i your-key.pem ubuntu@YOUR-EC2-HOST
```

**PM2 Commands:**
```bash
pm2 status
pm2 logs file-upload-service
pm2 restart file-upload-service
```

## Monitoring

### Application Logs
```bash
ssh ubuntu@YOUR-EC2-HOST 'pm2 logs --lines 100'
```

### Health Status
```bash
watch -n 5 "curl -s http://YOUR-EC2-HOST:3000/healthz | jq '.'"
```

## Performance Metrics

[Fill in after deployment and load testing]

- Max concurrent uploads: TBD
- Files processed per minute: TBD
- Average upload time (1GB file): TBD
- Average processing time (1M records): TBD

## Known Issues / Notes

[Document any deployment-specific issues or notes]

## Rollback Instructions

If you need to rollback to a previous version:

```bash
ssh ubuntu@YOUR-EC2-HOST
cd file-upload-service
git checkout <previous-commit-hash>
npm ci --production
pm2 restart file-upload-service
```

## Support

For issues with the deployed instance:
1. Check logs: `pm2 logs file-upload-service`
2. Check health: `curl http://YOUR-EC2-HOST:3000/healthz`
3. Restart if needed: `pm2 restart file-upload-service`
4. Contact: [Your contact information]

