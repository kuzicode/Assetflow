# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:22-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ .
RUN npm run build
# Copy schema.sql to dist (tsc does not copy non-ts files)
RUN cp src/db/schema.sql dist/db/schema.sql

# Stage 3: Production runtime
FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Copy backend compiled output + production deps
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev
WORKDIR /app

COPY --from=backend-build /app/server/dist ./server/dist
COPY --from=frontend-build /app/dist ./client

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Data directory for SQLite persistence
VOLUME ["/app/server/data"]

CMD ["node", "server/dist/index.js"]
