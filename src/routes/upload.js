import { Router } from "express";
import busboy from "busboy";
import { PassThrough } from "stream";
import { uploadStreamToS3, generateS3Key } from "../lib/s3.js";
import { createFile } from "../lib/fileModel.js";
import logger from "../lib/logger.js";
import config from "../lib/config.js";

const router = Router();

/**
 * POST /upload
 * Upload a file to S3 using streaming (no memory buffering)
 */
router.post("/upload", async (req, res) => {
  try {
    const contentType = req.headers["content-type"];

    if (!contentType || !contentType.includes("multipart/form-data")) {
      return res.status(400).json({
        error: "Content-Type must be multipart/form-data",
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

    let fileProcessing = null; // Promise to track file upload
    let uploadError = null;
    let fileMetadata = null;
    let fileReceived = false;
    let responseSent = false; // Track if response has been sent

    bb.on("file", (fieldname, fileStream, info) => {
      const { filename, encoding, mimeType } = info;

      fileReceived = true;
      logger.info(
        { fieldname, filename, encoding, mimeType },
        "Receiving file upload"
      );

      // Validate file type
      if (!config.allowedFileTypes.includes(mimeType)) {
        fileStream.resume(); // Drain the stream
        uploadError = new Error(
          `File type ${mimeType} is not allowed. Allowed types: ${config.allowedFileTypes.join(
            ", "
          )}`
        );
        fileProcessing = Promise.resolve();
        return;
      }

      // Create a promise to track this upload
      fileProcessing = new Promise((resolve, reject) => {
        (async () => {
          try {
            // Generate unique S3 key
            const s3Key = generateS3Key(filename);

            // Track file size
            let uploadedSize = 0;
            const passthroughStream = new PassThrough();

            fileStream.on("data", (chunk) => {
              uploadedSize += chunk.length;
            });

            fileStream.on("error", (error) => {
              logger.error({ error }, "File stream error");
              uploadError = error;
              reject(error);
            });

            // Pipe the file stream through to S3
            fileStream.pipe(passthroughStream);

            // Upload to S3 (streaming)
            const s3Result = await uploadStreamToS3(
              passthroughStream,
              s3Key,
              mimeType
            );

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

            logger.info(
              {
                fileId: fileDoc._id,
                s3Key: s3Result.s3Key,
                size: uploadedSize,
              },
              "File upload completed"
            );

            // Send response immediately after successful upload
            if (!res.headersSent && !responseSent) {
              responseSent = true;
              res.status(200).json({
                fileId: fileDoc._id.toString(),
                s3Key: s3Result.s3Key,
                message: "uploaded",
                metadata: {
                  originalName: filename,
                  size: uploadedSize,
                  contentType: mimeType,
                  uploadedAt: fileDoc.uploadedAt,
                },
              });
            }

            resolve();
          } catch (error) {
            logger.error(
              { error: error.message, stack: error.stack, filename },
              "Error during file upload processing"
            );
            uploadError = error;
            fileStream.resume(); // Drain the stream on error
            reject(error);
          }
        })();
      });
    });

    bb.on("field", (fieldname, value) => {
      // Handle form fields if needed
    });

    bb.on("close", async () => {
      // Check if response already sent
      if (responseSent || res.headersSent) {
        return;
      }

      try {
        // Wait for file processing to complete
        if (fileProcessing) {
          await fileProcessing;
        }

        if (uploadError) {
          responseSent = true;
          return res.status(500).json({
            error: "Upload failed",
            message: uploadError.message,
          });
        }

        if (!fileReceived) {
          responseSent = true;
          return res.status(400).json({
            error:
              'No file uploaded. Please include a file in the "file" field.',
          });
        }

        if (!fileMetadata) {
          responseSent = true;
          return res.status(500).json({
            error: "Upload processing incomplete",
            message:
              "File was received but processing did not complete. Check server logs.",
          });
        }

        responseSent = true;
        return res.status(200).json({
          fileId: fileMetadata.fileId,
          s3Key: fileMetadata.s3Key,
          message: "uploaded",
          metadata: {
            originalName: fileMetadata.originalName,
            size: fileMetadata.size,
            contentType: fileMetadata.contentType,
            uploadedAt: fileMetadata.uploadedAt,
          },
        });
      } catch (error) {
        logger.error({ error }, "Error in close handler");
        if (!res.headersSent && !responseSent) {
          responseSent = true;
          res.status(500).json({
            error: "Upload processing failed",
            message: error.message,
          });
        }
      }
    });

    bb.on("error", (error) => {
      logger.error({ error }, "Busboy error");
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        res.status(500).json({
          error: "Upload processing failed",
          message: error.message,
        });
      }
    });

    // Handle file size limit exceeded
    bb.on("limit", () => {
      logger.warn("File size limit exceeded");
      uploadError = new Error(
        `File size exceeds maximum allowed size of ${config.maxFileSize} bytes`
      );
    });

    // Pipe request to busboy
    req.pipe(bb);
  } catch (error) {
    logger.error({ error }, "Upload endpoint error");
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
});

export default router;
