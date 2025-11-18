import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import split2 from 'split2';
import {
  claimJob,
  updateJobProgress,
  completeJob,
  failJob,
  addJobError,
} from './jobModel.js';
import { getFileById, updateFileStatus } from './fileModel.js';
import { downloadStreamFromS3, webStreamToNodeStream } from './s3.js';
import { getParser, validateParsedData } from './lineParser.js';
import { getDB } from './db.js';
import logger from './logger.js';
import config from './config.js';

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process a single job
 */
async function processJob(job, workerId) {
  const jobId = job._id;
  const fileId = job.fileId;

  logger.info({ jobId, fileId, workerId }, 'Starting job processing');

  try {
    // Get file metadata
    const file = await getFileById(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Download file stream from S3
    const s3Stream = await downloadStreamFromS3(file.s3Key);
    const nodeStream = webStreamToNodeStream(s3Stream);

    // Get appropriate parser based on content type
    const parseLineFn = getParser(file.contentType);

    // Processing state
    let lineNumber = 0;
    let linesProcessed = 0;
    let recordsInserted = 0;
    let errorCount = 0;
    let batch = [];

    const db = getDB();
    const recordsCollection = db.collection('parsed_records');

    /**
     * Transform stream to parse lines and batch them
     */
    const processStream = new Transform({
      objectMode: true,
      async transform(line, encoding, callback) {
        lineNumber++;
        
        try {
          // Parse the line
          const parsed = parseLineFn(line, lineNumber);

          // Skip null results (empty lines)
          if (!parsed) {
            callback();
            return;
          }

          if (!parsed.success) {
            // Log parse error and continue
            errorCount++;
            await addJobError(jobId, {
              message: `Line ${parsed.lineNumber}: ${parsed.error}`,
            });
            callback();
            return;
          }

          // Validate parsed data
          if (!validateParsedData(parsed.data)) {
            errorCount++;
            await addJobError(jobId, {
              message: `Line ${parsed.lineNumber}: Invalid data format`,
            });
            callback();
            return;
          }

          linesProcessed++;

          // Add to batch
          batch.push({
            fileId: file._id,
            jobId,
            lineNumber: parsed.lineNumber,
            data: parsed.data,
            processedAt: new Date(),
          });

          // If batch is full, write to MongoDB
          if (batch.length >= config.jobBatchSize) {
            try {
              await recordsCollection.insertMany(batch, { ordered: false });
              recordsInserted += batch.length;
              
              logger.debug(
                { jobId, batchSize: batch.length, totalInserted: recordsInserted },
                'Batch inserted'
              );

              // Update job progress
              await updateJobProgress(jobId, {
                linesProcessed,
                recordsInserted,
                errors: errorCount,
              });

              // Clear batch
              batch = [];

              // Throttle: pause between batches to avoid overwhelming MongoDB
              if (config.jobWritePauseMs > 0) {
                await sleep(config.jobWritePauseMs);
              }
            } catch (error) {
              logger.error({ error, jobId }, 'Batch insert error');
              // Continue processing even if batch fails
              errorCount += batch.length;
              batch = [];
            }
          }

          callback();
        } catch (error) {
          logger.error({ error, lineNumber, jobId }, 'Line processing error');
          errorCount++;
          await addJobError(jobId, {
            message: `Line ${lineNumber}: ${error.message}`,
          });
          callback(); // Continue processing
        }
      },

      async flush(callback) {
        // Write remaining batch
        if (batch.length > 0) {
          try {
            await recordsCollection.insertMany(batch, { ordered: false });
            recordsInserted += batch.length;

            logger.debug(
              { jobId, batchSize: batch.length, totalInserted: recordsInserted },
              'Final batch inserted'
            );

            await updateJobProgress(jobId, {
              linesProcessed,
              recordsInserted,
              errors: errorCount,
            });
          } catch (error) {
            logger.error({ error, jobId }, 'Final batch insert error');
            errorCount += batch.length;
          }
        }

        callback();
      },
    });

    // Process the file using streams with back-pressure
    await pipeline(
      nodeStream,
      split2(), // Split stream by newlines
      processStream
    );

    // Mark job as completed
    await completeJob(jobId, {
      linesProcessed,
      recordsInserted,
      errorCount,
      success: true,
    });

    // Update file status
    await updateFileStatus(fileId, 'processed');

    logger.info(
      { jobId, fileId, linesProcessed, recordsInserted, errorCount },
      'Job processing completed'
    );
  } catch (error) {
    logger.error({ error, jobId, fileId }, 'Job processing failed');
    await failJob(jobId, error);
    throw error;
  }
}

/**
 * Worker loop - continuously claim and process jobs
 */
export async function startWorker(workerId) {
  logger.info({ workerId }, 'Worker starting');

  while (true) {
    try {
      // Attempt to claim a job
      const job = await claimJob(workerId);

      if (!job) {
        // No jobs available, wait before trying again
        await sleep(config.workerPollIntervalMs);
        continue;
      }

      // Process the claimed job
      await processJob(job, workerId);
    } catch (error) {
      logger.error({ error, workerId }, 'Worker error');
      // Wait before retrying to avoid tight error loops
      await sleep(config.workerPollIntervalMs * 2);
    }
  }
}

export default {
  startWorker,
  processJob,
};

