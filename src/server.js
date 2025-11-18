import express from "express";
import { connectDB, closeDB } from "./lib/db.js";
import { resetStaleJobs } from "./lib/jobModel.js";
import { startWorker } from "./lib/worker.js";
import uploadRouter from "./routes/upload.js";
import processRouter from "./routes/process.js";
import healthRouter from "./routes/health.js";
import logger from "./lib/logger.js";
import config from "./lib/config.js";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(
    { method: req.method, url: req.url, ip: req.ip },
    "Incoming request"
  );
  next();
});

// Routes
app.use("/", uploadRouter);
app.use("/", processRouter);
app.use("/", healthRouter);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "File Upload & Processing Service",
    version: "1.0.0",
    endpoints: {
      upload: "POST /upload",
      process: "POST /process/:fileId",
      jobStatus: "GET /jobs/:jobId",
      health: "GET /healthz",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.url,
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({ error: err, url: req.url }, "Unhandled error");
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

/**
 * Initialize and start the server
 */
async function start() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Reset stale jobs on startup (crash recovery)
    logger.info("Running crash recovery...");
    const resetResult = await resetStaleJobs();
    logger.info(resetResult, "Crash recovery completed");

    // Start the Express server
    const server = app.listen(config.port, () => {
      logger.info(
        { port: config.port, nodeEnv: config.nodeEnv },
        "Server started"
      );
    });

    // Start worker if enabled
    if (config.enableWorker) {
      // Start worker in background (don't await)
      startWorker(config.workerId).catch((error) => {
        logger.error({ error }, "Worker crashed");
        process.exit(1);
      });
      logger.info({ workerId: config.workerId }, "Worker started");
    } else {
      logger.info(
        "Worker is disabled. Set ENABLE_WORKER=true to enable background processing."
      );
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info({ signal }, "Shutdown signal received");

      server.close(() => {
        logger.info("HTTP server closed");
      });

      await closeDB();

      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

// Start the server
start();

export default app;
