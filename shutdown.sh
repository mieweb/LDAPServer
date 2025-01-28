#!/bin/bash

echo "Stopping Node.js server..."
# Find and kill the Node.js process running on the specified port
PORT=389
PID=$(lsof -t -i:$PORT)

if [ -n "$PID" ]; then
  kill -9 $PID
  echo "Node.js server stopped."
else
  echo "No Node.js server running on port $PORT."
fi

cd docker
echo "Stopping services with Docker Compose..."
docker compose down

echo "Cleaning up Docker networks (optional)..."
# List and remove unused networks
docker network prune -f

echo "All services stopped and cleaned up!"
