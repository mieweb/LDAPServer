#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"

echo "Starting MySQL for integration tests..."
docker compose -f docker-compose.mysql.yml up -d

echo "Waiting for MySQL to be healthy..."
ATTEMPTS=0
until docker compose -f docker-compose.mysql.yml ps | grep -q "healthy"; do
  ATTEMPTS=$((ATTEMPTS+1))
  if [[ $ATTEMPTS -gt 60 ]]; then echo "MySQL did not become healthy in time"; exit 1; fi
  sleep 1
done

export RUN_DB_TESTS=1
export SQL_URI="mysql://testuser:testpass@127.0.0.1:23306/testdb"

# Provider queries mapping
export SQL_QUERY_ONE_USER='SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?'
export SQL_QUERY_ALL_USERS='SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users'
export SQL_QUERY_ALL_GROUPS='SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`'
export SQL_QUERY_GROUPS_BY_MEMBER='SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE JSON_CONTAINS(member_uids, JSON_QUOTE(?), "$")'

echo "Running MySQL integration tests..."
cd "$HERE/../../.." # server/test/integration/sql -> server
RUN_DB_TESTS=1 SQL_URI="$SQL_URI" \
SQL_QUERY_ONE_USER="$SQL_QUERY_ONE_USER" \
SQL_QUERY_ALL_USERS="$SQL_QUERY_ALL_USERS" \
SQL_QUERY_ALL_GROUPS="$SQL_QUERY_ALL_GROUPS" \
SQL_QUERY_GROUPS_BY_MEMBER="$SQL_QUERY_GROUPS_BY_MEMBER" \
npm test -- test/integration/auth/mysql.auth.test.js test/integration/directory/mysql.directory.test.js --runInBand

cd "$HERE"

echo "Stopping MySQL..."
docker compose -f docker-compose.mysql.yml down -v
