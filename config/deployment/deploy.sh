#!/bin/bash

# File Upload & Processing Service - EC2 Deployment Script
# This script automates the deployment of the application to an EC2 instance

set -e

# Configuration
APP_NAME="file-upload-service"
EC2_USER="ubuntu"
EC2_HOST="${EC2_HOST:-}"
SSH_KEY="${SSH_KEY:-}"
DEPLOY_DIR="/home/ubuntu/${APP_NAME}"
NODE_VERSION="18"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if EC2_HOST is set
if [ -z "$EC2_HOST" ]; then
    log_error "EC2_HOST environment variable is not set"
    echo "Usage: EC2_HOST=your-ec2-ip.compute.amazonaws.com SSH_KEY=/path/to/key.pem ./deploy.sh"
    exit 1
fi

# Check if SSH_KEY is set
if [ -z "$SSH_KEY" ]; then
    log_error "SSH_KEY environment variable is not set"
    echo "Usage: EC2_HOST=your-ec2-ip.compute.amazonaws.com SSH_KEY=/path/to/key.pem ./deploy.sh"
    exit 1
fi

# Check if SSH key file exists
if [ ! -f "$SSH_KEY" ]; then
    log_error "SSH key file not found: $SSH_KEY"
    exit 1
fi

# Check SSH key permissions
KEY_PERMS=$(stat -f "%A" "$SSH_KEY" 2>/dev/null || stat -c "%a" "$SSH_KEY" 2>/dev/null)
if [ "$KEY_PERMS" != "400" ] && [ "$KEY_PERMS" != "600" ]; then
    log_warn "SSH key has incorrect permissions: $KEY_PERMS"
    log_info "Fixing permissions to 400..."
    chmod 400 "$SSH_KEY"
fi

log_info "Starting deployment to $EC2_HOST..."

# Step 1: Install Node.js and dependencies on EC2
log_info "Installing Node.js and dependencies..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} << 'ENDSSH'
    # Update system
    sudo apt-get update

    # Install Node.js using NodeSource
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # Install PM2 globally
    if ! command -v pm2 &> /dev/null; then
        sudo npm install -g pm2
    fi

    # Install git if not present
    if ! command -v git &> /dev/null; then
        sudo apt-get install -y git
    fi

    echo "Node.js version: $(node --version)"
    echo "npm version: $(npm --version)"
    echo "PM2 version: $(pm2 --version)"
ENDSSH

log_info "Node.js and dependencies installed"

# Step 2: Create deployment directory
log_info "Creating deployment directory..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} "mkdir -p ${DEPLOY_DIR}"

# Step 3: Copy application files
log_info "Copying application files..."
rsync -avz -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
    --exclude 'node_modules' --exclude '.git' --exclude '.env' \
    ./ ${EC2_USER}@${EC2_HOST}:${DEPLOY_DIR}/

log_info "Files copied"

# Step 4: Install npm dependencies
log_info "Installing npm dependencies..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} << ENDSSH
    cd ${DEPLOY_DIR}
    npm ci --production
ENDSSH

log_info "Dependencies installed"

# Step 5: Copy .env file (if exists locally)
if [ -f .env ]; then
    log_info "Copying .env file..."
    scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no .env ${EC2_USER}@${EC2_HOST}:${DEPLOY_DIR}/.env
else
    log_warn ".env file not found locally. Please create it on the server."
    log_warn "You can use env.example as a template."
fi

# Step 6: Start/restart application with PM2
log_info "Starting application with PM2..."
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} << ENDSSH
    cd ${DEPLOY_DIR}
    
    # Stop existing PM2 process if running
    pm2 stop ${APP_NAME} || true
    pm2 delete ${APP_NAME} || true
    
    # Start the application
    pm2 start src/server.js --name ${APP_NAME} \
        --log /home/ubuntu/logs/${APP_NAME}.log \
        --time \
        --max-memory-restart 1G
    
    # Save PM2 process list
    pm2 save
    
    # Setup PM2 to start on system boot
    sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
    
    # Show status
    pm2 status
ENDSSH

log_info "Application started with PM2"

# Step 7: Verify deployment
log_info "Verifying deployment..."
sleep 3

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://${EC2_HOST}:3000/healthz || echo "000")

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 503 ]; then
    log_info "✓ Deployment successful!"
    log_info "Application is running at: http://${EC2_HOST}:3000"
    log_info "Health check: http://${EC2_HOST}:3000/healthz"
else
    log_warn "Health check returned HTTP $HTTP_CODE"
    log_warn "Please check the application logs:"
    log_warn "  ssh ${EC2_USER}@${EC2_HOST} 'pm2 logs ${APP_NAME}'"
fi

log_info "Deployment complete!"
log_info ""
log_info "Useful commands:"
log_info "  View logs:    ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'pm2 logs ${APP_NAME}'"
log_info "  Stop app:     ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'pm2 stop ${APP_NAME}'"
log_info "  Restart app:  ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'pm2 restart ${APP_NAME}'"
log_info "  App status:   ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'pm2 status'"

