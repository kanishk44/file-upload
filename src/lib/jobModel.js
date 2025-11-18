import { ObjectId } from 'mongodb';
import { getDB } from './db.js';
import logger from './logger.js';
import config from './config.js';

const COLLECTION_NAME = 'jobs';

/**
 * Create a new job
 */
export async function createJob(fileId) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const jobDoc = {
    _id: new ObjectId(),
    fileId: new ObjectId(fileId),
    state: 'queued',
    attempts: 0,
    queuedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    workerId: null,
    lockUntil: null,
    progress: {
      linesProcessed: 0,
      recordsInserted: 0,
      errors: 0,
    },
    errors: [],
    result: null,
  };

  await collection.insertOne(jobDoc);
  logger.info({ jobId: jobDoc._id, fileId }, 'Job created');

  return jobDoc;
}

/**
 * Get job by ID
 */
export async function getJobById(jobId) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const job = await collection.findOne({ _id: new ObjectId(jobId) });
  return job;
}

/**
 * Atomically claim a queued job for processing
 */
export async function claimJob(workerId) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const now = new Date();
  const lockUntil = new Date(Date.now() + config.jobLockTimeoutMs);

  const job = await collection.findOneAndUpdate(
    { state: 'queued' },
    {
      $set: {
        state: 'in_progress',
        workerId,
        startedAt: now,
        lockUntil,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { queuedAt: 1 },
      returnDocument: 'after',
    }
  );

  if (job) {
    logger.info({ jobId: job._id, workerId }, 'Job claimed');
  }

  return job;
}

/**
 * Update job progress
 */
export async function updateJobProgress(jobId, progress) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const lockUntil = new Date(Date.now() + config.jobLockTimeoutMs);

  await collection.updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        progress,
        lockUntil, // Extend lock while actively processing
      },
    }
  );
}

/**
 * Mark job as completed
 */
export async function completeJob(jobId, result) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        state: 'completed',
        finishedAt: new Date(),
        result,
      },
    }
  );

  logger.info({ jobId, result }, 'Job completed');
}

/**
 * Mark job as failed
 */
export async function failJob(jobId, error) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        state: 'failed',
        finishedAt: new Date(),
        result: { error: error.message, stack: error.stack },
      },
    }
  );

  logger.error({ jobId, error }, 'Job failed');
}

/**
 * Add error to job's error list (capped)
 */
export async function addJobError(jobId, error) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  await collection.updateOne(
    { _id: new ObjectId(jobId) },
    {
      $push: {
        errors: {
          $each: [{ message: error.message, timestamp: new Date() }],
          $slice: -100, // Keep only last 100 errors
        },
      },
      $inc: { 'progress.errors': 1 },
    }
  );
}

/**
 * Reset stale jobs (for crash recovery)
 */
export async function resetStaleJobs() {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const staleThreshold = new Date(Date.now() - config.jobStaleThresholdMs);

  const result = await collection.updateMany(
    {
      state: 'in_progress',
      $or: [
        { lockUntil: { $lt: new Date() } },
        { startedAt: { $lt: staleThreshold } },
      ],
      attempts: { $lt: config.maxJobAttempts },
    },
    {
      $set: {
        state: 'queued',
        workerId: null,
        lockUntil: null,
      },
    }
  );

  if (result.modifiedCount > 0) {
    logger.info({ count: result.modifiedCount }, 'Reset stale jobs to queued');
  }

  // Mark jobs that exceeded max attempts as failed
  const failedResult = await collection.updateMany(
    {
      state: 'in_progress',
      $or: [
        { lockUntil: { $lt: new Date() } },
        { startedAt: { $lt: staleThreshold } },
      ],
      attempts: { $gte: config.maxJobAttempts },
    },
    {
      $set: {
        state: 'failed',
        finishedAt: new Date(),
        result: { error: 'Job exceeded maximum attempts and became stale' },
      },
    }
  );

  if (failedResult.modifiedCount > 0) {
    logger.info({ count: failedResult.modifiedCount }, 'Marked stale jobs as failed');
  }

  return { resetCount: result.modifiedCount, failedCount: failedResult.modifiedCount };
}

/**
 * List jobs with filters
 */
export async function listJobs({ skip = 0, limit = 10, state = null, fileId = null }) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const query = {};
  if (state) query.state = state;
  if (fileId) query.fileId = new ObjectId(fileId);

  const jobs = await collection
    .find(query)
    .sort({ queuedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return jobs;
}

export default {
  createJob,
  getJobById,
  claimJob,
  updateJobProgress,
  completeJob,
  failJob,
  addJobError,
  resetStaleJobs,
  listJobs,
};

