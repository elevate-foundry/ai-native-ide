#!/bin/bash
#
# Stop Aria IDE servers
#

echo "Stopping Aria IDE..."

# Kill by PID files
if [ -f /tmp/aria-server.pid ]; then
    kill $(cat /tmp/aria-server.pid) 2>/dev/null && echo "  ✓ Aria server stopped"
    rm /tmp/aria-server.pid
fi

if [ -f /tmp/aria-ide.pid ]; then
    kill $(cat /tmp/aria-ide.pid) 2>/dev/null && echo "  ✓ IDE server stopped"
    rm /tmp/aria-ide.pid
fi

# Also kill by port (fallback)
lsof -ti:3200 | xargs kill -9 2>/dev/null || true
lsof -ti:4173 | xargs kill -9 2>/dev/null || true

echo "Done."
