import { ObjectId } from 'mongodb';
import { getDB } from './db.js';
import logger from './logger.js';

const COLLECTION_NAME = 'files';

/**
 * Create a new file record
 */
export async function createFile({ s3Key, originalName, size, contentType }) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const fileDoc = {
    _id: new ObjectId(),
    s3Key,
    originalName,
    size,
    contentType,
    uploadedAt: new Date(),
    status: 'uploaded',
  };

  await collection.insertOne(fileDoc);
  logger.info({ fileId: fileDoc._id, s3Key }, 'File record created');

  return fileDoc;
}

/**
 * Get file by ID
 */
export async function getFileById(fileId) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const file = await collection.findOne({ _id: new ObjectId(fileId) });
  return file;
}

/**
 * Update file status
 */
export async function updateFileStatus(fileId, status) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const result = await collection.updateOne(
    { _id: new ObjectId(fileId) },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    }
  );

  logger.info({ fileId, status }, 'File status updated');
  return result;
}

/**
 * Get file by S3 key
 */
export async function getFileByS3Key(s3Key) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const file = await collection.findOne({ s3Key });
  return file;
}

/**
 * List files with pagination
 */
export async function listFiles({ skip = 0, limit = 10, status = null }) {
  const db = getDB();
  const collection = db.collection(COLLECTION_NAME);

  const query = status ? { status } : {};
  const files = await collection
    .find(query)
    .sort({ uploadedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return files;
}

export default {
  createFile,
  getFileById,
  updateFileStatus,
  getFileByS3Key,
  listFiles,
};

