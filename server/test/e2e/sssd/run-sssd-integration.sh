#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

cleanup() {
  docker compose down -v || true
}
trap cleanup EXIT

echo "Bringing up SSSD integration stack..."
docker compose up -d --build

echo "Waiting for services to start (30s)..."
sleep 30

# Simple function to run SSH commands directly in sssd-client container
function ssh_exec() {
  local cmd="$1"
  docker compose exec -T sssd-client bash -c "$cmd"
}

echo "Running assertions..."

# Test 1: whoami
WHOAMI=$(ssh_exec "su - testuser -c 'whoami'" 2>/dev/null || echo "")
echo "whoami: $WHOAMI"
[[ "$WHOAMI" == "testuser" ]] || { echo "FAIL: whoami=$WHOAMI"; exit 1; }

# Test 2: id command
ID_OUTPUT=$(ssh_exec "su - testuser -c 'id'")
echo "id: $ID_OUTPUT"
echo "$ID_OUTPUT" | grep -q "uid=10100" || { echo "FAIL: id missing uid=10100"; exit 1; }
echo "$ID_OUTPUT" | grep -q "gid=20100" || { echo "FAIL: id missing gid=20100"; exit 1; }

# Test 3: groups command
GROUPS_OUTPUT=$(ssh_exec "su - testuser -c 'groups'")
echo "groups: $GROUPS_OUTPUT"
echo "$GROUPS_OUTPUT" | grep -q "developers" || { echo "FAIL: groups missing developers"; exit 1; }
echo "$GROUPS_OUTPUT" | grep -q "devops" || { echo "FAIL: groups missing devops"; exit 1; }

# Test 4: getent passwd
GETENT_OUTPUT=$(ssh_exec "getent passwd testuser")
echo "getent passwd: $GETENT_OUTPUT"
echo "$GETENT_OUTPUT" | grep -q ":/home/testuser:" || { echo "FAIL: getent missing homeDirectory"; exit 1; }
echo "$GETENT_OUTPUT" | grep -q ":/bin/bash" || { echo "FAIL: getent missing loginShell"; exit 1; }

echo "All assertions passed."
