-- E2E SSSD Test Data for SQL Backend
-- This file contains test data specifically for SSSD end-to-end tests
-- Database: testdb, user: testuser/testpass

CREATE DATABASE IF NOT EXISTS testdb;
USE testdb;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uid VARCHAR(64) NOT NULL UNIQUE,
  cn VARCHAR(128) NOT NULL,
  sn VARCHAR(128) NOT NULL,
  mail VARCHAR(128),
  userPassword VARCHAR(256),
  uidNumber INT NOT NULL,
  gidNumber INT NOT NULL,
  homeDirectory VARCHAR(256) NOT NULL,
  loginShell VARCHAR(64) NOT NULL DEFAULT '/bin/bash'
);

CREATE TABLE IF NOT EXISTS `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cn VARCHAR(128) NOT NULL UNIQUE,
  gidNumber INT NOT NULL,
  member_uids JSON NOT NULL
);

-- Test user for SSSD authentication
-- Password: 'password' (bcrypt hashed)
INSERT INTO users (uid, cn, sn, mail, userPassword, uidNumber, gidNumber, homeDirectory)
VALUES
  ('testuser', 'Test User', 'User', 'testuser@example.com', '$2b$10$HV4N7iwiJsiyERmTieP69.wm./j0esYrr3XdJ1Q2QFqFC0qmhy65q', 10100, 20100, '/home/testuser');

-- Test groups with testuser as member
INSERT INTO `groups` (cn, gidNumber, member_uids)
VALUES
  ('developers', 20100, JSON_ARRAY('testuser')),
  ('devops', 20101, JSON_ARRAY('testuser'));
