import { MongoClient } from 'mongodb';
import config from './config.js';
import logger from './logger.js';

let client = null;
let db = null;

/**
 * Connect to MongoDB
 */
export async function connectDB() {
  if (db) {
    return db;
  }

  try {
    client = new MongoClient(config.mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db();

    // Create indexes
    await createIndexes();

    logger.info('Connected to MongoDB');
    return db;
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDB() {
  if (!db) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
}

/**
 * Create necessary indexes for optimal performance
 */
async function createIndexes() {
  const filesCollection = db.collection('files');
  const jobsCollection = db.collection('jobs');

  // Files collection indexes
  await filesCollection.createIndex({ s3Key: 1 }, { unique: true });
  await filesCollection.createIndex({ uploadedAt: -1 });
  await filesCollection.createIndex({ status: 1 });

  // Jobs collection indexes
  await jobsCollection.createIndex({ fileId: 1 });
  await jobsCollection.createIndex({ state: 1, queuedAt: 1 });
  await jobsCollection.createIndex({ state: 1, lockUntil: 1 });
  await jobsCollection.createIndex({ workerId: 1 });

  logger.info('Database indexes created');
}

export default {
  connectDB,
  getDB,
  closeDB,
};

