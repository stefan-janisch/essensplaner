#!/bin/bash
cd "$(dirname "$0")"
pkill -f "node server/index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1
npm run dev
