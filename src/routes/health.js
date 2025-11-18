import { Router } from 'express';
import { getDB } from '../lib/db.js';
import { checkS3Connection } from '../lib/s3.js';
import logger from '../lib/logger.js';

const router = Router();

/**
 * GET /healthz
 * Health check endpoint
 */
router.get('/healthz', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      mongodb: 'unknown',
      s3: 'unknown',
    },
  };

  try {
    // Check MongoDB connection
    try {
      const db = getDB();
      await db.admin().ping();
      health.services.mongodb = 'healthy';
    } catch (error) {
      health.services.mongodb = 'unhealthy';
      health.status = 'degraded';
      logger.warn({ error }, 'MongoDB health check failed');
    }

    // Check S3 connection
    try {
      const s3Healthy = await checkS3Connection();
      health.services.s3 = s3Healthy ? 'healthy' : 'unhealthy';
      if (!s3Healthy) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.s3 = 'unhealthy';
      health.status = 'degraded';
      logger.warn({ error }, 'S3 health check failed');
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    return res.status(statusCode).json(health);
  } catch (error) {
    logger.error({ error }, 'Health check error');
    return res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

export default router;

