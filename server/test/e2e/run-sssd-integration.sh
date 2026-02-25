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

echo "Waiting for services to become healthy..."
MAX_ATTEMPTS=5
SLEEP_INTERVAL=6
attempt=1

while [ $attempt -le $MAX_ATTEMPTS ]; do
  echo "  Checking service health (attempt $attempt/$MAX_ATTEMPTS)..."
  
  # Check if all services are healthy
  unhealthy=$(docker compose ps --format json | jq -r 'select(.Health != "healthy") | .Service' 2>/dev/null)
  
  if [ -z "$unhealthy" ]; then
    echo "  ✓ All services are healthy!"
    break
  fi
  
  if [ $attempt -eq $MAX_ATTEMPTS ]; then
    echo "ERROR: Services failed to become healthy after $((MAX_ATTEMPTS * SLEEP_INTERVAL)) seconds"
    echo "Unhealthy services:"
    docker compose ps
    exit 1
  fi
  
  echo "  Waiting for: $unhealthy"
  sleep $SLEEP_INTERVAL
  attempt=$((attempt + 1))
done

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

# Test 6: sss_ssh_authorizedkeys returns SSH public key for testuser
echo "Test 6: sss_ssh_authorizedkeys returns SSH key for testuser..."
SSH_KEY_OUTPUT=$(container_exec "sss_ssh_authorizedkeys testuser" || echo "FAIL")
echo "  Result: $SSH_KEY_OUTPUT"
echo "$SSH_KEY_OUTPUT" | grep -q "ssh-ed25519" || { echo "FAIL: sss_ssh_authorizedkeys did not return SSH key"; exit 1; }
echo "$SSH_KEY_OUTPUT" | grep -q "AAAAC3NzaC1lZDI1NTE5AAAAIKogUL8oT4Sn4+V2zBa4Jtis4CIryh+igq2PTCoYXSw4" || { echo "FAIL: SSH key content mismatch"; exit 1; }
echo "  ✓ SSH public key correctly retrieved via sss_ssh_authorizedkeys"

# Test 7: sss_ssh_authorizedkeys returns empty for user without SSH key
echo "Test 7: sss_ssh_authorizedkeys returns empty for user without SSH key..."
NO_KEY_OUTPUT=$(container_exec "sss_ssh_authorizedkeys nokeyuser" || echo "")
echo "  Result: '${NO_KEY_OUTPUT}'"
if [ -z "$NO_KEY_OUTPUT" ] || ! echo "$NO_KEY_OUTPUT" | grep -q "ssh-"; then
  echo "  ✓ No SSH key returned for user without key"
else
  echo "FAIL: Unexpected SSH key returned for nokeyuser: $NO_KEY_OUTPUT"
  exit 1
fi

# Test 8: SSH key-based authentication
echo "Test 8: SSH public key authentication..."
KEY_AUTH_OUTPUT=$(docker compose exec -T sssd-client bash -c "ssh -i /tmp/testuser_ed25519 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no -p 2222 testuser@localhost 'whoami'" 2>/dev/null || echo "FAIL")
echo "  Result: $KEY_AUTH_OUTPUT"
[[ "$KEY_AUTH_OUTPUT" == "testuser" ]] || { echo "FAIL: SSH key-based auth failed or whoami=$KEY_AUTH_OUTPUT"; exit 1; }
echo "  ✓ SSH public key authentication successful"

echo ""
echo "=========================================="
echo "All SSH integration tests passed! ✓"
echo "  Tests 1-5: Password auth, UID/GID, groups"
echo "  Tests 6-8: SSH key via sss_ssh_authorizedkeys"
echo "=========================================="
