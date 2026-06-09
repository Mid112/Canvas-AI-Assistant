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
# Stage 2: Serve with Nginx
# ─────────────────────────────────────────────
FROM nginx:alpine AS production

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config (we'll create this next)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]