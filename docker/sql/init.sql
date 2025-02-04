CREATE DATABASE IF NOT EXISTS ldap_user_db;
USE ldap_user_db;

-- Users table
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(128) NOT NULL,
  salt VARCHAR(50) NOT NULL,
  full_name VARCHAR(100),
  uid_number INT UNIQUE,
  gid_number INT,
  home_directory VARCHAR(200)
);

-- Renamed groups table to avoid reserved keyword
CREATE TABLE ldap_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(50) UNIQUE NOT NULL,
  gid_number INT UNIQUE NOT NULL,
  member_uids JSON
);

-- Sample data
INSERT INTO users (username, password, salt, full_name, uid_number, gid_number, home_directory)
VALUES
  ('ann', '21c4474515c9869005f9de3f75c083eaf092bd9f8d5461c7c617f88a3fa32253e2abfbeda31a80b34fa38e374e4602d8b04db55f6e52e84c4bcf59fe9a585eb1', '09c3b732633eb3e92fd05b4dadf50254', 'Ann', 1001, 1001, '/home/ann'),
  ('admin', '21c4474515c9869005f9de3f75c083eaf092bd9f8d5461c7c617f88a3fa32253e2abfbeda31a80b34fa38e374e4602d8b04db55f6e52e84c4bcf59fe9a585eb1', '09c3b732633eb3e92fd05b4dadf50254', 'System Administrator', 1000, 0, '/home/admin');


INSERT INTO ldap_groups (group_name, gid_number, member_uids)
VALUES
  ('ann_group', 1001, JSON_ARRAY('ann')),
  ('admin_group', 0, JSON_ARRAY('admin'));