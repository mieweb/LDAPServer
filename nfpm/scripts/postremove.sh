#!/bin/bash
set -e

# Post-removal script for LDAP Gateway

echo "Cleaning up LDAP Gateway..."

# Reload systemd daemon
systemctl daemon-reload

# Note: We intentionally keep the user, logs, and configuration
# This allows for easier reinstallation and preserves data

echo ""
echo "🗑️  LDAP Gateway removed successfully!"
echo ""
echo "Note: Configuration files, logs, and the ldap-gateway user have been preserved."
echo "To completely remove all data:"
echo "  sudo rm -rf /etc/ldap-gateway"
echo "  sudo rm -rf /var/log/ldap-gateway"
echo "  sudo userdel ldap-gateway"

exit 0