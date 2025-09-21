#!/bin/bash
set -e

# Post-installation script for LDAP Gateway

echo "Configuring LDAP Gateway..."

# Set proper ownership for application files
chown -R ldap-gateway:ldap-gateway /opt/ldap-gateway
chown -R ldap-gateway:ldap-gateway /var/log/ldap-gateway
chown -R ldap-gateway:ldap-gateway /var/run/ldap-gateway
chown -R ldap-gateway:ldap-gateway /etc/ldap-gateway

# Set proper permissions
chmod +x /opt/ldap-gateway/ldap-gateway
chmod 0700 /etc/ldap-gateway/certs

# Create configuration file if it doesn't exist
if [ ! -f /etc/ldap-gateway/.env ]; then
    echo "Creating default configuration file..."
    cp /etc/ldap-gateway/.env.example /etc/ldap-gateway/.env
    echo ""
    echo "🔧 Configuration file created at /etc/ldap-gateway/.env"
    echo "   Please edit this file before starting the service."
fi

# Reload systemd and enable the service
systemctl daemon-reload

# Don't start automatically on install - let user configure first
echo ""
echo "✅ LDAP Gateway installed successfully!"
echo ""
echo "Next steps:"
echo "1. Edit the configuration: sudo nano /etc/ldap-gateway/.env"
echo "2. Enable the service: sudo systemctl enable ldap-gateway"
echo "3. Start the service: sudo systemctl start ldap-gateway"
echo "4. Check status: sudo systemctl status ldap-gateway"
echo ""
echo "Documentation: https://github.com/mieweb/LDAPServer"

exit 0