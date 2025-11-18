import logger from './logger.js';

/**
 * Parse a line as JSON
 */
export function parseJsonLine(line, lineNumber) {
  try {
    const trimmed = line.trim();
    if (!trimmed) {
      return null; // Skip empty lines
    }

    const parsed = JSON.parse(trimmed);
    return {
      lineNumber,
      data: parsed,
      success: true,
    };
  } catch (error) {
    return {
      lineNumber,
      error: error.message,
      rawLine: line.substring(0, 200), // Limit stored line length
      success: false,
    };
  }
}

/**
 * Parse a line as CSV (simple implementation)
 */
export function parseCsvLine(line, lineNumber, headers = null) {
  try {
    const trimmed = line.trim();
    if (!trimmed) {
      return null; // Skip empty lines
    }

    // Simple CSV parsing (doesn't handle quoted commas)
    const values = trimmed.split(',').map(v => v.trim());

    if (headers) {
      // Convert to object using headers
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx] || null;
      });
      return {
        lineNumber,
        data: obj,
        success: true,
      };
    }

    return {
      lineNumber,
      data: values,
      success: true,
    };
  } catch (error) {
    return {
      lineNumber,
      error: error.message,
      rawLine: line.substring(0, 200),
      success: false,
    };
  }
}

/**
 * Parse a plain text line
 */
export function parseTextLine(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null; // Skip empty lines
  }

  return {
    lineNumber,
    data: { text: line },
    success: true,
  };
}

/**
 * Auto-detect and parse line based on content
 */
export function parseLineAuto(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null; // Skip empty lines
  }

  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const result = parseJsonLine(line, lineNumber);
    if (result && result.success) {
      return result;
    }
  }

  // Try CSV if it has commas
  if (trimmed.includes(',')) {
    const result = parseCsvLine(line, lineNumber);
    if (result && result.success) {
      return result;
    }
  }

  // Default to text
  return parseTextLine(line, lineNumber);
}

/**
 * Get parser function based on content type
 */
export function getParser(contentType) {
  const type = (contentType || '').toLowerCase();

  if (type.includes('json')) {
    return parseJsonLine;
  }

  if (type.includes('csv')) {
    return parseCsvLine;
  }

  if (type.includes('text')) {
    return parseTextLine;
  }

  // Default to auto-detect
  return parseLineAuto;
}

/**
 * Validate parsed data before inserting into MongoDB
 */
export function validateParsedData(data) {
  // Add custom validation logic here
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Example: ensure data is not empty
  if (Object.keys(data).length === 0) {
    return false;
  }

  return true;
}

export default {
  parseJsonLine,
  parseCsvLine,
  parseTextLine,
  parseLineAuto,
  getParser,
  validateParsedData,
};

