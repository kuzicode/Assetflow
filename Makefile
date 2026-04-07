.PHONY: dev dev-server dev-client build build-server build-client test test-watch start docker-build docker-up docker-down clean install

# Install all dependencies
install:
	npm install
	cd server && npm install

# Development — start both servers
dev:
	@echo "Starting backend and frontend dev servers..."
	@make dev-server & make dev-client

dev-server:
	cd server && npm run dev

dev-client:
	npm run dev

# Build
build: build-client build-server

build-server:
	cd server && npm run build

build-client:
	npm run build
	rm -rf client && cp -R dist client

# Test
test:
	cd server && npm test

test-watch:
	cd server && npm run test:watch

# Lint
lint:
	npm run lint

# Production (local, no Docker)
start: build
	NODE_ENV=production node server/dist/index.js

# Docker
docker-build:
	docker build -t assetflow .

docker-up:
	docker compose up -d

docker-down:
	docker compose down


# Clean build artifacts
clean:
	rm -rf dist server/dist client
