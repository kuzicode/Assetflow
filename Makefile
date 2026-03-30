.PHONY: dev dev-server dev-client build build-server build-client test test-watch start docker-build docker-up docker-down clean install db-pull

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
	cp server/src/db/schema.sql server/dist/db/schema.sql

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

# Sync DB from production server (safe online backup, does not require stopping the server)
# Usage: make db-pull  (or make db-pull REMOTE=other-ssh-alias)
REMOTE ?= xw
REMOTE_DB := /root/cook/Assetflow/server/data/assetflow.db
LOCAL_DB  := server/data/assetflow.db

db-pull:
	@echo "Backing up remote DB via SQLite online backup..."
	ssh $(REMOTE) "sqlite3 $(REMOTE_DB) '.backup /tmp/assetflow_pull.db'"
	@echo "Downloading to $(LOCAL_DB)..."
	scp $(REMOTE):/tmp/assetflow_pull.db $(LOCAL_DB)
	ssh $(REMOTE) "rm /tmp/assetflow_pull.db"
	@echo "Done. Local DB updated from $(REMOTE):$(REMOTE_DB)"

# Clean build artifacts
clean:
	rm -rf dist server/dist client
