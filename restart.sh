#!/bin/bash
# Builds the client and restarts the production server, which runs as the systemd unit
# essensplaner.service (it loads .env: SESSION_SECRET, CLIENT_URL, …). Logs: journalctl -u essensplaner
set -e
cd "$(dirname "$0")"
npm run build
systemctl stop essensplaner.service
# A server started outside systemd (old nohup start, npm run dev) would block port 3001
fuser -k -TERM -n tcp 3001 >/dev/null 2>&1 || true
sleep 1
systemctl start essensplaner.service
for _ in $(seq 1 15); do
  if curl -sf http://localhost:3001/api/health; then
    echo " ✓ Server läuft"
    exit 0
  fi
  sleep 1
done
echo " ✗ Server nicht erreichbar"
journalctl -u essensplaner.service -n 20 --no-pager
exit 1
