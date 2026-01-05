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

# Function to execute commands via SSH (tests actual SSH authentication)
function ssh_cmd() {
  local cmd="$1"
  # Use sshpass inside the container to authenticate, then run command via SSH
  docker compose exec -T sssd-client bash -c "sshpass -p 'password123' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p 2222 testuser@localhost '$cmd'" 2>/dev/null
}

# Function to run direct commands in container (for setup/debugging)
function container_exec() {
  local cmd="$1"
  docker compose exec -T sssd-client bash -c "$cmd"
}

echo "Running assertions..."

# Test 1: SSH Authentication + whoami
echo "Test 1: SSH authentication and whoami..."
WHOAMI=$(ssh_cmd "whoami" || echo "FAIL")
echo "  Result: $WHOAMI"
[[ "$WHOAMI" == "testuser" ]] || { echo "FAIL: SSH auth failed or whoami=$WHOAMI"; exit 1; }
echo "  ✓ SSH authentication successful"

# Test 2: id command via SSH
echo "Test 2: User ID information via SSH..."
ID_OUTPUT=$(ssh_cmd "id")
echo "  Result: $ID_OUTPUT"
echo "$ID_OUTPUT" | grep -q "uid=10100" || { echo "FAIL: id missing uid=10100"; exit 1; }
echo "$ID_OUTPUT" | grep -q "gid=20100" || { echo "FAIL: id missing gid=20100"; exit 1; }
echo "  ✓ Correct UID and GID"

# Test 3: groups command via SSH
echo "Test 3: Group membership via SSH..."
GROUPS_OUTPUT=$(ssh_cmd "groups")
echo "  Result: $GROUPS_OUTPUT"
echo "$GROUPS_OUTPUT" | grep -q "developers" || { echo "FAIL: groups missing developers"; exit 1; }
echo "$GROUPS_OUTPUT" | grep -q "devops" || { echo "FAIL: groups missing devops"; exit 1; }
echo "  ✓ Correct group memberships"

# Test 4: getent passwd (run in container, not via SSH)
echo "Test 4: User directory lookup via getent..."
GETENT_OUTPUT=$(container_exec "getent passwd testuser")
echo "  Result: $GETENT_OUTPUT"
echo "$GETENT_OUTPUT" | grep -q ":/home/testuser:" || { echo "FAIL: getent missing homeDirectory"; exit 1; }
echo "$GETENT_OUTPUT" | grep -q ":/bin/bash" || { echo "FAIL: getent missing loginShell"; exit 1; }
echo "  ✓ Correct home directory and shell"

# Test 5: Failed authentication
echo "Test 5: Invalid password rejection..."
FAIL_OUTPUT=$(docker compose exec -T sssd-client bash -c "sshpass -p 'wrongpassword' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -p 2222 testuser@localhost 'whoami'" 2>&1 || echo "EXPECTED_FAILURE")
if echo "$FAIL_OUTPUT" | grep -q "EXPECTED_FAILURE\|Permission denied\|Authentication failed"; then
  echo "  ✓ Invalid password correctly rejected"
else
  echo "FAIL: Invalid password was accepted: $FAIL_OUTPUT"
  exit 1
fi

echo ""
echo "=========================================="
echo "All SSH integration tests passed! ✓"
echo "=========================================="
