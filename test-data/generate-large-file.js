#!/usr/bin/env node

/**
 * Script to generate a large test file for testing streaming upload/processing
 * Usage: node generate-large-file.js [lines] [output-file]
 */

import fs from 'fs';
import { Readable } from 'stream';

const numLines = parseInt(process.argv[2] || '1000000', 10); // Default 1M lines
const outputFile = process.argv[3] || 'test-data/large-file.json';

console.log(`Generating ${numLines} lines to ${outputFile}...`);

const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Ethan', 'Fiona', 'George', 'Hannah', 'Ian', 'Julia'];
const lastNames = ['Smith', 'Johnson', 'Brown', 'Wilson', 'Lee', 'Garcia', 'Martinez', 'Davis', 'Rodriguez', 'Lopez'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];

function generateRecord(id) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${id}@example.com`;
  const age = Math.floor(Math.random() * 50) + 20;
  const city = cities[Math.floor(Math.random() * cities.length)];
  const score = Math.floor(Math.random() * 100);

  return {
    id,
    name: `${firstName} ${lastName}`,
    email,
    age,
    city,
    score,
    timestamp: new Date().toISOString(),
  };
}

// Create a readable stream that generates data on the fly
const dataStream = new Readable({
  read() {
    // Generate in batches
    const batchSize = 1000;
    let batch = '';

    for (let i = 0; i < batchSize && this.currentLine < numLines; i++) {
      this.currentLine = this.currentLine || 0;
      this.currentLine++;
      
      const record = generateRecord(this.currentLine);
      batch += JSON.stringify(record) + '\n';
    }

    if (this.currentLine >= numLines) {
      this.push(batch);
      this.push(null); // End of stream
    } else {
      this.push(batch);
    }

    // Progress indicator
    if (this.currentLine % 100000 === 0) {
      console.log(`Generated ${this.currentLine} / ${numLines} lines...`);
    }
  },
});

dataStream.currentLine = 0;

// Write to file
const writeStream = fs.createWriteStream(outputFile);

writeStream.on('finish', () => {
  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\nComplete! Generated ${numLines} lines (${sizeMB} MB)`);
  console.log(`File: ${outputFile}`);
});

writeStream.on('error', (error) => {
  console.error('Error writing file:', error);
  process.exit(1);
});

dataStream.pipe(writeStream);

