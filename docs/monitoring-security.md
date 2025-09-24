# Monitoring and Security

This document covers the runtime monitoring endpoints and security features in MindMeld Server. It complements the [Server Administration Guide](server-admin.md) and [Health Checks](health-checks.md) documentation with specific details about runtime monitoring endpoints, their security, and production configuration.

## Security Overview

MindMeld Server implements IP-based access control for monitoring endpoints to prevent information disclosure to unauthorized users. While the admin commands in the [Server Administration Guide](server-admin.md) provide comprehensive maintenance tools, these runtime endpoints offer lightweight real-time monitoring.

### Security Levels

1. **Public Endpoints** (`/health`)
   - Basic health status only
   - Blocked for obviously external IPs in production
   - Allows internal networks (127.x, 10.x, 172.x, 192.168.x)

2. **Restricted Endpoints** (`/health/deep`, `/metrics`)
   - Detailed system information
   - IP whitelist based (localhost + configured hosts)
   - Returns 404 for unauthorized IPs (prevents information disclosure)

## Configuration

### Environment Variables

```bash
# Allow specific IPs to access detailed monitoring endpoints
MONITORING_HOSTS=10.0.1.100,192.168.1.50,monitoring.company.com

# Enable production security mode
NODE_ENV=production
```

### Default Allowed IPs

These IPs are always allowed for monitoring endpoints:

- `127.0.0.1` (IPv4 localhost)
- `::1` (IPv6 localhost)
- `localhost` (hostname)
- `::ffff:127.0.0.1` (IPv4-mapped IPv6 localhost)

## Runtime Monitoring Endpoints

> **Note:** For comprehensive server management and diagnostics, see the `npm run server:*` commands in the [Server Administration Guide](server-admin.md).

These HTTP endpoints provide real-time monitoring without requiring command-line access:

### 1. Basic Health Check

**Endpoint:** `GET /health`

**Access:** Internal networks + configured hosts (production mode)

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-09-24T16:30:00.000Z",
  "uptime": 3600
}
```

> **Integration Note:** Use this endpoint for load balancer health checks and basic uptime monitoring.

### 2. Detailed Health Check

**Endpoint:** `GET /health/deep`

**Access:** Localhost + `MONITORING_HOSTS` only

> **Equivalent Command:** Similar to `npm run server:health:deep` but accessible via HTTP

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-09-24T16:30:00.000Z",
  "uptime": 3600,
  "components": {
    "yjsService": {
      "status": "healthy",
      "details": {
        "documentsLoaded": 5,
        "clientsConnected": 12,
        "persistenceHealthy": true,
        "memoryConsistency": true
      },
      "timestamp": "2025-09-24T16:30:00.000Z"
    },
    "database": {
      "status": "healthy",
      "details": {
        "type": "sqlite",
        "accessible": true
      },
      "timestamp": "2025-09-24T16:30:00.000Z"
    },
    "memory": {
      "status": "healthy",
      "details": {
        "heapUsed": 245,
        "heapTotal": 512,
        "external": 89
      },
      "timestamp": "2025-09-24T16:30:00.000Z"
    }
  },
  "summary": {
    "totalComponents": 3,
    "healthyComponents": 3
  }
}
```

### 3. Metrics

**Endpoint:** `GET /metrics`

**Access:** Localhost + `MONITORING_HOSTS` only

> **Equivalent Command:** Similar to `npm run server:metrics` but accessible via HTTP

**Response:**

```json
{
  "metrics": {
    "uptime_seconds": 3600,
    "memory_heap_used_bytes": 256901120,
    "memory_heap_total_bytes": 536870912,
    "memory_external_bytes": 93581312,
    "yjs_documents_active": 5,
    "yjs_connections_active": 12,
    "yjs_documents_with_clients": 4,
    "yjs_average_connections_per_document": 3.0,
    "metrics_timestamp": "2025-09-24T16:30:00.000Z",
    "metrics_version": "1.0"
  },
  "timestamp": "2025-09-24T16:30:00.000Z",
  "format": "json",
  "help": {
    "uptime_seconds": "Server uptime in seconds",
    "memory_heap_used_bytes": "Node.js heap memory used in bytes",
    "yjs_documents_active": "Number of active Y.js documents in memory",
    "yjs_connections_active": "Number of active WebSocket connections"
  }
}
```

## Security Features

### IP-Based Access Control

The monitoring middleware performs the following checks:

1. **Extract Client IP** - Handles proxy headers (`X-Forwarded-For`, `X-Real-IP`)
2. **Check Against Whitelist** - Compares against localhost variants + configured hosts
3. **IPv6 Support** - Handles IPv4-mapped IPv6 addresses
4. **Audit Logging** - Logs denied access attempts

### Information Disclosure Prevention

- **Generic 404 Response** - Unauthorized requests get "Not Found" instead of "Forbidden"
- **Limited Error Details** - Error messages don't reveal system internals
- **Truncated IDs** - Map IDs and client IDs are truncated in logs (security by obscurity)
- **No Sensitive Data** - Metrics don't include user content or sensitive configuration

### Rate Limiting

Standard rate limiting applies to all endpoints including monitoring endpoints.

## Production Deployment

### Docker

```yaml
# docker-compose.yml
services:
  mindmeld-server:
    image: mindmeld-server
    environment:
      - NODE_ENV=production
      - MONITORING_HOSTS=10.0.1.100,monitoring.company.com
    networks:
      - internal
```

### Kubernetes

```yaml
# ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: mindmeld-config
data:
  NODE_ENV: 'production'
  MONITORING_HOSTS: '10.244.0.0/16,monitoring.company.com'
```

### Load Balancer Configuration

```nginx
# nginx.conf
location /health {
    # Allow health checks from load balancer
    allow 127.0.0.1;
    allow 10.0.0.0/8;
    deny all;

    proxy_pass http://mindmeld-backend;
}

location /health/deep {
    # Restrict detailed health checks
    allow 127.0.0.1;
    allow 10.0.1.100;  # Monitoring server
    deny all;

    proxy_pass http://mindmeld-backend;
}
```

## Testing Access Control

### Test Allowed Access

```bash
# From localhost (should work)
curl http://127.0.0.1:3001/health/deep

# From configured monitoring host
curl -H "X-Real-IP: 10.0.1.100" http://localhost:3001/metrics
```

### Test Denied Access

```bash
# From external IP (should return 404)
curl -H "X-Forwarded-For: 203.0.113.1" http://localhost:3001/metrics
# Expected: {"error": "Not Found", "message": "The requested resource was not found"}
```

## Observability

### Log Monitoring

Monitor these log entries for security events:

```json
// Denied access attempt
{
  "level": "warn",
  "msg": "Monitoring endpoint access denied",
  "endpoint": "/metrics",
  "clientIP": "203.0.113.1",
  "userAgent": "curl/7.68.0"
}

// Successful access
{
  "level": "debug",
  "msg": "Monitoring endpoint access granted",
  "endpoint": "/health/deep",
  "clientIP": "127.0.0.1"
}
```

### Alerting

Set up alerts on:

- Repeated access denied attempts from same IP
- Health check failures (`status !== "healthy"`)
- Memory warnings (`memory.status === "warning"`)
- WebSocket connection drops

## Troubleshooting

### Common Issues

1. **404 on monitoring endpoints**
   - Check `MONITORING_HOSTS` environment variable
   - Verify client IP is in allowed list
   - Check proxy headers are being set correctly

2. **Health checks always show "disabled"**
   - Ensure `SERVER_SYNC=on` to enable Y.js service
   - Check Y.js service initialization in logs

3. **Memory warnings**
   - Current threshold is 500MB heap usage
   - Adjust threshold in `src/core/api-routes.js` if needed

### Debug Commands

```bash
# Check current allowed hosts
node -e "console.log(require('./src/core/monitoring-security').getAllowedMonitoringHosts())"

# Test IP extraction
node -e "
const req = {headers: {'x-forwarded-for': '203.0.113.1,127.0.0.1'}};
console.log(require('./src/core/monitoring-security').getClientIP(req));
"
```
