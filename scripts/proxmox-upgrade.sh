#!/bin/bash
# proxmox-upgrade.sh — Upgrade ldap-gateway on a Proxmox LXC container
#
# Usage:
#   ldap-gateway-upgrade              # upgrade to latest stable release
#   ldap-gateway-upgrade --dev        # upgrade to latest dev build
#   ldap-gateway-upgrade v1.2.0       # upgrade to a specific version
#
# Install this script on your Proxmox container:
#   sudo cp scripts/proxmox-upgrade.sh /usr/local/bin/ldap-gateway-upgrade
#   sudo chmod +x /usr/local/bin/ldap-gateway-upgrade

set -euo pipefail

# Must run as root for dpkg/apt-get
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root (use sudo)." >&2
  exit 1
fi

REPO="mieweb/LDAPServer"
# Detect architecture dynamically so we download the correct .deb on amd64 and arm64
DETECTED_ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
case "$DETECTED_ARCH" in
  amd64|arm64)
    ARCH="$DETECTED_ARCH"
    ;;
  *)
    echo "WARNING: Unsupported architecture '$DETECTED_ARCH'; defaulting to amd64 package." >&2
    ARCH="amd64"
    ;;
esac
DEV_MODE=false
TMP_DIR=$(mktemp -d)

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# --- Parse arguments ----------------------------------------------------------

if [ "${1:-}" = "--dev" ] || [ "${1:-}" = "-d" ]; then
  DEV_MODE=true
  shift
fi

# --- Determine version -------------------------------------------------------

if [ "$DEV_MODE" = true ]; then
  TAG="dev-latest"
  VERSION="dev-latest"
  echo "Fetching latest dev build..."

  # Find the .deb filename from the dev-latest release assets
  DEB_FILE=$(curl -sS "https://api.github.com/repos/${REPO}/releases/tags/dev-latest" \
    | grep -o "\"name\": *\"dev-ldap-gateway_[^\"]*_${ARCH}\\.deb\"" \
    | head -1 | cut -d'"' -f4)

  if [ -z "$DEB_FILE" ]; then
    echo "ERROR: Could not find dev .deb asset. Has the dev CI pipeline run?" >&2
    exit 1
  fi

elif [ -n "${1:-}" ]; then
  VERSION="$1"
  TAG="$VERSION"
  [[ "$TAG" != v* ]] && TAG="v$TAG"
  VERSION="${TAG#v}"
else
  echo "Fetching latest stable release from GitHub..."
  TAG=$(curl -sS "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -1 | cut -d'"' -f4)

  if [ -z "$TAG" ]; then
    echo "ERROR: Could not determine latest release. Check network or GitHub API limits." >&2
    exit 1
  fi
  VERSION="${TAG#v}"
fi

# --- Show current vs target --------------------------------------------------

CURRENT=$(dpkg-query -W -f='${Version}' ldap-gateway 2>/dev/null || echo "not installed")
echo ""
echo "  Current version : ${CURRENT}"
if [ "$DEV_MODE" = true ]; then
  echo "  Target          : dev-latest (rolling dev build)"
else
  echo "  Target version  : ${VERSION} (${TAG})"
fi
echo ""

if [ "$DEV_MODE" = false ] && [ "$CURRENT" = "$VERSION" ]; then
  echo "Already at version ${VERSION}. Pass a different version to upgrade."
  exit 0
fi

# --- Download .deb ------------------------------------------------------------

if [ "$DEV_MODE" = true ]; then
  DEB_URL="https://github.com/${REPO}/releases/download/dev-latest/${DEB_FILE}"
else
  DEB_FILE="ldap-gateway_${VERSION}_${ARCH}.deb"
  DEB_URL="https://github.com/${REPO}/releases/download/${TAG}/${DEB_FILE}"
fi

echo "Downloading ${DEB_FILE}..."
if ! curl -fSL -o "${TMP_DIR}/${DEB_FILE}" "$DEB_URL"; then
  echo "ERROR: Failed to download ${DEB_URL}" >&2
  echo "Check that the release and architecture exist." >&2
  exit 1
fi

# --- Verify checksum (optional) -----------------------------------------------

CHECKSUM_TAG="${TAG}"
[ "$DEV_MODE" = true ] && CHECKSUM_TAG="dev-latest"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/${CHECKSUM_TAG}/checksums.txt"
if curl -fsSL -o "${TMP_DIR}/checksums.txt" "$CHECKSUM_URL" 2>/dev/null; then
  echo "Verifying checksum..."
  cd "$TMP_DIR"
  if grep -q "$DEB_FILE" checksums.txt; then
    if grep "$DEB_FILE" checksums.txt | sha256sum -c --status 2>/dev/null; then
      echo "  Checksum OK"
    else
      echo "ERROR: Checksum verification FAILED for ${DEB_FILE}. Aborting." >&2
      exit 1
    fi
  else
    echo "  WARNING: No checksum entry found for ${DEB_FILE}. Skipping verification."
  fi
  cd - >/dev/null
fi

# --- Install ------------------------------------------------------------------

echo "Installing ${DEB_FILE}..."
if ! apt-get install -y --no-install-recommends "${TMP_DIR}/${DEB_FILE}"; then
  echo "ERROR: Failed to install ${DEB_FILE}. See apt-get output above for details." >&2
  exit 1
fi

# --- Verify -------------------------------------------------------------------

NEW_VERSION=$(dpkg-query -W -f='${Version}' ldap-gateway 2>/dev/null || echo "unknown")
echo ""
echo "Upgrade complete!"
echo "  Installed version : ${NEW_VERSION}"
echo ""

# Show service status
if systemctl is-active --quiet ldap-gateway 2>/dev/null; then
  echo "  Service status: running"
else
  echo "  Service status: NOT running"
  echo "  Start with: systemctl start ldap-gateway"
fi

echo ""
echo "  View logs  : journalctl -fu ldap-gateway"
echo "  Edit config: nano /etc/default/ldap-gateway"
