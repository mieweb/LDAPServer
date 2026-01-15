#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

echo "Starting MongoDB for integration tests..."
docker compose -f docker-compose.mongodb.yml up -d

echo "Waiting for MongoDB to be healthy..."
ATTEMPTS=0
until docker compose -f docker-compose.mongodb.yml ps | grep -q "healthy"; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 60 ]]; then echo "MongoDB did not become healthy in time"; exit 1; fi
  sleep 1
done

echo "MongoDB is healthy, waiting additional 2 seconds for full readiness..."
sleep 2

export RUN_DB_TESTS=1
export MONGO_TEST_URI="mongodb://127.0.0.1:27017"

echo "Running MongoDB integration tests..."
cd "$HERE/../../.." # server/test/integration/mongodb -> server
RUN_DB_TESTS=1 MONGO_TEST_URI="$MONGO_TEST_URI" \
npm test -- test/integration/auth/mongodb.auth.test.js test/integration/directory/mongodb.directory.test.js --runInBand --forceExit

cd "$HERE"

echo "Stopping MongoDB..."
docker compose -f docker-compose.mongodb.yml down -v
