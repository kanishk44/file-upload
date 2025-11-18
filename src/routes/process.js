import { Router } from 'express';
import { getFileById } from '../lib/fileModel.js';
import { createJob, getJobById } from '../lib/jobModel.js';
import logger from '../lib/logger.js';

const router = Router();

/**
 * POST /process/:fileId
 * Create a job to process a file
 */
router.post('/process/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Validate fileId format
    if (!fileId || fileId.length !== 24) {
      return res.status(400).json({
        error: 'Invalid fileId format',
      });
    }

    // Check if file exists
    const file = await getFileById(fileId);
    if (!file) {
      return res.status(404).json({
        error: 'File not found',
        fileId,
      });
    }

    // Create a job for processing
    const job = await createJob(fileId);

    logger.info({ jobId: job._id, fileId }, 'Processing job created');

    return res.status(201).json({
      jobId: job._id.toString(),
      fileId,
      state: job.state,
      queuedAt: job.queuedAt,
      message: 'Job created and queued for processing',
    });
  } catch (error) {
    logger.error({ error, fileId: req.params.fileId }, 'Process endpoint error');
    return res.status(500).json({
      error: 'Failed to create processing job',
      message: error.message,
    });
  }
});

/**
 * GET /jobs/:jobId
 * Get job status
 */
router.get('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Validate jobId format
    if (!jobId || jobId.length !== 24) {
      return res.status(400).json({
        error: 'Invalid jobId format',
      });
    }

    const job = await getJobById(jobId);
    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        jobId,
      });
    }

    // Return job details
    return res.status(200).json({
      jobId: job._id.toString(),
      fileId: job.fileId.toString(),
      state: job.state,
      attempts: job.attempts,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: job.progress,
      errorCount: job.errors.length,
      result: job.result,
    });
  } catch (error) {
    logger.error({ error, jobId: req.params.jobId }, 'Get job endpoint error');
    return res.status(500).json({
      error: 'Failed to retrieve job',
      message: error.message,
    });
  }
});

export default router;

