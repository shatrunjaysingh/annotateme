# AnnotateMe — Deployment Guide

## Architecture

```
Internet
   │
   ▼ :80 / :443
┌──────────────────────────────────────────────────┐
│  Nginx  (reverse proxy, rate limiting, gzip)     │
└──────┬───────────────────────────────────────────┘
       │
       ├──► React Frontend (static files served by Nginx)
       │
       ├──► /api/*  ──► Backend Node.js :3000
       │                    │
       │                    ├──► PostgreSQL :5432  (annotations, users, projects)
       │                    ├──► Redis :6379       (sessions / caching)
       │                    └──► MinIO :9000       (uploaded images / videos)
       │
       ├──► /grafana/*  ──► Grafana :3000          (analytics dashboard)
       │
       └──► /uploads/*  ──► uploaded files (volume-mounted)
```

All services run as Docker containers on a single host. For higher load, the backend can be horizontally scaled.

---

## Table of Contents

1. [Server Requirements](#1-server-requirements)
2. [Provision a Cloud Server](#2-provision-a-cloud-server)
3. [Point Your Domain to the Server](#3-point-your-domain-to-the-server)
4. [Prepare the Server](#4-prepare-the-server)
5. [Deploy the Application](#5-deploy-the-application)
6. [Configure the Environment](#6-configure-the-environment)
7. [Set Up SSL / HTTPS](#7-set-up-ssl--https)
8. [First-Time Setup](#8-first-time-setup)
9. [Email / Password Reset](#9-email--password-reset)
10. [Grafana Analytics](#10-grafana-analytics)
11. [Verify Everything Works](#11-verify-everything-works)
12. [Backups](#12-backups)
13. [Monitoring & Logs](#13-monitoring--logs)
14. [Updates](#14-updates)
15. [Scaling](#15-scaling)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 100 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Network | 100 Mbps | 1 Gbps |

**Cloud equivalents:**

| Provider | Instance |
|----------|---------|
| AWS | t3.large (2 vCPU / 8 GB) or t3.xlarge (4 vCPU / 16 GB) |
| DigitalOcean | Basic Droplet — 4 GB / 2 vCPU ($24/mo) or 8 GB / 4 vCPU ($48/mo) |
| GCP | n2-standard-2 or n2-standard-4 |
| Azure | Standard_D2s_v3 or Standard_D4s_v3 |
| Hetzner | CPX21 (3 vCPU / 4 GB, very cost-effective) |

---

## 2. Provision a Cloud Server

### Option A — DigitalOcean (simplest)

1. Log in at [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Click **Create → Droplets**
3. Choose:
   - **Region**: closest to your users
   - **Image**: Ubuntu 22.04 LTS x64
   - **Plan**: Basic → Regular → **4 GB / 2 vCPU** ($24/mo) or larger
   - **Authentication**: SSH Key (recommended) — paste your public key  
     `cat ~/.ssh/id_rsa.pub`
4. Click **Create Droplet**
5. Note the public IP address shown after creation

**Open firewall ports (Droplet → Networking → Firewall):**

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS |

### Option B — AWS EC2

1. Go to **EC2 → Launch Instance**
2. Choose **Ubuntu Server 22.04 LTS (HVM)**
3. Select **t3.large** (or t3.xlarge)
4. Configure storage: **40 GB gp3 SSD** (increase as needed)
5. **Security Group** — add inbound rules:
   - SSH (22) from your IP
   - HTTP (80) from anywhere (0.0.0.0/0)
   - HTTPS (443) from anywhere (0.0.0.0/0)
6. Launch with a key pair you have access to
7. Note the **Public IPv4 address** or **Elastic IP**

> **Tip**: Allocate an Elastic IP and associate it with the instance so the IP doesn't change on restart.

### Option C — Any VPS / Cloud VM

Any Ubuntu 22.04 server works. Open ports 22, 80, and 443 in the provider's firewall panel before proceeding.

---

## 3. Point Your Domain to the Server

In your domain registrar's DNS panel (e.g. Cloudflare, Route 53, GoDaddy):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `<your-server-IP>` | 300 |
| A | `www` | `<your-server-IP>` | 300 |

Wait 5–30 minutes for DNS to propagate. Verify with:

```bash
dig enhancebiz.ai +short
# should return your server IP
```

> Replace `enhancebiz.ai` with your actual domain throughout this guide.

---

## 4. Prepare the Server

SSH into the server:

```bash
ssh root@<your-server-IP>
# or if using a non-root user:
# ssh ubuntu@<your-server-IP>
```

### 4.1 Update the system

```bash
apt update && apt upgrade -y
```

### 4.2 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to the docker group (skip if you're root)
usermod -aG docker $USER

# Start Docker and enable on boot
systemctl enable docker
systemctl start docker

# Verify
docker --version
```

### 4.3 Install Docker Compose v2

Docker Compose v2 is included with Docker Desktop and modern Docker Engine. Verify:

```bash
docker compose version
# Should show: Docker Compose version v2.x.x
```

If missing:

```bash
apt install docker-compose-plugin -y
```

### 4.4 Create a deployment user (optional but recommended)

```bash
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
# Copy SSH keys
cp -r /root/.ssh /home/deploy/.ssh
chown -R deploy:deploy /home/deploy/.ssh
```

### 4.5 Configure the firewall (UFW)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

---

## 5. Deploy the Application

### 5.1 Clone the repository

```bash
cd /opt
git clone https://github.com/shatrunjaysingh/annotateme.git
cd annotateme
```

### 5.2 Create the environment file

```bash
cp .env.example .env
nano .env
```

Fill in all required values — see the next section for what each setting does.

---

## 6. Configure the Environment

Edit `/opt/annotateme/.env`. This is the **only file you need to change** for a standard deployment.

```bash
# ===========================
# REQUIRED — change these
# ===========================

# Your domain name (no http:// prefix, no trailing slash)
# Leave blank to use localhost (local dev only)
APP_DOMAIN=enhancebiz.ai

# Database — use a strong password
DB_USER=annotateme
DB_PASSWORD=<strong-random-password>
DB_NAME=annotateme

# JWT signing secret — minimum 32 characters, fully random
# Generate one: openssl rand -hex 32
JWT_SECRET=<paste-openssl-output-here>

# MinIO object storage — used for uploaded images/videos
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<strong-random-password>

# ===========================
# OPTIONAL
# ===========================

# Email — for password reset emails
# Leave blank to use dev mode (reset link shown on screen)
SMTP_HOST=smtp.gmail.com          # or smtp.sendgrid.net, mail.yourdomain.com, etc.
SMTP_PORT=587
SMTP_SECURE=false                 # true for port 465
SMTP_USER=you@gmail.com
SMTP_PASS=<app-password>          # Gmail: use an App Password, not your account password
SMTP_FROM=noreply@enhancebiz.ai

# Grafana dashboard credentials
GRAFANA_USER=admin
GRAFANA_PASSWORD=<strong-password>
```

### Generating secrets

```bash
# Generate JWT_SECRET
openssl rand -hex 32

# Generate strong passwords
openssl rand -base64 24
```

### What APP_DOMAIN controls

Setting `APP_DOMAIN=enhancebiz.ai` automatically configures:

- **Nginx** `server_name enhancebiz.ai;`
- **Password reset links** → `https://enhancebiz.ai/reset-password?token=…`
- **Grafana** root URL → `https://enhancebiz.ai/grafana/`
- **CORS** → allows `https://enhancebiz.ai`

---

## 7. Set Up SSL / HTTPS

SSL is handled by **Certbot** running on the host (not inside Docker). Nginx inside Docker listens on port 80; Certbot creates a second Nginx on the host that handles 443 and proxies to Docker's port 80. The simpler approach below uses the host's nginx as an SSL terminator.

### 7.1 Install Certbot

```bash
apt install certbot python3-certbot-nginx -y
```

### 7.2 Install host-level Nginx (SSL terminator only)

```bash
apt install nginx -y
```

Create `/etc/nginx/sites-available/annotateme`:

```nginx
server {
    listen 80;
    server_name enhancebiz.ai www.enhancebiz.ai;

    # Let Certbot handle ACME challenges
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name enhancebiz.ai www.enhancebiz.ai;

    ssl_certificate     /etc/letsencrypt/live/enhancebiz.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/enhancebiz.ai/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    client_max_body_size 500M;

    # Forward everything to Docker's Nginx on port 80
    location / {
        proxy_pass         http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        $connection_upgrade;
        proxy_read_timeout 300s;
    }
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

```bash
ln -s /etc/nginx/sites-available/annotateme /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

> **Note**: Docker's Nginx must listen on port 80, not 443. The host Nginx listens on 443 and proxies inward. Make sure Docker's port mapping is `"80:80"` (not `"443:443"`).

### 7.3 Obtain the SSL certificate

```bash
certbot --nginx -d enhancebiz.ai -d www.enhancebiz.ai
```

Follow the prompts — certbot will automatically edit your nginx config and reload it.

### 7.4 Auto-renew

Certbot installs a cron/systemd timer automatically. Test it:

```bash
certbot renew --dry-run
```

---

## 8. First-Time Setup

### 8.1 Start all services

```bash
cd /opt/annotateme

# Production mode (with resource limits and 2 backend replicas)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check all services started cleanly
docker compose ps
```

Expected output — all services should show `running` or `healthy`:

```
NAME                   STATUS          PORTS
annotateme_db          healthy         5432/tcp
annotateme_redis       healthy         6379/tcp
annotateme_minio       running         9000/tcp, 9001/tcp
annotateme_backend     running         3000/tcp
annotateme_frontend    running         80/tcp
annotateme_grafana     running         3000/tcp
annotateme_nginx       running         0.0.0.0:80->80/tcp
```

### 8.2 Create your admin account

Open `https://enhancebiz.ai` in a browser and register the first account, then promote it to admin:

```bash
docker exec annotateme_db psql -U annotateme -d annotateme \
  -c "UPDATE users SET role='admin' WHERE email='you@yourdomain.com';"
```

Log out and back in — you will now see the Admin panel and Supervisor links in the navigation.

### 8.3 (Optional) Seed demo data

```bash
# Only run this on a fresh database — it creates sample projects and jobs
docker exec annotateme_backend sh -c "cd /app && node dist/seeds/seed.js"
```

---

## 9. Email / Password Reset

If you configured SMTP in `.env`, password reset emails are sent automatically when a user clicks **Forgot password?** on the login screen.

### Using Gmail

1. Enable 2-Factor Authentication on your Google account
2. Go to **Google Account → Security → App passwords**
3. Create an App Password for "Mail"
4. Use that 16-character password as `SMTP_PASS` (not your Gmail password)

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx    # 16-char app password, spaces optional
SMTP_FROM=noreply@enhancebiz.ai
```

### Using SendGrid

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.<your-sendgrid-api-key>
SMTP_FROM=noreply@enhancebiz.ai
```

### Dev / No SMTP

Leave `SMTP_HOST` blank. The reset link is returned in the API response and shown on the "Forgot password" page — useful for development or admin-assisted resets.

---

## 10. Grafana Analytics

Grafana is available at `https://enhancebiz.ai/grafana/` after deployment.

### Default credentials

```
Username: admin   (or GRAFANA_USER from .env)
Password: admin   (or GRAFANA_PASSWORD from .env)
```

Change the password immediately after first login: **Profile → Change Password**.

### Pre-built dashboard

A dashboard is automatically provisioned at startup with:
- Total projects, tasks, jobs, annotations
- Job status breakdown (new / in progress / completed / rejected)
- Annotation activity over time
- Top annotators
- Per-project progress

The dashboard is at: **Dashboards → AnnotateMe Analytics**

### Accessing the database in Grafana

The PostgreSQL datasource is auto-configured. You can add custom panels by going to **Explore** and writing SQL queries directly against the `annotateme` database.

---

## 11. Verify Everything Works

Run through this checklist after deployment:

```bash
# 1. Backend health
curl https://enhancebiz.ai/health
# Expected: {"status":"ok","timestamp":"..."}

# 2. Database
docker exec annotateme_db pg_isready -U annotateme
# Expected: /var/run/postgresql:5432 - accepting connections

# 3. Redis
docker exec annotateme_redis redis-cli ping
# Expected: PONG

# 4. All containers healthy
docker compose ps
```

**Browser checks:**

| URL | Expected |
|-----|----------|
| `https://enhancebiz.ai` | Login page loads |
| `https://enhancebiz.ai/health` | `{"status":"ok"}` |
| `https://enhancebiz.ai/grafana/` | Grafana login page |
| `https://www.enhancebiz.ai` | Redirects to non-www (or same page) |

**Feature checks:**

- [ ] Register an account, log in
- [ ] Create a project, upload an image, open the annotation editor
- [ ] Draw a bounding box and save
- [ ] Go to Annotations page — job appears in the tree
- [ ] Click "View JSON" — annotation data appears
- [ ] Click "Forgot password?" — enter email, click reset link
- [ ] Grafana dashboard loads with data

---

## 12. Backups

### Automated daily backup script

Create `/opt/annotateme/backup.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR=/opt/backups/annotateme
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# PostgreSQL dump
docker exec annotateme_db pg_dump -U annotateme annotateme \
  | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Uploads volume
docker run --rm \
  -v annotateme_uploads_data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/uploads_$DATE.tar.gz" /data

# Keep only last 14 days
find "$BACKUP_DIR" -name "*.gz" -mtime +14 -delete

echo "Backup complete: $BACKUP_DIR"
```

```bash
chmod +x /opt/annotateme/backup.sh

# Schedule daily at 2 AM
crontab -e
# Add:
# 0 2 * * * /opt/annotateme/backup.sh >> /var/log/annotateme-backup.log 2>&1
```

### Restore from backup

```bash
# Restore database
gunzip < /opt/backups/annotateme/db_20260508_020000.sql.gz \
  | docker exec -i annotateme_db psql -U annotateme annotateme

# Restore uploads
docker run --rm \
  -v annotateme_uploads_data:/data \
  -v /opt/backups/annotateme:/backup \
  alpine tar xzf /backup/uploads_20260508_020000.tar.gz -C /
```

---

## 13. Monitoring & Logs

### View live logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail=100 backend
```

### Disk usage

```bash
# Check disk space
df -h

# Docker volumes
docker system df

# Which volume is largest
du -sh /var/lib/docker/volumes/*
```

### Resource usage

```bash
# Live stats for all containers
docker stats

# One-time snapshot
docker stats --no-stream
```

### Set up log rotation

Docker's json-file logging is already configured with rotation in `docker-compose.prod.yml` (10 MB max, 5 files for backend; 5 MB max, 3 files for nginx).

---

## 14. Updates

```bash
cd /opt/annotateme

# Pull latest code
git pull origin master

# Rebuild and restart with zero-downtime (rolling restart)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Database schema changes are applied automatically on startup (synchronize: true)

# Verify update
docker compose ps
curl https://enhancebiz.ai/health
```

> If something breaks after an update, roll back:
> ```bash
> git log --oneline -10      # find the previous commit hash
> git checkout <hash>
> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
> ```

---

## 15. Scaling

### Scale backend horizontally

The backend is stateless (sessions via JWT). Scale to more replicas when you have more than ~50 concurrent annotators:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --scale backend=4
```

Nginx `least_conn` load balancing distributes traffic automatically across all replicas.

### Larger uploads / storage

MinIO stores uploads by default. For larger datasets, configure AWS S3 instead:

```bash
# In .env:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
```

When these variables are set the backend automatically uses S3 instead of MinIO.

### Database connection pooling

For more than ~200 concurrent users, add PgBouncer in `docker-compose.yml`:

```yaml
pgbouncer:
  image: edoburu/pgbouncer
  environment:
    DB_HOST: postgres
    DB_USER: ${DB_USER:-annotateme}
    DB_PASSWORD: ${DB_PASSWORD:-annotateme}
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 500
    DEFAULT_POOL_SIZE: 25
  networks:
    - annotateme
```

Then change the backend's `DB_HOST` to `pgbouncer`.

---

## 16. Troubleshooting

### A container won't start

```bash
# See why it failed
docker compose logs <service-name>

# e.g.
docker compose logs backend
```

### "Connection refused" to the database

```bash
# Check postgres is healthy
docker compose ps postgres

# Restart it
docker compose restart postgres

# Wait for healthy then restart backend
docker compose restart backend
```

### Frontend shows blank page or 502

```bash
# Check nginx logs
docker compose logs nginx

# Check backend is running
docker compose logs backend

# Rebuild frontend
docker compose build frontend
docker compose up -d frontend
```

### SSL certificate errors

```bash
# Check certificate is valid
certbot certificates

# Force renewal
certbot renew --force-renewal

# Reload host nginx
systemctl reload nginx
```

### Disk full

```bash
# Check what's using space
df -h
du -sh /opt/annotateme/uploads 2>/dev/null
docker system df

# Remove unused Docker images/containers
docker system prune -f

# Remove old backups
find /opt/backups -mtime +14 -delete
```

### Reset everything (⚠️ deletes all data)

```bash
cd /opt/annotateme
docker compose down -v          # stops all containers and removes volumes
docker compose up -d --build    # fresh start
```

---

## Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `APP_DOMAIN` | Recommended | Domain name (e.g. `enhancebiz.ai`). Leave blank for localhost. | *(blank)* |
| `DB_USER` | Yes | PostgreSQL username | `annotateme` |
| `DB_PASSWORD` | Yes | PostgreSQL password — **change this** | `annotateme` |
| `DB_NAME` | Yes | Database name | `annotateme` |
| `JWT_SECRET` | Yes | JWT signing key (min 32 chars) — **change this** | — |
| `MINIO_ROOT_USER` | Yes | MinIO admin username | `minioadmin` |
| `MINIO_ROOT_PASSWORD` | Yes | MinIO admin password — **change this** | `minioadmin` |
| `REDIS_URL` | No | Redis connection string | `redis://redis:6379` |
| `ALLOWED_ORIGINS` | No | CORS origins (comma-separated). Auto-set from `APP_DOMAIN`. | `http://localhost:4200` |
| `SMTP_HOST` | No | SMTP server for password reset emails | *(blank = dev mode)* |
| `SMTP_PORT` | No | SMTP port | `587` |
| `SMTP_SECURE` | No | Use TLS (`true` for port 465) | `false` |
| `SMTP_USER` | No | SMTP username | — |
| `SMTP_PASS` | No | SMTP password | — |
| `SMTP_FROM` | No | From address for emails | `noreply@annotateme.com` |
| `GRAFANA_USER` | No | Grafana admin username | `admin` |
| `GRAFANA_PASSWORD` | No | Grafana admin password | `admin` |
| `NODE_ENV` | No | `production` or `development` | `development` |
| `PORT` | No | Backend port | `3000` |
| `UPLOAD_DIR` | No | Local upload directory | `./uploads` |
| `AWS_ACCESS_KEY_ID` | No | AWS key — enables S3 instead of MinIO | — |
| `AWS_SECRET_ACCESS_KEY` | No | AWS secret | — |
| `AWS_S3_BUCKET` | No | S3 bucket name | — |
| `AWS_REGION` | No | AWS region | `us-east-1` |
