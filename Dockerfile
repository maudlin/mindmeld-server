# syntax=docker/dockerfile:1

FROM node:18-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev || npm ci
COPY src ./src
COPY docs ./docs
COPY design ./design
EXPOSE 3001
CMD ["npm", "start"]

