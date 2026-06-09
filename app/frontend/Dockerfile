# ─────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files first (layer caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the frontend source
COPY . .

# Build the production bundle
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Serve with Nginx (unprivileged - no high/critical CVEs)
# ─────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:alpine-slim AS production

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]