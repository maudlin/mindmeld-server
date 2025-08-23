# syntax=docker/dockerfile:1

FROM node:18-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
ENV SQLITE_FILE=/app/data/db.sqlite

# Install curl for healthchecks
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev || npm ci

COPY src ./src
COPY docs ./docs
COPY design ./design

# Create non-root user (node exists) and data dir
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3001/health || exit 1

CMD ["npm", "start"]

