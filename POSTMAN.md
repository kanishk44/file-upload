# Postman Testing Guide

Complete guide for testing the File Upload & Processing Service using Postman.

## 📥 Import Postman Collection

You can import the `postman_collection.json` file included in this repository, or follow the manual setup below.

---

## 🔧 Environment Setup (Optional but Recommended)

Create a Postman environment for easy testing:

1. Click the **Environment** icon (top right)
2. Click **+** to create a new environment
3. Name it "File Upload Service - Local"
4. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:3000` | `http://localhost:3000` |
| `fileId` | (leave empty) | (leave empty) |
| `jobId` | (leave empty) | (leave empty) |

5. Save and select this environment

---

## 📋 API Tests

### 1. Health Check

**Request Setup:**
- **Method:** `GET`
- **URL:** `{{base_url}}/healthz` (or `http://localhost:3000/healthz`)
- **Headers:** None needed
- **Body:** None

**Expected Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T...",
  "uptime": 123.45,
  "services": {
    "mongodb": "healthy",
    "s3": "healthy"
  }
}
```

**Test Script (Optional - auto-verify):**
```javascript
pm.test("Status is 200", function() {
    pm.response.to.have.status(200);
});

pm.test("Service is healthy", function() {
    const jsonData = pm.response.json();
    pm.expect(jsonData.status).to.eql("healthy");
});
```

---

### 2. Upload File

**Request Setup:**
- **Method:** `POST`
- **URL:** `{{base_url}}/upload` (or `http://localhost:3000/upload`)
- **Headers:** 
  - Content-Type is automatically set by Postman when using form-data
- **Body:**
  - Select **form-data**
  - Add a key named `file`
  - Change type from "Text" to **"File"** (dropdown on the right)
  - Click **Select Files** and choose a file (e.g., `test-data/sample.json`)

**Visual Guide:**
```
Body Tab:
┌─────────────────────────────────────────────────┐
│ form-data  |  x-www-form-urlencoded  |  raw     │
├─────────────────────────────────────────────────┤
│ KEY        │ VALUE                   │ TYPE     │
│ file       │ [Select Files]          │ File  ▼  │
│            │ sample.json             │          │
└─────────────────────────────────────────────────┘
```

**Expected Response (200 OK):**
```json
{
  "fileId": "673abc123def456...",
  "s3Key": "uploads/2025-11-18/1234567890-abc123-sample.json",
  "message": "uploaded",
  "metadata": {
    "originalName": "sample.json",
    "size": 1234,
    "contentType": "application/json",
    "uploadedAt": "2025-11-18T..."
  }
}
```

**Test Script (Auto-save fileId):**
```javascript
pm.test("Upload successful", function() {
    pm.response.to.have.status(200);
    const jsonData = pm.response.json();
    pm.expect(jsonData.fileId).to.exist;
    
    // Save fileId to environment for next request
    pm.environment.set("fileId", jsonData.fileId);
    console.log("Saved fileId:", jsonData.fileId);
});
```

---

### 3. Process File

**Request Setup:**
- **Method:** `POST`
- **URL:** `{{base_url}}/process/{{fileId}}` (or manually paste fileId)
- **Headers:** None needed
- **Body:** None

**Note:** Make sure to use the `fileId` from the previous upload response.

**Expected Response (201 Created):**
```json
{
  "jobId": "673def456abc789...",
  "fileId": "673abc123def456...",
  "state": "queued",
  "queuedAt": "2025-11-18T...",
  "message": "Job created and queued for processing"
}
```

**Test Script (Auto-save jobId):**
```javascript
pm.test("Job created successfully", function() {
    pm.response.to.have.status(201);
    const jsonData = pm.response.json();
    pm.expect(jsonData.jobId).to.exist;
    pm.expect(jsonData.state).to.eql("queued");
    
    // Save jobId for next request
    pm.environment.set("jobId", jsonData.jobId);
    console.log("Saved jobId:", jsonData.jobId);
});
```

---

### 4. Check Job Status

**Request Setup:**
- **Method:** `GET`
- **URL:** `{{base_url}}/jobs/{{jobId}}` (or manually paste jobId)
- **Headers:** None needed
- **Body:** None

**Expected Response (200 OK) - When Queued:**
```json
{
  "jobId": "673def456abc789...",
  "fileId": "673abc123def456...",
  "state": "queued",
  "attempts": 0,
  "queuedAt": "2025-11-18T...",
  "startedAt": null,
  "finishedAt": null,
  "progress": {
    "linesProcessed": 0,
    "recordsInserted": 0,
    "errors": 0
  },
  "errorCount": 0,
  "result": null
}
```

**Expected Response - When In Progress:**
```json
{
  "jobId": "673def456abc789...",
  "state": "in_progress",
  "progress": {
    "linesProcessed": 5432,
    "recordsInserted": 5429,
    "errors": 3
  }
}
```

**Expected Response - When Completed:**
```json
{
  "jobId": "673def456abc789...",
  "state": "completed",
  "finishedAt": "2025-11-18T...",
  "progress": {
    "linesProcessed": 10000,
    "recordsInserted": 9987,
    "errors": 13
  },
  "result": {
    "linesProcessed": 10000,
    "recordsInserted": 9987,
    "errorCount": 13,
    "success": true
  }
}
```

**Test Script:**
```javascript
pm.test("Job status retrieved", function() {
    pm.response.to.have.status(200);
    const jsonData = pm.response.json();
    pm.expect(jsonData.jobId).to.exist;
    pm.expect(jsonData.state).to.be.oneOf(["queued", "in_progress", "completed", "failed"]);
    console.log("Job state:", jsonData.state);
    console.log("Progress:", jsonData.progress);
});
```

---

### 5. Service Info (Root Endpoint)

**Request Setup:**
- **Method:** `GET`
- **URL:** `{{base_url}}/` (or `http://localhost:3000/`)
- **Headers:** None needed
- **Body:** None

**Expected Response (200 OK):**
```json
{
  "service": "File Upload & Processing Service",
  "version": "1.0.0",
  "endpoints": {
    "upload": "POST /upload",
    "process": "POST /process/:fileId",
    "jobStatus": "GET /jobs/:jobId",
    "health": "GET /healthz"
  }
}
```

---

## 🔄 Complete Workflow in Postman

### Step-by-Step Testing Flow:

1. **Test Health Check** → Verify service is running
2. **Upload File** → Get `fileId`, auto-saved to environment
3. **Create Processing Job** → Get `jobId`, auto-saved to environment
4. **Check Job Status** (multiple times) → Monitor progress
5. **Verify in MongoDB** → Check the processed records

### Using Postman Runner (Automated Testing):

1. Create a collection with all requests
2. Click **Run Collection**
3. Select the environment
4. Add a delay of 2-3 seconds between requests
5. Run the entire workflow automatically

---

## 🎯 Testing Different File Types

### Upload JSON Lines File

**File Content (sample.json):**
```json
{"id": 1, "name": "Alice", "email": "alice@example.com"}
{"id": 2, "name": "Bob", "email": "bob@example.com"}
```

### Upload CSV File

**File Content (sample.csv):**
```csv
id,name,email,age
1,Alice,alice@example.com,28
2,Bob,bob@example.com,34
```

### Upload Large File

Generate first:
```bash
node test-data/generate-large-file.js 100000
```
Then upload `test-data/large-file.json` in Postman.

---

## 🧪 Advanced Testing Scenarios

### Test Error Handling

**Upload without file:**
- URL: `POST {{base_url}}/upload`
- Body: Empty form-data
- Expected: 400 Bad Request

**Process non-existent file:**
- URL: `POST {{base_url}}/process/507f1f77bcf86cd799439011`
- Expected: 404 Not Found

**Invalid file ID format:**
- URL: `POST {{base_url}}/process/invalid-id`
- Expected: 400 Bad Request

---

## 📊 Monitor Processing with Postman

### Poll Job Status Every 2 Seconds

1. Create a "Check Job Status" request
2. Go to the **Tests** tab
3. Add this script:

```javascript
const jobState = pm.response.json().state;

if (jobState === "queued" || jobState === "in_progress") {
    // Still processing, check again in 2 seconds
    setTimeout(() => {
        postman.setNextRequest(pm.info.requestName);
    }, 2000);
} else {
    // Job complete or failed
    console.log("Final state:", jobState);
    console.log("Result:", pm.response.json().result);
}
```

---

## 💾 Pre-request Scripts

### Auto-generate Test Data

Add this to a request's **Pre-request Script** tab:

```javascript
// Generate random test data
const timestamp = Date.now();
const randomId = Math.random().toString(36).substring(7);

pm.environment.set("test_filename", `test-${timestamp}-${randomId}.json`);
pm.environment.set("test_timestamp", timestamp);

console.log("Generated test filename:", pm.environment.get("test_filename"));
```

---

## 🎨 Visualize Response

Add to **Tests** tab to see formatted output:

```javascript
// Pretty print the response
const response = pm.response.json();
console.log(JSON.stringify(response, null, 2));

// Create a visualization
const template = `
    <h3>Upload Result</h3>
    <table>
        <tr><td><strong>File ID:</strong></td><td>{{fileId}}</td></tr>
        <tr><td><strong>S3 Key:</strong></td><td>{{s3Key}}</td></tr>
        <tr><td><strong>Status:</strong></td><td>{{message}}</td></tr>
    </table>
`;

pm.visualizer.set(template, {
    fileId: response.fileId,
    s3Key: response.s3Key,
    message: response.message
});
```

---

## 📱 Testing from Different Environments

Create multiple environments in Postman:

**Local Development:**
- `base_url`: `http://localhost:3000`

**EC2 Staging:**
- `base_url`: `http://ec2-XX-XXX-XXX-XXX.compute-1.amazonaws.com:3000`

**EC2 Production:**
- `base_url`: `http://your-domain.com`

Switch between environments using the dropdown in the top-right corner.

---

## 🔐 Authentication (Future Enhancement)

If you add authentication later, you can set up:

**Environment Variables:**
- `api_key` or `auth_token`

**Pre-request Script (Collection Level):**
```javascript
pm.request.headers.add({
    key: 'Authorization',
    value: 'Bearer ' + pm.environment.get('auth_token')
});
```

---

## 📝 Tips & Tricks

### 1. Save Responses for Later
Click **Save Response** under the response body to save example responses.

### 2. Use Code Snippets
Click **Code** (top right) to generate code in various languages:
- JavaScript (fetch, axios)
- Python (requests)
- Node.js
- Java
- PHP
- etc.

### 3. Monitor Collections
Use Postman Monitors to run your collection automatically at intervals.

### 4. Share Collections
Export your collection and share with team members:
- Click **...** → **Export** → Choose v2.1 format

### 5. Generate Documentation
- Click **...** → **View Documentation** → **Publish**
- Creates a beautiful API documentation website

---

## 🚨 Common Postman Issues & Solutions

### ❌ "No file uploaded. Please include a file in the 'file' field"

This is the most common issue! Here's how to fix it:

**Problem:** The field type is set to "Text" instead of "File"

**Solution:**
1. In Postman, go to **Body** tab
2. Select **form-data**
3. In the KEY column, type: `file`
4. **IMPORTANT:** In the dropdown on the right, change from **"Text"** to **"File"**
5. Click "Select Files" button that appears
6. Choose your file

**Visual Guide:**
```
❌ WRONG:
KEY: file | VALUE: [text input] | TYPE: Text ▼

✅ CORRECT:
KEY: file | VALUE: [Select Files] | TYPE: File ▼
```

**Double Check:**
- The TYPE dropdown must say "File" (not "Text")
- You should see a file selection button, not a text input
- After selecting, you should see the filename displayed

---

### ❌ "Could not get any response"

**Causes:**
- Server is not running
- Wrong URL
- Firewall blocking the connection

**Solutions:**
1. Check if server is running: `npm start`
2. Verify URL is correct: `http://localhost:3000`
3. Check server logs for errors
4. Try in browser: `http://localhost:3000/healthz`

---

### ❌ "Upload failed" or "File type not allowed"

**Problem:** File type is not in the allowed list

**Solution:**
Update `.env` file:
```env
ALLOWED_FILE_TYPES=text/plain,application/json,text/csv,application/octet-stream
```

Or check what MIME type your file has and add it to the list.

---

### ❌ "Request timeout"

**Problem:** Large files take time to upload

**Solution:**
1. Go to Settings (⚙️ icon in top right)
2. Find "Request timeout in ms"
3. Increase to 300000 (5 minutes) or more
4. For very large files (>1GB), set to 600000 (10 minutes)

---

### ❌ "Bucket name shouldn't contain '/'"

**Problem:** S3_BUCKET in .env has wrong format

**Solution:**
Change from:
```env
❌ S3_BUCKET=s3://my-bucket/files/
```

To:
```env
✅ S3_BUCKET=my-bucket
```

Just the bucket name, no `s3://` prefix or paths!

---

### ⚠️ Upload seems stuck

**Check:**
1. Open Postman Console (View → Show Postman Console)
2. Look for errors or progress
3. Check server logs: `pm2 logs file-upload-service`
4. Verify S3 and MongoDB are accessible

---

### 💡 Pro Debugging Tips

**Enable detailed logs:**
```bash
# In your terminal where server is running
LOG_LEVEL=debug npm start
```

**Test with curl first:**
```bash
curl -F "file=@test-data/sample.json" http://localhost:3000/upload
```

If curl works but Postman doesn't, it's definitely the File/Text dropdown issue!

**Check actual request:**
In Postman:
1. Click "Code" (top right of request)
2. Select "cURL"
3. Verify the command looks correct
4. Should have `--form 'file=@...'`

---

## 📦 Export Your Collection

Once you've created all requests:

1. Click on the collection name
2. Click **...** (three dots)
3. Select **Export**
4. Choose **Collection v2.1**
5. Save as `File_Upload_Service.postman_collection.json`

You can share this file with others!

---

**Happy Testing! 🚀**

For more help, see the main README.md or QUICKSTART.md.

