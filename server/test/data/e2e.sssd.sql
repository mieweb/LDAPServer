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
  loginShell VARCHAR(64) NOT NULL DEFAULT '/bin/bash',
  sshpublickey TEXT
);

CREATE TABLE IF NOT EXISTS `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cn VARCHAR(128) NOT NULL UNIQUE,
  gidNumber INT NOT NULL,
  member_uids JSON NOT NULL
);

-- Test user for SSSD authentication
-- Password: 'password123' (bcrypt hashed with 10 rounds)
-- Pre-hashed because this SQL is loaded directly by MySQL, not processed by Node.js
-- Hash generated with: bcrypt.hash('password123', 10)
INSERT INTO users (uid, cn, sn, mail, userPassword, uidNumber, gidNumber, homeDirectory, sshpublickey)
VALUES
  ('testuser', 'Test User', 'User', 'testuser@example.com', '$2b$10$DJylnYTJZBhXqzYDV62nTOCW3/6ytjmXITpGo.tSqR5eCppmERflS', 10100, 20100, '/home/testuser', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKogUL8oT4Sn4+V2zBa4Jtis4CIryh+igq2PTCoYXSw4 testuser@e2e-test'),
  ('nokeyuser', 'NoKey User', 'NoKey', 'nokeyuser@example.com', '$2b$10$DJylnYTJZBhXqzYDV62nTOCW3/6ytjmXITpGo.tSqR5eCppmERflS', 10101, 20100, '/home/nokeyuser', NULL);

-- Test groups with testuser as member
INSERT INTO `groups` (cn, gidNumber, member_uids)
VALUES
  ('developers', 20100, JSON_ARRAY('testuser', 'nokeyuser')),
  ('devops', 20101, JSON_ARRAY('testuser'));
