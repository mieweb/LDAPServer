#!/bin/bash
set -e

# Create release tarball for LDAP Gateway

VERSION=${1:-"1.0.0"}
echo "Creating release tarball for version $VERSION..."

# Clean and build
echo "Building components..."
npm run build -w npm
npm run build -w server

# Create release directory
RELEASE_DIR="ldap-gateway-$VERSION"
mkdir -p releases
rm -rf "releases/$RELEASE_DIR"
mkdir -p "releases/$RELEASE_DIR"

# Copy files for release
echo "Preparing release files..."

# Core package
cp -r npm/dist "releases/$RELEASE_DIR/core"
cp npm/package.json "releases/$RELEASE_DIR/core/"
cp npm/README.md "releases/$RELEASE_DIR/core/"

# Server package  
cp -r server/dist/* "releases/$RELEASE_DIR/"
cp server/.env.example "releases/$RELEASE_DIR/"

# Documentation
cp README.md "releases/$RELEASE_DIR/"
cp LICENSE* "releases/$RELEASE_DIR/" 2>/dev/null || echo "No LICENSE file found"

# Create installation script
cat > "releases/$RELEASE_DIR/install.sh" << 'EOF'
#!/bin/bash
set -e

echo "Installing LDAP Gateway..."

# Default installation directory
INSTALL_DIR="/opt/ldap-gateway"
CONFIG_DIR="/etc/ldap-gateway"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --prefix=*)
      INSTALL_DIR="${1#*=}"
      shift
      ;;
    --config-dir=*)
      CONFIG_DIR="${1#*=}"
      shift
      ;;
    --help)
      echo "Usage: $0 [--prefix=DIR] [--config-dir=DIR]"
      echo "  --prefix=DIR      Installation directory (default: /opt/ldap-gateway)"
      echo "  --config-dir=DIR  Configuration directory (default: /etc/ldap-gateway)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check if running as root for system installation
if [[ "$INSTALL_DIR" == "/opt/"* ]] || [[ "$CONFIG_DIR" == "/etc/"* ]]; then
  if [[ $EUID -ne 0 ]]; then
    echo "System installation requires root privileges. Please run with sudo."
    exit 1
  fi
fi

# Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

# Copy files
echo "Installing to $INSTALL_DIR..."
cp -r * "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/ldap-gateway"

# Install configuration
if [[ ! -f "$CONFIG_DIR/.env" ]]; then
  cp .env.example "$CONFIG_DIR/.env.example"
  echo "Configuration template installed to $CONFIG_DIR/.env.example"
fi

echo ""
echo "✅ LDAP Gateway installed successfully!"
echo ""
echo "Next steps:"
echo "1. Copy config: cp $CONFIG_DIR/.env.example $CONFIG_DIR/.env"
echo "2. Edit config: nano $CONFIG_DIR/.env"
echo "3. Start server: $INSTALL_DIR/ldap-gateway"
EOF

chmod +x "releases/$RELEASE_DIR/install.sh"

# Create tarball
echo "Creating tarball..."
cd releases
tar -czf "ldap-gateway-$VERSION.tar.gz" "$RELEASE_DIR"
cd ..

# Generate checksums
echo "Generating checksums..."
cd releases
sha256sum "ldap-gateway-$VERSION.tar.gz" > "ldap-gateway-$VERSION.tar.gz.sha256"
cd ..

echo ""
echo "✅ Release tarball created:"
echo "   releases/ldap-gateway-$VERSION.tar.gz"
echo "   releases/ldap-gateway-$VERSION.tar.gz.sha256"
echo ""
echo "Upload to GitHub releases and update the Homebrew formula with the new SHA256:"
cat "releases/ldap-gateway-$VERSION.tar.gz.sha256"