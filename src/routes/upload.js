import { Router } from 'express';
import busboy from 'busboy';
import { PassThrough } from 'stream';
import { uploadStreamToS3, generateS3Key } from '../lib/s3.js';
import { createFile } from '../lib/fileModel.js';
import logger from '../lib/logger.js';
import config from '../lib/config.js';

const router = Router();

/**
 * POST /upload
 * Upload a file to S3 using streaming (no memory buffering)
 */
router.post('/upload', async (req, res) => {
  try {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        error: 'Content-Type must be multipart/form-data',
      });
    }

    // Parse multipart form data with busboy (streaming)
    const bb = busboy({
      headers: req.headers,
      limits: {
        fileSize: config.maxFileSize,
        files: 1, // Only accept one file
      },
    });

    let fileUploaded = false;
    let uploadError = null;
    let fileMetadata = null;

    bb.on('file', async (fieldname, fileStream, info) => {
      const { filename, encoding, mimeType } = info;

      logger.info({ filename, encoding, mimeType }, 'Receiving file upload');

      // Validate file type
      if (!config.allowedFileTypes.includes(mimeType)) {
        fileStream.resume(); // Drain the stream
        uploadError = new Error(`File type ${mimeType} is not allowed. Allowed types: ${config.allowedFileTypes.join(', ')}`);
        return;
      }

      try {
        // Generate unique S3 key
        const s3Key = generateS3Key(filename);

        // Track file size
        let uploadedSize = 0;
        const passthroughStream = new PassThrough();

        fileStream.on('data', (chunk) => {
          uploadedSize += chunk.length;
        });

        // Pipe the file stream through to S3
        fileStream.pipe(passthroughStream);

        // Upload to S3 (streaming)
        const s3Result = await uploadStreamToS3(passthroughStream, s3Key, mimeType);

        // Create file record in MongoDB
        const fileDoc = await createFile({
          s3Key: s3Result.s3Key,
          originalName: filename,
          size: uploadedSize,
          contentType: mimeType,
        });

        fileMetadata = {
          fileId: fileDoc._id.toString(),
          s3Key: s3Result.s3Key,
          originalName: filename,
          size: uploadedSize,
          contentType: mimeType,
          uploadedAt: fileDoc.uploadedAt,
        };

        fileUploaded = true;

        logger.info({ fileId: fileDoc._id, s3Key: s3Result.s3Key, size: uploadedSize }, 'File upload completed');
      } catch (error) {
        logger.error({ error, filename }, 'Error during file upload');
        uploadError = error;
        fileStream.resume(); // Drain the stream on error
      }
    });

    bb.on('field', (fieldname, value) => {
      logger.debug({ fieldname, value }, 'Received form field');
    });

    bb.on('close', () => {
      if (uploadError) {
        return res.status(500).json({
          error: 'Upload failed',
          message: uploadError.message,
        });
      }

      if (!fileUploaded) {
        return res.status(400).json({
          error: 'No file uploaded. Please include a file in the "file" field.',
        });
      }

      return res.status(200).json({
        fileId: fileMetadata.fileId,
        s3Key: fileMetadata.s3Key,
        message: 'uploaded',
        metadata: {
          originalName: fileMetadata.originalName,
          size: fileMetadata.size,
          contentType: fileMetadata.contentType,
          uploadedAt: fileMetadata.uploadedAt,
        },
      });
    });

    bb.on('error', (error) => {
      logger.error({ error }, 'Busboy error');
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Upload processing failed',
          message: error.message,
        });
      }
    });

    // Handle file size limit exceeded
    bb.on('limit', () => {
      logger.warn('File size limit exceeded');
      uploadError = new Error(`File size exceeds maximum allowed size of ${config.maxFileSize} bytes`);
    });

    // Pipe request to busboy
    req.pipe(bb);
  } catch (error) {
    logger.error({ error }, 'Upload endpoint error');
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
});

export default router;

