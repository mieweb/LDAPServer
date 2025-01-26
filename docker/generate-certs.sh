#!/bin/sh
set -e

# Print current working directory and volume mount point
echo "Current Working Directory: $(pwd)"
echo "Listing current directory contents:"
ls -la

# Ensure /certificates directory exists
mkdir -p /certificates

# Verbose certificate generation with extensive logging
echo "Generating CA Key..."
openssl genrsa -out /certificates/ca-key.pem 2048

echo "Generating CA Certificate..."
openssl req -x509 -new -nodes -key /certificates/ca-key.pem -sha256 -days 365 -out /certificates/ca-cert.pem -subj "/C=US/ST=Indiana/L=Fort Wayne/O=MIE/CN=MIEWebCA"

echo "Generating Server Key..."
openssl genrsa -out /certificates/server-key.pem 2048

echo "Creating Server CSR Configuration..."
cat > /certificates/server-ext.cnf <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ldap-server
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

echo "Generating Server CSR..."
openssl req -new -key /certificates/server-key.pem -out /certificates/server.csr -subj "/C=US/ST=Indiana/L=Fort Wayne/O=MIE/CN=ldap-server"

echo "Generating Server Certificate..."
openssl x509 -req -in /certificates/server.csr -CA /certificates/ca-cert.pem -CAkey /certificates/ca-key.pem -CAcreateserial -out /certificates/server-cert.pem -days 365 -sha256 -extfile /certificates/server-ext.cnf

# Comprehensive file listing with details
echo "Generated Certificate Files:"
ls -l /certificates

# Verify file contents are not empty
echo "Verifying file contents:"
for file in /certificates/*.pem; do
    echo "$file size:"
    wc -c "$file"
done