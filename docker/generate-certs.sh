#!/bin/sh

# Ensure the certs directory exists
mkdir -p /certs

# Generate CA key and certificate
openssl genrsa -out /certs/ca-key.pem 2048
openssl req -new -x509 -days 365 \
    -key /certs/ca-key.pem \
    -sha256 \
    -out /certs/ca-cert.pem \
    -subj "/C=US/ST=Indiana/L=Fort Wayne/O=MIE/CN=MIE CA"

# Generate server key
openssl genrsa -out /certs/server-key.pem 2048

# Create server certificate signing request
openssl req -new \
    -key /certs/server-key.pem \
    -out /certs/server.csr \
    -subj "/C=US/ST=Indiana/L=Fort Wayne/O=MIE/CN=ldap-server"

# Create an extension file for the server certificate
cat > /certs/server-ext.cnf << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = app
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

# Sign the server certificate
openssl x509 -req \
    -in /certs/server.csr \
    -CA /certs/ca-cert.pem \
    -CAkey /certs/ca-key.pem \
    -CAcreateserial \
    -out /certs/server-cert.pem \
    -days 365 \
    -sha256 \
    -extfile /certs/server-ext.cnf

# Set appropriate permissions
chmod 644 /certs/*.pem
chmod 600 /certs/server-key.pem

# List the generated certificates
ls -l /certs