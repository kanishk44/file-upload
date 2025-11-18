import { S3Client, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import config from './config.js';
import logger from './logger.js';
import { Readable } from 'stream';

// Initialize S3 client
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

/**
 * Upload a file stream to S3
 * Uses multipart upload for large files with streaming
 */
export async function uploadStreamToS3(fileStream, s3Key, contentType) {
  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: config.aws.s3Bucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: contentType,
      },
      // Configure multipart upload
      queueSize: 4, // Number of concurrent uploads
      partSize: 5 * 1024 * 1024, // 5MB parts (minimum for S3)
      leavePartsOnError: false,
    });

    // Monitor progress
    upload.on('httpUploadProgress', (progress) => {
      if (progress.loaded && progress.total) {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        logger.debug({ s3Key, percent, loaded: progress.loaded, total: progress.total }, 'Upload progress');
      }
    });

    const result = await upload.done();
    logger.info({ s3Key, bucket: config.aws.s3Bucket }, 'File uploaded to S3');

    return {
      s3Key,
      bucket: config.aws.s3Bucket,
      etag: result.ETag,
      location: result.Location,
    };
  } catch (error) {
    logger.error({ error, s3Key }, 'Failed to upload to S3');
    throw error;
  }
}

/**
 * Download a file from S3 as a readable stream
 */
export async function downloadStreamFromS3(s3Key) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    // response.Body is a readable stream in AWS SDK v3
    logger.info({ s3Key, bucket: config.aws.s3Bucket }, 'Streaming file from S3');

    return response.Body;
  } catch (error) {
    logger.error({ error, s3Key }, 'Failed to download from S3');
    throw error;
  }
}

/**
 * Generate a unique S3 key for uploaded files
 */
export function generateS3Key(originalName) {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  // Sanitize filename
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `uploads/${dateStr}/${timestamp}-${random}-${sanitizedName}`;
}

/**
 * Check if S3 bucket is accessible
 */
export async function checkS3Connection() {
  try {
    const command = new HeadBucketCommand({
      Bucket: config.aws.s3Bucket,
    });

    await s3Client.send(command);
    logger.info({ bucket: config.aws.s3Bucket }, 'S3 bucket is accessible');
    return true;
  } catch (error) {
    logger.error({ error, bucket: config.aws.s3Bucket }, 'S3 bucket is not accessible');
    return false;
  }
}

/**
 * Convert Web Stream (from AWS SDK v3) to Node.js Readable Stream
 */
export function webStreamToNodeStream(webStream) {
  if (webStream instanceof Readable) {
    return webStream;
  }

  // AWS SDK v3 returns a Web ReadableStream, convert to Node.js stream
  return Readable.from(webStream);
}

export default {
  uploadStreamToS3,
  downloadStreamFromS3,
  generateS3Key,
  checkS3Connection,
  webStreamToNodeStream,
};

