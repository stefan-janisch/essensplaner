#!/bin/bash
cd "$(dirname "$0")"
npm run build
pkill -f "node server/index.js" 2>/dev/null
sleep 1
NODE_ENV=production nohup node server/index.js > /tmp/essensplaner.log 2>&1 &
sleep 2
curl -sf http://localhost:3001/api/health && echo " ✓ Server läuft" || echo " ✗ Server nicht erreichbar"
