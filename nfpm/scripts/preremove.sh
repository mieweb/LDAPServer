#!/bin/bash
set -e

# Pre-removal script for LDAP Gateway

echo "Preparing to remove LDAP Gateway..."

# Stop and disable the service
if systemctl is-active --quiet ldap-gateway 2>/dev/null; then
    echo "Stopping LDAP Gateway service..."
    systemctl stop ldap-gateway || true
fi

if systemctl is-enabled --quiet ldap-gateway 2>/dev/null; then
    echo "Disabling LDAP Gateway service..."
    systemctl disable ldap-gateway || true
fi

exit 0