#!/bin/bash
set -e

# Pre-installation script for LDAP Gateway

echo "Preparing to install LDAP Gateway..."

# Create ldap-gateway user and group if they don't exist
if ! id "ldap-gateway" &>/dev/null; then
    echo "Creating ldap-gateway user..."
    useradd --system --home-dir /opt/ldap-gateway --shell /bin/false \
            --comment "LDAP Gateway Service User" ldap-gateway
fi

# Stop the service if it's running (upgrade scenario)
if systemctl is-active --quiet ldap-gateway 2>/dev/null; then
    echo "Stopping existing LDAP Gateway service..."
    systemctl stop ldap-gateway || true
fi

exit 0