# Deployment Guide - Essensplaner

## Prerequisites

- Ubuntu 24.04 VPS (or similar Linux distribution)
- Root access or sudo privileges
- A domain or subdomain pointing to your VPS (A and AAAA records configured)
- OpenAI API key

## Complete Production Deployment Guide

This guide covers deploying the Essensplaner application on a fresh Ubuntu server with Node.js, systemd service, Nginx reverse proxy, and SSL certificates.

### 1. Prepare Your Server

```bash
# Connect to your server
ssh root@your-server-ip

# Update system packages
apt update && apt upgrade -y
```

### 2. Install Node.js 20+

The application requires Node.js 20 or higher:

```bash
# Install Node.js 20 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 3. Set Up Application Directory

```bash
# Create application directory
mkdir -p /opt/essensplaner
cd /opt/essensplaner

# Copy your project files to this directory
# (Use scp, rsync, or git clone)
```

### 4. Install Dependencies

```bash
cd /opt/essensplaner

# Install npm packages
npm install

# Note: If you encounter native binding errors, run:
rm -rf node_modules package-lock.json
npm install
```

### 5. Configure Environment

Create `.env` file in `/opt/essensplaner`:

```bash
cat > /opt/essensplaner/.env << 'EOF'
NODE_ENV=production
PORT=3001
CLIENT_URL=https://yourdomain.com
EOF
```

### 6. Configure OpenAI API Key

Create `openai_credentials.toml` in `/opt/essensplaner`:

```toml
key = "sk-your-openai-api-key-here"
```

**Important:** Ensure this file has proper permissions:
```bash
chmod 600 /opt/essensplaner/openai_credentials.toml
```

### 7. Build the Frontend

```bash
cd /opt/essensplaner

# Fix TypeScript errors if needed (unused imports)
# Build the production bundle
npm run build
```

This creates optimized production files in the `dist/` directory.

### 8. Set Up systemd Service

Create systemd service file at `/etc/systemd/system/essensplaner.service`:

```ini
[Unit]
Description=Essensplaner Application
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/essensplaner
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Reload systemd
systemctl daemon-reload

# Enable service to start on boot
systemctl enable essensplaner

# Start the service
systemctl start essensplaner

# Check status
systemctl status essensplaner
```

### 9. Install and Configure Nginx

Install Nginx:

```bash
apt-get install -y nginx
```

Create Nginx configuration at `/etc/nginx/sites-available/essensplaner`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;

    # Allow certbot challenges
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Serve static files from dist
    location / {
        root /opt/essensplaner/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
# Create symlink
ln -s /etc/nginx/sites-available/essensplaner /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

### 10. Enable HTTPS with Let's Encrypt

Install Certbot:

```bash
apt-get install -y certbot python3-certbot-nginx
```

Obtain SSL certificate:

```bash
certbot --nginx -d yourdomain.com --non-interactive --agree-tos --email your@email.com --redirect
```

Certbot will:
- Automatically obtain the certificate
- Configure Nginx for HTTPS
- Set up automatic renewal

Verify auto-renewal is configured:

```bash
systemctl status certbot.timer
```

### 11. Verify Deployment

Check all services are running:

```bash
# Check application service
systemctl status essensplaner

# Check Nginx
systemctl status nginx

# Test HTTPS access
curl -I https://yourdomain.com

# Test API endpoint
curl https://yourdomain.com/api/health
# Should return: {"status":"ok"}
```

## Important Notes

### Nginx Configuration

- **Static Files:** Nginx serves the frontend directly from `/opt/essensplaner/dist`
- **API Proxy:** API requests to `/api/*` are proxied to the Node.js backend on port 3001
- **IPv6 Support:** The configuration includes IPv6 support (`listen [::]:80`)
- **SSL Redirect:** Certbot automatically adds HTTPS redirect

### systemd Service

The service is configured to:
- Start automatically on boot
- Restart automatically if it crashes
- Log to system journal (view with `journalctl -u essensplaner`)

### Environment Variables

The `.env` file is loaded by the Node.js application. Key variables:
- `NODE_ENV=production` - Enables production mode
- `PORT=3001` - Backend server port (not exposed, Nginx proxies to it)
- `CLIENT_URL` - CORS allowed origin

## File Structure

```
/opt/essensplaner/
├── dist/                    # Built frontend files (generated by npm run build)
├── server/                  # Backend server
│   └── index.js            # Main server file
├── src/                     # Frontend source files
├── node_modules/           # Dependencies
├── openai_credentials.toml  # OpenAI API key (NOT in git)
├── .env                     # Environment variables (NOT in git)
└── package.json
```

## Troubleshooting

### Service Won't Start

Check logs:
```bash
journalctl -u essensplaner -n 50 --no-pager
```

Common issues:
- Missing `openai_credentials.toml` file
- Incorrect file permissions
- Port 3001 already in use

### SSL Certificate Issues

If certbot fails with IPv6 errors:
1. Ensure your domain has both A (IPv4) and AAAA (IPv6) records
2. The `.well-known/acme-challenge/` location in Nginx config is required
3. Check firewall allows ports 80 and 443

View certbot logs:
```bash
cat /var/log/letsencrypt/letsencrypt.log
```

### Bring! Export Not Working

The Bring! export requires your application to be accessible via a public URL:
1. Verify your domain is accessible from the internet
2. Check that the API endpoint works: `curl https://yourdomain.com/api/health`
3. Restart the service: `systemctl restart essensplaner`

### CORS Errors

- Ensure `CLIENT_URL` in `.env` matches your domain (including https://)
- Restart after changing: `systemctl restart essensplaner`

## Updating the Application

When you make changes to the code:

```bash
# Navigate to application directory
cd /opt/essensplaner

# Pull latest changes (if using git)
git pull

# Install any new dependencies
npm install

# Rebuild frontend
npm run build

# Restart the service
systemctl restart essensplaner

# Check status
systemctl status essensplaner
```

For server-only changes (no frontend changes), you can skip `npm run build`.

## Monitoring

### View Logs

```bash
# Real-time logs
journalctl -u essensplaner -f

# Last 100 lines
journalctl -u essensplaner -n 100 --no-pager
```

### Check Service Status

```bash
# Service status
systemctl status essensplaner

# Restart service
systemctl restart essensplaner

# Stop service
systemctl stop essensplaner

# Start service
systemctl start essensplaner
```

## Security Checklist

- [x] `.env` and `openai_credentials.toml` are in `.gitignore`
- [x] HTTPS is enabled (Let's Encrypt)
- [x] SSL certificate auto-renewal is configured
- [x] Service runs with appropriate permissions
- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] SSH key authentication enabled (password auth disabled)
- [ ] OpenAI API key has spending limits configured
- [ ] Regular system updates scheduled
- [ ] Backup strategy implemented

### Optional: Configure Firewall (UFW)

```bash
# Enable firewall
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

### Optional: Add HTTP Basic Authentication

If you want to add password protection via Nginx:

```bash
# Install htpasswd utility
apt install apache2-utils

# Create password file
htpasswd -c /etc/nginx/.htpasswd username

# Add to Nginx server block:
# auth_basic "Essensplaner Login";
# auth_basic_user_file /etc/nginx/.htpasswd;

# Reload Nginx
systemctl reload nginx
```

## Production Deployment Summary

The deployment uses the following architecture:

```
Internet
   ↓
Nginx (Port 80/443)
   ├─→ Static Files (/opt/essensplaner/dist)
   └─→ API Proxy (/api/* → http://localhost:3001)
       ↓
   Node.js App (systemd service)
       ↓
   OpenAI API
```

Benefits:
- **Nginx** handles static files efficiently and SSL termination
- **systemd** manages the Node.js process (auto-restart, logging)
- **Let's Encrypt** provides free SSL certificates with auto-renewal
- **Separation** of frontend (Nginx) and backend (Node.js) concerns

## Support

For issues:
1. Check service logs: `journalctl -u essensplaner -n 100`
2. Check Nginx logs: `tail -f /var/log/nginx/error.log`
3. Verify all services are running: `systemctl status essensplaner nginx`
4. Test API health: `curl https://yourdomain.com/api/health`
