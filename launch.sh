#!/bin/bash

# Start Docker containers
echo "Starting Docker containers..."
cd docker
docker compose up --build -d mysql client
cd ..

# Generate self-signed certificate if it doesn't exist
echo "Checking for SSL certificates..."
CERT_DIR="./certs"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "SSL certificates not found. Generating self-signed certificate..."
    
    # Create certs directory if it doesn't exist
    mkdir -p "$CERT_DIR"
    
    # Generate private key
    openssl genrsa -out "$KEY_FILE" 2048
    
    # Generate self-signed certificate (valid for 365 days)
    openssl req -new -x509 -key "$KEY_FILE" -out "$CERT_FILE" -days 365 -subj "/C=US/ST=State/L=City/O=Organization/OU=OrgUnit/CN=localhost"
    
    echo "Self-signed certificate generated successfully!"
    echo "Certificate: $CERT_FILE"
    echo "Private Key: $KEY_FILE"
else
    echo "SSL certificates already exist."
fi

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd src
npm install

# Set environment variables for SSL certificates if they exist
if [ -f "../$CERT_FILE" ] && [ -f "../$KEY_FILE" ]; then
    echo "Setting SSL certificate environment variables..."
    export LDAP_CERT_CONTENT=$(cat "../$CERT_FILE")
    export LDAP_KEY_CONTENT=$(cat "../$KEY_FILE")
fi

# Run the Node.js server locally
echo "Starting Node.js server..."
npm start