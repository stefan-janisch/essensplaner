#!/bin/bash
# Starts only the Vite dev client (:5173). Its API is the production server (VITE_API_URL),
# so backend changes go live via ./restart.sh — never start a second server on :3001 here.
cd "$(dirname "$0")"
pkill -f "vite" 2>/dev/null
sleep 1
npm run dev:client
