#!/bin/bash

# Start Docker containers
echo "Starting Docker containers..."
cd docker
docker compose up --build -d mysql client
cd ..

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd src
npm install

# Run the Node.js server locally
echo "Starting Node.js server..."
npm start