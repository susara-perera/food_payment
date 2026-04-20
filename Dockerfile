# ---- Build Stage ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ---- Production Stage ----
FROM node:18-alpine

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Remove dev files
RUN rm -rf tests .env.example

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8084

ENV NODE_ENV=production
ENV PORT=8084

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8084/health || exit 1

CMD ["node", "src/server.js"]
