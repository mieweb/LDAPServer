-- Test base schema and data for SSSD integration
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

INSERT INTO users (uid, cn, sn, mail, userPassword, uidNumber, gidNumber, homeDirectory, sshpublickey)
VALUES
  ('testuser', 'Test User', 'User', 'testuser@example.com', '$2b$10$HV4N7iwiJsiyERmTieP69.wm./j0esYrr3XdJ1Q2QFqFC0qmhy65q', 10100, 20100, '/home/testuser', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKogUL8oT4Sn4+V2zBa4Jtis4CIryh+igq2PTCoYXSw4 testuser@e2e-test'),
  ('nokeyuser', 'NoKey User', 'NoKey', 'nokeyuser@example.com', '$2b$10$HV4N7iwiJsiyERmTieP69.wm./j0esYrr3XdJ1Q2QFqFC0qmhy65q', 10101, 20100, '/home/nokeyuser', NULL);

INSERT INTO `groups` (cn, gidNumber, member_uids)
VALUES
  ('developers', 20100, JSON_ARRAY('testuser', 'nokeyuser')),
  ('devops', 20101, JSON_ARRAY('testuser'));
