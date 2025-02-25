-- Create the database
CREATE DATABASE IF NOT EXISTS ldap_user_db;
USE ldap_user_db;

-- 1. Create groups table first (with backticks)
CREATE TABLE IF NOT EXISTS `groups` (
  gid INT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(200)
);

-- 2. Insert primary groups FIRST
INSERT INTO `groups` (gid, name, description) VALUES
  (1001, 'ann_primary', 'Primary group for Ann'),
  (1002, 'abrol_primary', 'Primary group for Abrol');

-- 3. Create users table with foreign key
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(128) NOT NULL,
  salt VARCHAR(50) NOT NULL,
  full_name VARCHAR(100),
  email VARCHAR(100),
  uid_number INT UNIQUE,
  gid_number INT,
  home_directory VARCHAR(200),
  appId VARCHAR(100) NULL UNIQUE,
  FOREIGN KEY (gid_number) REFERENCES `groups`(gid)
);

-- 4. Now insert users (gid_number matches existing groups)
INSERT INTO users (username, password, salt, full_name, email, uid_number, gid_number, home_directory) VALUES
  ('ann', '21c4474515c9869005f9de3f75c083eaf092bd9f8d5461c7c617f88a3fa32253e2abfbeda31a80b34fa38e374e4602d8b04db55f6e52e84c4bcf59fe9a585eb1', '09c3b732633eb3e92fd05b4dadf50254', 'Ann', 'ann@mieweb.com', 1001, 1001, '/home/ann'),
  ('abrol', '21c4474515c9869005f9de3f75c083eaf092bd9f8d5461c7c617f88a3fa32253e2abfbeda31a80b34fa38e374e4602d8b04db55f6e52e84c4bcf59fe9a585eb1', '09c3b732633eb3e92fd05b4dadf50254', 'Abrol', 'abrol@mieweb.com', 1002, 1002, '/home/abrol');

-- 5. Add secondary groups
INSERT INTO `groups` (gid, name, description) VALUES
  (5000, 'developers', 'Development team'),
  (5001, 'sysadmins', 'System administrators'),
  (5002, 'devops', 'DevOps team');

-- 6. Link users to secondary groups
CREATE TABLE IF NOT EXISTS user_groups (
  user_id INT,
  group_id INT,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES `groups`(gid) ON DELETE CASCADE
);

INSERT INTO user_groups (user_id, group_id)
VALUES
  ((SELECT id FROM users WHERE username = 'ann'), 5000),
  ((SELECT id FROM users WHERE username = 'ann'), 5002),
  ((SELECT id FROM users WHERE username = 'abrol'), 5001);


-- Add member_uids column to groups table
ALTER TABLE `groups`
ADD COLUMN member_uids JSON NOT NULL DEFAULT (JSON_ARRAY());

-- Update existing groups
UPDATE `groups` SET member_uids = JSON_ARRAY('ann') WHERE name = 'developers';
UPDATE `groups` SET member_uids = JSON_ARRAY('ann') WHERE name = 'devops';
UPDATE `groups` SET member_uids = JSON_ARRAY('abrol') WHERE name = 'sysadmins';