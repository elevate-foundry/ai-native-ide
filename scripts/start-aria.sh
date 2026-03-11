#!/bin/bash
#
# Start Aria with all LLM model servers
# Usage: ./scripts/start-aria.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    🚀 Starting Aria                        ║"
echo "║          AI Runtime Interactive Agent + LLM Fleet          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Load .env if it exists
if [ -f .env ]; then
    echo -e "${GREEN}✓ Loading .env file${NC}"
    export $(grep -v '^#' .env | xargs)
fi

# Check for API key
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo -e "${RED}❌ OPENROUTER_API_KEY not set${NC}"
    echo "   Set it in .env or export OPENROUTER_API_KEY=your_key"
    exit 1
fi
echo -e "${GREEN}✓ OpenRouter API key found${NC}"

# Kill processes on ports we need
echo -e "\n${YELLOW}🧹 Clearing ports...${NC}"

# Aria desktop server
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null && echo "   Killed process on port $port"
    fi
}

# Clear Aria port
kill_port 4173

# Clear model server ports (3100-3171)
for port in $(seq 3100 3171); do
    kill_port $port
done

# Also kill any existing node processes for our scripts
pkill -f "serve-desktop.mjs" 2>/dev/null || true
pkill -f "model-servers.mjs" 2>/dev/null || true

echo -e "${GREEN}✓ Ports cleared${NC}"

# Start model servers in background
echo -e "\n${YELLOW}🔥 Starting LLM model servers...${NC}"
node scripts/model-servers.mjs &
MODEL_PID=$!
echo -e "${GREEN}✓ Model servers starting (PID: $MODEL_PID)${NC}"

# Wait for model servers to initialize
sleep 3

# Start Aria backend API server
echo -e "\n${YELLOW}🧠 Starting Aria backend server...${NC}"
node scripts/aria-server.mjs &
BACKEND_PID=$!
echo -e "${GREEN}✓ Aria backend started (PID: $BACKEND_PID)${NC}"

# Start Aria desktop server
echo -e "\n${YELLOW}🖥️  Starting Aria desktop server...${NC}"
node scripts/serve-desktop.mjs &
ARIA_PID=$!
echo -e "${GREEN}✓ Aria frontend started (PID: $ARIA_PID)${NC}"

# Wait for server to be ready
sleep 2

echo -e "\n${CYAN}"
echo "════════════════════════════════════════════════════════════"
echo -e "${NC}"
echo -e "${GREEN}✅ Aria is running!${NC}"
echo ""
echo -e "   ${CYAN}Aria UI:${NC}        http://localhost:4173"
echo -e "   ${CYAN}Aria Backend:${NC}   http://localhost:3200"
echo ""
echo -e "   ${CYAN}Model Servers:${NC}"
echo "   ├── Claude 3.5 Sonnet    http://localhost:3100"
echo "   ├── Claude 3 Opus        http://localhost:3101"
echo "   ├── Claude 3 Haiku       http://localhost:3102"
echo "   ├── GPT-4o               http://localhost:3110"
echo "   ├── GPT-4o Mini          http://localhost:3111"
echo "   ├── GPT-4 Turbo          http://localhost:3112"
echo "   ├── o1 Preview           http://localhost:3113"
echo "   ├── o1 Mini              http://localhost:3114"
echo "   ├── Gemini Pro 1.5       http://localhost:3120"
echo "   ├── Gemini Flash 1.5     http://localhost:3121"
echo "   ├── Llama 3.1 405B       http://localhost:3130"
echo "   ├── Llama 3.1 70B        http://localhost:3131"
echo "   ├── Llama 3.1 8B         http://localhost:3132"
echo "   ├── Mistral Large        http://localhost:3140"
echo "   ├── Mixtral 8x22B        http://localhost:3141"
echo "   ├── Mistral 7B           http://localhost:3142"
echo "   ├── Command R+           http://localhost:3150"
echo "   ├── Command R            http://localhost:3151"
echo "   ├── DeepSeek Chat        http://localhost:3160"
echo "   ├── DeepSeek Coder       http://localhost:3161"
echo "   ├── Qwen 2.5 72B         http://localhost:3170"
echo "   └── Qwen 2.5 Coder 32B   http://localhost:3171"
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Save PIDs for cleanup
echo "$MODEL_PID $BACKEND_PID $ARIA_PID" > /tmp/aria-pids.txt

# Handle Ctrl+C
cleanup() {
    echo -e "\n\n${YELLOW}🛑 Shutting down Aria...${NC}"
    kill $MODEL_PID 2>/dev/null
    kill $BACKEND_PID 2>/dev/null
    kill $ARIA_PID 2>/dev/null
    pkill -f "serve-desktop.mjs" 2>/dev/null || true
    pkill -f "model-servers.mjs" 2>/dev/null || true
    pkill -f "aria-server.mjs" 2>/dev/null || true
    rm -f /tmp/aria-pids.txt
    echo -e "${GREEN}✓ All servers stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script running and show logs
wait
