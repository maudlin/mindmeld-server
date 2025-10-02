# MindMeld Server - Docker Quick Start 🐳

Get MindMeld Server running in seconds with Docker!

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) (included with Docker Desktop)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/mindmeld-server.git
cd mindmeld-server
```

### 2. Start the server

```bash
docker-compose up -d
```

That's it! The server is now running at **http://localhost:3001**

### 3. Verify it's running

```bash
# Check health
curl http://localhost:3001/health

# View logs
docker-compose logs -f
```

### 4. Stop the server

```bash
docker-compose down
```

## Configuration

### Option 1: Environment File (Recommended)

Create a `.env` file in the project root:

```bash
# .env
CORS_ORIGIN=http://localhost:8080
LOG_LEVEL=info
FEATURE_MAPS_API=true
FEATURE_MCP=false
SERVER_SYNC=off
```

### Option 2: Docker Compose Override

Create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  mindmeld:
    environment:
      - CORS_ORIGIN=http://your-custom-origin.com
      - LOG_LEVEL=debug
      - SERVER_SYNC=on
      - DATA_PROVIDER=yjs
```

### Option 3: Command Line

```bash
CORS_ORIGIN=http://localhost:3000 docker-compose up -d
```

## Common Use Cases

### Development with Hot Reload

For active development, you might want to run outside Docker and just use it for deployment.

### Production Deployment

```bash
# Build and run in production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Enable Real-time Collaboration

Edit `docker-compose.yml` or create `.env`:

```bash
SERVER_SYNC=on
DATA_PROVIDER=yjs
```

Then restart:

```bash
docker-compose restart
```

### Custom Port

```bash
# Edit docker-compose.yml ports section:
ports:
  - "8080:3001"  # Maps container port 3001 to host port 8080
```

## Data Persistence

Your data is stored in the `./data` directory on your host machine and automatically persisted across container restarts.

**Location:** `./data/db.sqlite`

### Backup Your Data

```bash
# Simple backup
cp -r ./data ./data-backup-$(date +%Y%m%d)

# Or use tar
tar -czf mindmeld-backup-$(date +%Y%m%d).tar.gz ./data
```

### Restore Data

```bash
# Stop the server
docker-compose down

# Restore data
cp -r ./data-backup-20251002 ./data

# Start the server
docker-compose up -d
```

## Troubleshooting

### Check Logs

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View last 100 lines
docker-compose logs --tail=100
```

### Container Not Starting

```bash
# Check container status
docker-compose ps

# Inspect container
docker inspect mindmeld-server

# Check resource usage
docker stats mindmeld-server
```

### Permission Issues

If you see permission errors with the data directory:

```bash
# On Linux/Mac, fix permissions
sudo chown -R $(id -u):$(id -g) ./data

# Or run with user override
docker-compose run --user $(id -u):$(id -g) mindmeld
```

### Port Already in Use

If port 3001 is already in use:

```bash
# Change the port in docker-compose.yml
ports:
  - "3002:3001"  # Use port 3002 instead
```

### Rebuild After Code Changes

```bash
# Rebuild the image
docker-compose build

# Or rebuild and restart
docker-compose up -d --build
```

## Advanced Usage

### Access Container Shell

```bash
# Open shell in running container
docker-compose exec mindmeld sh

# Or start a new container with shell
docker-compose run --rm mindmeld sh
```

### Run Admin Commands

```bash
# Database backup
docker-compose exec mindmeld npm run db:backup

# View server config
docker-compose exec mindmeld npm run debug:config

# Export data
docker-compose exec mindmeld npm run data:export
```

### Resource Limits

Add to `docker-compose.yml`:

```yaml
services:
  mindmeld:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          memory: 256M
```

### Multi-Container Setup

Run multiple instances:

```yaml
# docker-compose.yml
services:
  mindmeld-dev:
    build: .
    ports:
      - '3001:3001'
    volumes:
      - ./data-dev:/app/data

  mindmeld-staging:
    build: .
    ports:
      - '3002:3001'
    volumes:
      - ./data-staging:/app/data
    environment:
      - NODE_ENV=production
```

## Docker Hub (Coming Soon)

Once published to Docker Hub, you can run without building:

```bash
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  mindmeld/server:latest
```

## Next Steps

- 📚 Read the [full documentation](README.md)
- 🌐 Check [Client Integration Guide](docs/client-integration.md)
- 🤖 Setup [MCP Integration](docs/mcp-client-integration.md)
- 🔧 Explore [Admin Tools](docs/server-admin.md)

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/yourusername/mindmeld-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/mindmeld-server/discussions)
- **Documentation**: [docs/](docs/)

---

**Happy mind mapping! 🧠✨**
