# ---- Stage 1: Build/Install ----
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the source
COPY . .

# ---- Stage 2: Run ----
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy installed deps and app source from build stage
COPY --from=build /app ./

# Create a non-root user for better security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

# Your actual entry file is src/server.js, not server.js
CMD ["node", "src/server.js"]