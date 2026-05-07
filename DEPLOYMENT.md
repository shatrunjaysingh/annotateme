# AnnotateMe — Deployment Guide

## Architecture

```
Internet ──► Nginx :80 ──┬──► React Frontend (static)
                          │
                          ├──► Backend API :3000 ──► PostgreSQL :5432
                          │         │
                          │         ├──────────────► Redis :6379
                          │         │
                          │         └──────────────► MinIO :9000
                          │
                          └──► /uploads (served directly)
```

---

## Quick Start (Development)

### Prerequisites
- Docker Desktop 24+ or Docker Engine + Docker Compose v2
- 4 GB RAM minimum
- Ports 80, 3000, 4200, 5432, 6379, 9000, 9001 available

### Steps

```bash
# 1. Clone / navigate to project
cd /path/to/AnnotateMe

# 2. Create environment file
cp .env.example .env
# Edit .env with your values (especially passwords and JWT_SECRET)

# 3. Start all services
docker compose up -d --build

# 4. Check services are healthy
docker compose ps

# 5. Access the app
open http://localhost:4200    # Frontend
open http://localhost:3000/health  # Backend health check
open http://localhost:9001    # MinIO Console (minioadmin/minioadmin)
```

### First Login
Register a new account at http://localhost:4200/login — the first registered user can be promoted to admin via the database or by editing the user's role in PostgreSQL.

```bash
# Promote user to admin (replace USER_EMAIL)
docker exec annotateme_db psql -U annotateme -d annotateme \
  -c "UPDATE users SET role='admin' WHERE email='USER_EMAIL';"
```

---

## Development (without Docker)

### Backend

```bash
cd packages/backend

# Install dependencies
npm install

# Start PostgreSQL (or use Docker)
docker run -d --name pg -e POSTGRES_USER=annotateme -e POSTGRES_PASSWORD=annotateme \
  -e POSTGRES_DB=annotateme -p 5432:5432 postgres:15-alpine

# Copy and edit env
cp .env.example .env

# Run in dev mode (hot reload)
npm run dev
# Backend starts at http://localhost:3000
```

### Frontend

```bash
cd packages/frontend

# Install dependencies
npm install

# Run dev server (proxies API to localhost:3000)
npm run dev
# Frontend starts at http://localhost:4200
```

---

## Production Deployment (100 Concurrent Users)

### Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 50 GB SSD | 200 GB SSD |
| Network | 100 Mbps | 1 Gbps |

**AWS**: t3.xlarge (4 vCPU, 16 GB) or c5.xlarge  
**GCP**: n2-standard-4  
**Azure**: Standard_D4s_v3  

### Steps

```bash
# 1. Set up environment
cp .env.example .env
nano .env
# Set strong passwords for DB_PASSWORD, MINIO_ROOT_PASSWORD
# Set a long random JWT_SECRET (min 32 chars)
# Example: openssl rand -hex 32

# 2. Build and start in production mode
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 3. Verify all services running
docker compose ps
docker compose logs --tail=50 backend

# 4. Check health
curl http://localhost/health
```

### Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_USER` | PostgreSQL username | `annotateme` |
| `DB_PASSWORD` | PostgreSQL password | `annotateme` ⚠️ |
| `DB_NAME` | Database name | `annotateme` |
| `JWT_SECRET` | JWT signing key (min 32 chars) | ⚠️ must change |
| `MINIO_ROOT_USER` | MinIO admin username | `minioadmin` |
| `MINIO_ROOT_PASSWORD` | MinIO admin password | `minioadmin` ⚠️ |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `UPLOAD_DIR` | Local upload directory | `./uploads` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `*` |
| `NODE_ENV` | Node environment | `development` |
| `PORT` | Backend port | `3000` |

### SSL / HTTPS Setup

For production, add SSL with Let's Encrypt using Certbot:

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (replace yourdomain.com)
sudo certbot --nginx -d yourdomain.com

# Auto-renew
sudo certbot renew --dry-run
```

Or update `nginx/nginx.conf` to add HTTPS:

```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    # ... rest of config
}
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

## Scaling

### Horizontal Scaling (more than 100 users)

The `docker-compose.prod.yml` runs 2 backend replicas by default. To scale further:

```bash
# Scale to 4 backend instances
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --scale backend=4
```

Nginx `least_conn` load balancing distributes traffic across all instances.

### Database Scaling

For very high load, consider:
1. **Read replicas** — PostgreSQL streaming replication
2. **Connection pooler** — Add PgBouncer in front of PostgreSQL:

```yaml
pgbouncer:
  image: edoburu/pgbouncer
  environment:
    DB_HOST: postgres
    DB_USER: annotateme
    DB_PASSWORD: ${DB_PASSWORD}
    POOL_MODE: transaction
    MAX_CLIENT_CONN: 500
    DEFAULT_POOL_SIZE: 25
```

---

## Monitoring

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f nginx

# Last 100 lines
docker compose logs --tail=100 backend
```

### Health Checks

```bash
# Backend health
curl http://localhost/health
# → {"status":"ok","timestamp":"..."}

# Database
docker exec annotateme_db pg_isready -U annotateme

# Redis
docker exec annotateme_redis redis-cli ping
# → PONG

# All service status
docker compose ps
```

---

## Backup & Restore

### Database Backup

```bash
# Backup
docker exec annotateme_db pg_dump -U annotateme annotateme \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
docker exec -i annotateme_db psql -U annotateme annotateme < backup.sql
```

### Uploaded Files Backup

```bash
# Backup uploads volume
docker run --rm -v annotateme_uploads_data:/data \
  -v $(pwd):/backup ubuntu \
  tar czf /backup/uploads_backup.tar.gz /data
```

---

## Troubleshooting

### Backend fails to start
```bash
docker compose logs backend
# Common: database not ready → add sleep or check healthcheck
# Common: port already in use → change port in .env
```

### Database connection refused
```bash
# Check postgres is healthy
docker compose ps postgres
# Force recreate
docker compose up -d --force-recreate postgres
```

### Files not uploading
```bash
# Check uploads directory permissions
docker exec annotateme_backend ls -la /app/uploads
# Check disk space
df -h
```

### Frontend shows blank page
```bash
# Check nginx logs
docker compose logs nginx
# Rebuild frontend
docker compose build frontend && docker compose up -d frontend
```

### Reset everything
```bash
# ⚠️ This deletes all data
docker compose down -v
docker compose up -d --build
```

---

## Updating

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Database migrations happen automatically on startup (synchronize: true)
```
