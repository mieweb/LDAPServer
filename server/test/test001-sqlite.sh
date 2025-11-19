#!/usr/bin/env bash
  
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

cd "${SERVER_DIR}" || exit 1

echo 'Importing test database...'
sqlite3 test001.sqlite < test/data/directory.sqlite.sql

echo 'Reading environment variables...'
set -a; source test/data/directory.sqlite.env; set +a

echo 'Starting ldap server...'
npm start &
PID=$!

echo 'Waiting for server to start...'
for i in {1..10}; do
  ldapsearch -x -H ldaps://localhost:$PORT -b "$LDAP_BASE_DN" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    break
  fi
  echo 'Waiting 5 seconds for LDAP server to be ready...'
  sleep 5
done

test_search () {
  local filter="$1"
  local expected_count="$2"

  SEARCHOUT="$(ldapsearch -x \
    -H ldaps://localhost:$PORT \
    -b "$LDAP_BASE_DN" \
    "$filter" \
    2>/dev/null
  )"
  if [ $? -ne 0 ]; then
    echo "ldapsearch command failed"
    kill $PID
    wait $PID
    exit 1
  fi

  RC="$(echo "$SEARCHOUT" | grep '^dn: ' | wc -l)"
  if [ "$RC" -ne "$expected_count" ]; then
    echo "$filter returned unexpected number of entries:"
    echo "$SEARCHOUT"
    kill $PID
    wait $PID
    exit 1
  fi
}

echo 'Testing full directory search...'
test_search '' 5

echo 'Testing user search...'
test_search '(uid=alice)' 1

echo 'Testing group search...'
test_search '(objectClass=posixGroup)' 2

echo 'Testing specific group search...'
test_search '(&(objectClass=posixGroup)(cn=ldapusers))' 1

kill $PID
wait $PID
exit 0