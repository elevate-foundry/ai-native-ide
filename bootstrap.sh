#!/bin/bash
#
# Aria IDE Bootstrap Script
# 
# Usage:
#   git clone https://github.com/elevate-foundry/ai-native-ide.git
#   cd ai-native-ide
#   ./bootstrap.sh
#
# This script will:
#   1. Check/install dependencies (Node.js, npm)
#   2. Install npm packages
#   3. Set up environment variables
#   4. Start the Aria server and IDE
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Aria ASCII art
echo -e "${CYAN}"
cat << 'EOF'
    _          _         ___ ____  _____ 
   / \   _ __ (_) __ _  |_ _|  _ \| ____|
  / _ \ | '__|| |/ _` |  | || | | |  _|  
 / ___ \| |   | | (_| |  | || |_| | |___ 
/_/   \_\_|   |_|\__,_| |___|____/|_____|
                                          
EOF
echo -e "${NC}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  AI Runtime Interactive Agent - Your AI-Native IDE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check for Node.js
echo -e "${YELLOW}[1/5]${NC} Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "  ${GREEN}✓${NC} Node.js ${NODE_VERSION} found"
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    echo ""
    echo -e "  Please install Node.js first:"
    echo -e "    ${CYAN}brew install node${NC}  (macOS)"
    echo -e "    ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs${NC}  (Ubuntu)"
    exit 1
fi

# Check for npm
echo -e "${YELLOW}[2/5]${NC} Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "  ${GREEN}✓${NC} npm ${NPM_VERSION} found"
else
    echo -e "  ${RED}✗${NC} npm not found"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}[3/5]${NC} Installing dependencies..."
npm install --silent 2>/dev/null || npm install
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# Set up environment
echo -e "${YELLOW}[4/5]${NC} Setting up environment..."

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    # Check if OPENROUTER_API_KEY is already set
    if [ -n "$OPENROUTER_API_KEY" ]; then
        echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" > "$ENV_FILE"
        echo -e "  ${GREEN}✓${NC} Using existing OPENROUTER_API_KEY from environment"
    else
        # Prompt for API key
        echo ""
        echo -e "  ${YELLOW}!${NC} OpenRouter API key not found"
        echo -e "  Get one at: ${CYAN}https://openrouter.ai/keys${NC}"
        echo ""
        read -p "  Enter your OpenRouter API key (or press Enter to skip): " API_KEY
        
        if [ -n "$API_KEY" ]; then
            echo "OPENROUTER_API_KEY=$API_KEY" > "$ENV_FILE"
            echo -e "  ${GREEN}✓${NC} API key saved to .env"
        else
            echo "# Add your OpenRouter API key here" > "$ENV_FILE"
            echo "OPENROUTER_API_KEY=" >> "$ENV_FILE"
            echo -e "  ${YELLOW}!${NC} Skipped - add your key to .env later"
        fi
    fi
else
    echo -e "  ${GREEN}✓${NC} .env file exists"
fi

# Determine ports
ARIA_PORT=${ARIA_PORT:-3200}
IDE_PORT=${IDE_PORT:-4173}

# Start servers
echo -e "${YELLOW}[5/5]${NC} Starting Aria IDE..."
echo ""

# Kill any existing processes on our ports
lsof -ti:$ARIA_PORT | xargs kill -9 2>/dev/null || true
lsof -ti:$IDE_PORT | xargs kill -9 2>/dev/null || true

# Start Aria server in background
echo -e "  Starting Aria server on port ${CYAN}$ARIA_PORT${NC}..."
node scripts/aria-server.mjs > /tmp/aria-server.log 2>&1 &
ARIA_PID=$!

# Wait for server to start
sleep 2

# Check if server started
if kill -0 $ARIA_PID 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Aria server running (PID: $ARIA_PID)"
else
    echo -e "  ${RED}✗${NC} Failed to start Aria server"
    echo -e "  Check logs: ${CYAN}cat /tmp/aria-server.log${NC}"
    exit 1
fi

# Start IDE server in background
echo -e "  Starting IDE server on port ${CYAN}$IDE_PORT${NC}..."
IDE_MODE=true node scripts/serve-desktop.mjs > /tmp/aria-ide.log 2>&1 &
IDE_PID=$!

sleep 1

if kill -0 $IDE_PID 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} IDE server running (PID: $IDE_PID)"
else
    echo -e "  ${RED}✗${NC} Failed to start IDE server"
    exit 1
fi

# Save PIDs for later cleanup
echo "$ARIA_PID" > /tmp/aria-server.pid
echo "$IDE_PID" > /tmp/aria-ide.pid

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ Aria IDE is ready!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}IDE:${NC}     http://localhost:$IDE_PORT/ide"
echo -e "  ${CYAN}API:${NC}     http://localhost:$ARIA_PORT"
echo -e "  ${CYAN}CLI:${NC}     npm run aria"
echo ""
echo -e "  ${YELLOW}To stop:${NC}  ./stop.sh  or  kill $ARIA_PID $IDE_PID"
echo ""

# Open browser (optional)
if [[ "$OSTYPE" == "darwin"* ]]; then
    read -p "  Open IDE in browser? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        open "http://localhost:$IDE_PORT/ide"
    fi
elif command -v xdg-open &> /dev/null; then
    read -p "  Open IDE in browser? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        xdg-open "http://localhost:$IDE_PORT/ide"
    fi
fi

echo -e "${GREEN}Happy coding with Aria! 🚀${NC}"
