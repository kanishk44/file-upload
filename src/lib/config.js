import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // MongoDB
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fileupload',

  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // Clean S3 bucket name - remove s3:// prefix and trailing paths
    s3Bucket: process.env.S3_BUCKET
      ? process.env.S3_BUCKET.replace(/^s3:\/\//, '').split('/')[0]
      : undefined,
  },

  // File Upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5368709120', 10), // 5GB default
  allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'text/plain,application/json,text/csv').split(','),

  // Job Queue
  jobBatchSize: parseInt(process.env.JOB_BATCH_SIZE || '1000', 10),
  jobWritePauseMs: parseInt(process.env.JOB_WRITE_PAUSE_MS || '50', 10),
  jobLockTimeoutMs: parseInt(process.env.JOB_LOCK_TIMEOUT_MS || '300000', 10), // 5 minutes
  jobStaleThresholdMs: parseInt(process.env.JOB_STALE_THRESHOLD_MS || '600000', 10), // 10 minutes
  workerPollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10),
  maxJobAttempts: parseInt(process.env.MAX_JOB_ATTEMPTS || '3', 10),

  // Worker
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,
  enableWorker: process.env.ENABLE_WORKER === 'true',
};

// Validate required config
const requiredConfig = [
  'aws.accessKeyId',
  'aws.secretAccessKey',
  'aws.s3Bucket',
];

for (const key of requiredConfig) {
  const keys = key.split('.');
  let value = config;
  for (const k of keys) {
    value = value[k];
  }
  if (!value) {
    console.warn(`Warning: Required config ${key} is not set`);
  }
}

export default config;

