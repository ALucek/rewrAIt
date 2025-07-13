# ---------- Build stage ----------
FROM node:20-alpine AS build
RUN apk update && apk upgrade --no-cache
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build the frontend
COPY . .
RUN npm run build

# ---------- Production stage ----------
FROM node:20-alpine
RUN apk update && apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production

# Copy production artefacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/package*.json ./

# Install only production deps
RUN npm install --omit=dev \
    && apk add --no-cache curl

HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "server.js"] 