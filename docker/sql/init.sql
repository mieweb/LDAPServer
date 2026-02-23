-- Create the database
CREATE DATABASE IF NOT EXISTS ldap_user_db;
USE ldap_user_db;

-- 1. Create groups table first with member_uids as JSON
CREATE TABLE IF NOT EXISTS `groups` (
  gid_number INT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(200),
  member_uids JSON NOT NULL DEFAULT (JSON_ARRAY())
);

-- 2. Insert primary groups FIRST
INSERT INTO `groups` (gid_number, name, description, member_uids) VALUES
  (1001, 'ann_primary', 'Primary group for Ann', JSON_ARRAY('ann')),
  (1002, 'abrol_primary', 'Primary group for Abrol', JSON_ARRAY('abrol')),
  (1003, 'evan_primary', 'Primary group for Evan', JSON_ARRAY('evan')),
  (1004, 'hrits_primary', 'Primary group for Hrits', JSON_ARRAY('hrits')),
  (1005, 'chris_primary', 'Primary group for Chris', JSON_ARRAY('chris'));

-- 3. Create users table with foreign key (password removed)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(100),
  email VARCHAR(100),
  uid_number INT UNIQUE,
  gid_number INT,
  home_directory VARCHAR(200),
  auth_backends VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (gid_number) REFERENCES `groups`(gid_number)
);

-- 4. Now insert users (gid_number matches existing groups)
-- Passwords are bcrypt-hashed: ann=maya, abrol=abrol, evan=evan, hrits=maya, chris=chris
INSERT INTO users (username, password, full_name, email, uid_number, gid_number, home_directory) VALUES
  ('ann', '$2b$10$cA9hzCdUMRdyCW/Q7uXJVuPhVeWsyPgt0iMovTobGEBEeJz0B9EVy', 'Ann', 'ann@mieweb.com', 1001, 1001, '/home/ann'),
  ('abrol','$2b$10$gS9ofBYeNBq/OBSHwfZFoehE5v6HcDn1n7ttHORNTMRupFqHyHJt6', 'Abrol', 'abrol@mieweb.com', 1002, 1002, '/home/abrol'),
  ('evan', '$2b$10$4jU4zFDYpBvKw1tqWh32c.6FZ5/dVzob7oOh.CxD3meFrUgHdTuAS', 'Evan Pant', 'evan@mieweb.com', 1003, 1003, '/home/evan'),
  ('hrits', '$2b$10$QG9DsntCbOa/.eSOXseEIeIhVSi7sPIUcpx/teHN95GIELCQMbl1S','Hrits Pant', 'hrits@mieweb.com', 1004, 1004, '/home/hrits'),
  ('chris', '$2b$10$fyBG6ofzr1yAJN9s3j1Jx.v0/JYuNLepnyaHKgYA4Fvf8EYJsEkP.','Chris Evans', 'chris@mieweb.com', 1005, 1005, '/home/chris');

-- 5. Add secondary groups
INSERT INTO `groups` (gid_number, name, description, member_uids) VALUES
  (5000, 'developers', 'Development team', JSON_ARRAY('ann', 'evan')),
  (5001, 'sysadmins', 'System administrators', JSON_ARRAY('abrol', 'hrits', 'chris')),
  (5002, 'devops', 'DevOps team', JSON_ARRAY('ann', 'hrits'));

-- 6. Link users to secondary groups
CREATE TABLE IF NOT EXISTS user_groups (
  user_id INT,
  group_id INT,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES `groups`(gid_number) ON DELETE CASCADE
);

INSERT INTO user_groups (user_id, group_id)
VALUES
  ((SELECT id FROM users WHERE username = 'ann'), 5000),
  ((SELECT id FROM users WHERE username = 'ann'), 5002),
  ((SELECT id FROM users WHERE username = 'abrol'), 5001),
  ((SELECT id FROM users WHERE username = 'evan'), 5000),
  ((SELECT id FROM users WHERE username = 'hrits'), 5001),
  ((SELECT id FROM users WHERE username = 'hrits'), 5002),
  ((SELECT id FROM users WHERE username = 'chris'), 5001);
