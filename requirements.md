---
## Project summary (what to build)

Build a production-minded Node.js backend using **Express.js**, **AWS S3** for file storage, and **MongoDB** for data and optional job persistence. The app will be deployed to an **EC2 instance** (provide deployment scripts/instructions). Deliver a public GitHub repository containing code + deployment directions and provide the functional URLs for the endpoints running on the EC2 instance.
---

## High-level requirements

1. **Express server** deployed to an **EC2 instance** (provide automated scripts / documented manual steps).
2. **Mandatory endpoint**
   - `POST /upload` — accepts a text file (multipart/form-data) and stores it directly into an S3 bucket (stream upload; do **not** load whole file into memory).
   - Response must include a stable `fileId` (unique ID) and the S3 key or signed URL to retrieve the file.
3. **Optional (bonus)**: implement a minimal job queue system (no external queue libraries). Provide endpoint:
   - `POST /process/:fileId` — enqueue a job to fetch the file from S3, parse/interpret the contents, and write the parsed data into MongoDB.
4. **Robustness & nuances**
   - Files can be very large — use streaming for upload and processing.
   - Line-oriented processing must be resilient: skip/record malformed lines, continue processing.
   - Multiple `/process` requests may arrive concurrently — implement fair scheduling / worker model so server remains responsive.
   - Avoid hammering MongoDB with thousands of tiny writes — use batch/bulk inserts and throttle writes (e.g., write in chunks of N records or use a token-bucket).
   - Design the minimal job queue to survive server restarts: job metadata must persist (MongoDB-based job collection is acceptable). If in-memory queue is used, include fallback persistence and recovery logic.
   - Provide behavior for stale/in-progress jobs after a crash (e.g., jobs with `in_progress` older than X minutes can be reset to `queued`).
5. **Deliverables**
   - Public GitHub repo with code, tests (if possible), README and deployment instructions (EC2 + minimal infra).
   - Running URLs for `POST /upload` and `POST /process/:fileId` on the EC2 instance (or instructions to run locally if the user wants to test).
   - Prefer functional code, but high-quality pseudocode/architecture diagrams are acceptable for complex pieces if time is limited.

---

## Non-functional requirements / constraints

- **Memory**: Do not assume whole files fit in memory; rely on streaming APIs and back-pressure.
- **Resilience**: When a line fails to parse, log it & continue. Provide a per-job error summary.
- **Concurrency**: The main Express server must stay responsive even when workers process big files.
- **Mongo write patterns**: Use bulk writes in batches (e.g., 500 — 5000 docs per bulk) with small pause/backoff between batches. Optionally provide configurable batch size and throttle.
- **Security**
  - All credentials must be loaded from env variables (no secrets in repo).
  - Provide an example `.env.example`.
  - Use least-privilege IAM policy for S3 access (sample policy included in README).
  - Validate file types and sizes (configurable).
- **Observability**: Add basic logs and per-job status (queued / in_progress / completed / failed). Expose simple health check endpoint `/healthz`.

---

## Recommended tech choices (suggested, not mandatory)

- Node.js LTS (v18+)
- Express.js
- AWS SDK v3 (modular) or v2 if preferred, but **use streaming upload** (`Upload` from `@aws-sdk/lib-storage` or streaming with `s3.upload`).
- `busboy` or `multer` streaming mode for file ingestion (avoid buffering).
- MongoDB (Atlas or local) — use the official `mongodb` or Mongoose (either ok).
- Job queue: small custom implementation backed by MongoDB `jobs` collection (preferred) or small in-process queue with periodic persistence.
- Logging: `pino` or `winston`.

---

## API specification (exact behavior and example)

### 1) `POST /upload`

- Request: `multipart/form-data` with field `file` (text file). Accept `Content-Type: multipart/form-data`.
- Behavior:
  - Stream file parts to S3 (do not buffer entire file).
  - Create a `file` metadata entry in MongoDB `files` collection with fields: `_id` (fileId), `s3Key`, `originalName`, `size` (if known), `uploadedAt`, `status: 'uploaded'`.
- Response 2xx JSON:

```json
{
  "fileId": "605d...abc",
  "s3Key": "uploads/2025-11-18/605d...abc.txt",
  "message": "uploaded"
}
```

- Error response: JSON with `error` and HTTP status code.

Example cURL:

```bash
curl -F "file=@/path/to/large.txt" https://YOUR_EC2_HOST/upload

```

### 2) `POST /process/:fileId` (optional/bonus)

- Behavior:
  - Creates a job record in `jobs` collection:
    - `{ _id, fileId, state: 'queued', attempts: 0, queuedAt, startedAt: null, finishedAt: null, progress: 0, errors: [] }`
  - Worker(s) will pick up `queued` jobs and set to `in_progress`. Worker will stream file from S3, process line-by-line and insert parsed records into MongoDB in batches.
  - On success: job state -> `completed`, includes stats (lines processed, inserted, errors).
  - On permanent failure: job state -> `failed`, include error summary.
- Response: The created `jobId` and status.

Example cURL:

```bash
curl -X POST https://YOUR_EC2_HOST/process/605d...abc

```

---

## Job queue & worker design (detailed guidance for Cursor)

**Core ideas (recommend):**

- Persist jobs to `jobs` collection with `state` ∈ { queued, in_progress, completed, failed } and `workerId`, `lockUntil`, `attempts`.
- Worker loop:
  1. Atomically claim a job:

     ```jsx
     const job = await jobsCollection.findOneAndUpdate(
       { state: "queued" },
       {
         $set: {
           state: "in_progress",
           workerId,
           startedAt: now,
           lockUntil: Date.now() + LOCK_MS,
         },
       },
       { sort: { queuedAt: 1 }, returnDocument: "after" }
     );
     ```

  2. If no job, sleep a short period and retry.
  3. While processing, update `progress` occasionally and extend `lockUntil` to prevent others stealing mid-processing.
  4. On worker crash / restart, a job with `state: 'in_progress'` and `lockUntil < Date.now()` is considered stale and may be returned to `queued` (increment `attempts` and backoff).
- **Batched DB writes**: accumulate parsed records into an array; when `batch.length >= BATCH_SIZE` then `bulkWrite` and `batch.length = 0`. Between bulk writes, optionally `await` a short pause (e.g., `sleep(50ms)`) to avoid saturating Mongo.
- **Error handling**: per-line try/catch: malformed line -> append to job.errors and continue. Fatal errors -> mark job failed and include stack trace.
- **Rate-limiting writes**: implement a simple token-bucket or fixed `await sleep()` between bulk writes.
- **Recovery**: On server start, run a job repair routine:
  - `jobs.updateMany({ state: 'in_progress', lockUntil: { $lt: now - someThreshold } }, { $set: { state: 'queued' } })`
- **Multiple workers**: support running multiple worker processes (e.g., cluster mode or multiple PM2 processes); ensure atomic claim prevents duplicate processing.

---

## File processing details

- Use S3 streaming: `s3.getObject({ Bucket, Key }).createReadStream()` (or AWS SDK v3 equivalents).
- Use Node `readline` or `split2` Transform stream for robust per-line processing under back-pressure.
- Each line -> parse into JSON or a schema you define (example: CSV or JSONL). Provide example parser(s) in repo.
- For lines that cannot be parsed: push an error record to the job's error list (capped at some size), log it, and continue.
- After processing completes, update `files` collection to `status: processed`, and job as `completed`.

---

## Deployment & infra guidance (what to deliver)

- Provide step-by-step deployment instructions in `README.md`.
- Minimal automated scripts preferred:
  - A `deploy.sh` that:
    - Provisions / configures an EC2 instance (can be a documented `aws ec2 run-instances` command or a Terraform snippet).
    - Installs Node.js, PM2 (or systemd unit) and starts the app.
    - Sets environment variables (or expects `.env`).
  - Alternatively provide a detailed manual step list (ssh, install Node, clone repo, `npm ci`, set env vars, start with `pm2 start`).
- Provide recommended **IAM policy** for the EC2 instance or the app credentials:
  - Allow `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on the specific bucket/prefix only.
- Provide example `.env.example` with:
  ```
  PORT=3000
  MONGODB_URI=mongodb://username:password@host:27017/dbname
  AWS_REGION=us-east-1
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  S3_BUCKET=your-bucket
  JOB_BATCH_SIZE=1000
  JOB_WRITE_PAUSE_MS=50

  ```
- Health checks:
  - `/healthz` returns 200 when server is up and can reach Mongo and S3 (or reports partial status).

---

## Repo structure (suggested)

```
/README.md
/package.json
/src/
  server.js              # Express server + route registration
  routes/upload.js
  routes/process.js
  lib/s3.js              # S3 streaming helpers
  lib/fileModel.js       # Mongo file metadata model
  lib/jobModel.js        # Mongo job model + helpers
  lib/worker.js          # Worker loop + job claiming logic
  lib/lineParser.js      # Line parsing & validation
  lib/logger.js
/config/
  deployment/            # optional scripts (deploy.sh, terraform snippets)
.env.example

```

---

## Acceptance criteria / tests (what Cursor must provide)

1. **`POST /upload` works**:
   - Upload a sample file (small and a large-ish test file) using `curl -F "file=@..." https://<host>/upload`.
   - Verify S3 object exists and `files` record is in Mongo with `status: uploaded`.
2. **`POST /process/:fileId` works** (if implemented):
   - Enqueue job; verify `jobs` collection has job with `queued` state.
   - Worker picks job up: job becomes `in_progress`, then `completed` with stats.
   - MongoDB receives parsed records (verify count matches expected lines minus errors).
   - Show behavior under concurrent requests (e.g., start two `POST /process/:fileId` requests, or two different fileIds), verifying that jobs are processed fairly and server stays responsive.
3. **Large-file streaming test**:
   - Demonstrate processing of a file > memory size (e.g., multi-GB test or programmatically generated large file). Show streaming (not fully in CI; but provide instructions and logs to prove streaming).
4. **Crash/restart recovery test**:
   - Create a job, force worker process to terminate mid-processing; restart server; show stale job detection and re-queueing behavior.
5. **Security & docs**:
   - Provide `.env.example`, IAM policy snippet, and README with step-by-step deployment and test commands.

---

## Helpful extras (extra credit)

- Add a small web UI or simple HTML form for upload (optional).
- Provide Dockerfile(s) and `docker-compose` for local testing (Mongo + app).
- Add GitHub Actions workflow to run unit tests or basic lint.
- Provide metrics/Prometheus endpoints for processed counts.
- Implement rate limiting on `/upload` (optional).
- Provide a basic Postman collection or curl script for quick testing.

---

## What to include in the PR / repo commit

- Full source code (functional, commented).
- `README.md` with:
  - Project description.
  - Setup & env var instructions.
  - Deployment instructions for EC2 (and optional Terraform/CloudFormation snippet).
  - How to run tests and example `curl` commands.
- Example `.env.example`.
- IAM policy snippet.
- If deployable to EC2, include the live URLs in the README or as a short separate `DEPLOYED.md`.

---

## Constraint reminders for Cursor AI

- **Do not** load uploaded file into memory; use streaming for S3 upload and S3 download.
- **Do not** use an external queue library (Bull, RabbitMQ, SQS) for the bonus — implement a minimal custom queue with persistent job records (Mongo) OR a hybrid in-memory + Mongo approach.
- Keep the server responsive: worker logic should run outside the request lifecycle (background worker loop, or spawn child processes).
- Make job lock/claim atomic and safe for multiple workers.

---

## Example minimal acceptance test commands (include in README)

Upload:

```bash
curl -v -F "file=@./test-data/sample.txt" https://YOUR_HOST/upload

```

Enqueue processing:

```bash
curl -v -X POST https://YOUR_HOST/process/<fileId>

```

Health check:

```bash
curl https://YOUR_HOST/healthz

```

Check job status (example):

```bash
curl https://YOUR_HOST/jobs/<jobId>
# or query Mongo directly

```

---

## Tone for code & docs

- Keep APIs minimal and pragmatic.
- Prioritize working, readable, maintainable code over clever one-liners.
- Write clear comments around streaming, job claiming, and failure/retry logic.

---

### Final note to Cursor AI

Build the system as described, push to a **public GitHub repository**, and provide:

- repo URL,
- running endpoint URLs (deployed EC2 host),
- short demo steps that show upload → process → results.

If you cannot fully deploy to an EC2 instance, still produce a fully working codebase with thorough, reproducible deployment scripts and a clear README describing how to deploy step-by-step. Prioritize production-like behavior (streaming, persisted jobs, bulk writes, crash recovery) and include tests or demo scripts that prove the key behaviors described above.

---
