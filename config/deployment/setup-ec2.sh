#!/bin/bash

# EC2 Instance Setup Script
# Run this script ON the EC2 instance after initial launch

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}[INFO]${NC} Setting up EC2 instance for File Upload Service..."

# Update system packages
echo -e "${GREEN}[INFO]${NC} Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18.x
echo -e "${GREEN}[INFO]${NC} Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build essentials (needed for some npm packages)
sudo apt-get install -y build-essential

# Install PM2 globally
echo -e "${GREEN}[INFO]${NC} Installing PM2..."
sudo npm install -g pm2

# Install git
echo -e "${GREEN}[INFO]${NC} Installing git..."
sudo apt-get install -y git

# Create logs directory
mkdir -p ~/logs

# Configure firewall (if using UFW)
echo -e "${GREEN}[INFO]${NC} Configuring firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3000/tcp  # Application port
sudo ufw --force enable

# Print versions
echo -e "${GREEN}[INFO]${NC} Installation complete!"
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "PM2 version: $(pm2 --version)"
echo ""
echo -e "${YELLOW}[NEXT STEPS]${NC}"
echo "1. Clone your repository or copy application files"
echo "2. Create .env file with required configuration"
echo "3. Run: npm ci"
echo "4. Start the application: pm2 start src/server.js --name file-upload-service"
echo "5. Save PM2 process list: pm2 save"
echo "6. Setup PM2 to start on boot: pm2 startup"

