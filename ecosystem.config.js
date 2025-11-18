/**
 * PM2 Ecosystem Configuration
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only app
 *   pm2 start ecosystem.config.js --only worker
 */

module.exports = {
  apps: [
    {
      name: 'file-upload-app',
      script: './src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        ENABLE_WORKER: 'true',
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      restart_delay: 5000,
      watch: false,
      autorestart: true,
    },
    // Uncomment to run additional worker processes
    // {
    //   name: 'file-upload-worker-2',
    //   script: './src/server.js',
    //   instances: 1,
    //   exec_mode: 'fork',
    //   env: {
    //     NODE_ENV: 'production',
    //     ENABLE_WORKER: 'true',
    //     WORKER_ID: 'worker-2',
    //     PORT: '3001', // Different port to avoid conflict
    //   },
    //   error_file: './logs/worker-2-error.log',
    //   out_file: './logs/worker-2-out.log',
    //   log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    //   merge_logs: true,
    //   max_memory_restart: '1G',
    //   restart_delay: 5000,
    //   watch: false,
    //   autorestart: true,
    // },
  ],
};

