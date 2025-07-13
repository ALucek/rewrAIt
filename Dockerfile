# ---------- Build stage ----------
FROM node:20-alpine AS build
RUN apk update && apk upgrade --no-cache
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .
# Build frontend from client directory via npm script (vite reads root)
RUN npm run build

# ---------- Production stage ----------
FROM node:20-alpine
RUN apk update && apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production

# Copy production artefacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package*.json ./

# Install only production deps
RUN npm install --omit=dev \
    && apk add --no-cache curl \
    # Create non-root user for running the Node app
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

# Drop root privileges
USER appuser

HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "server/index.js"] 