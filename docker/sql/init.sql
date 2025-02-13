CREATE DATABASE IF NOT EXISTS ldap_user_db;
USE ldap_user_db;

-- Create users table with salt and hashed password
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(128) NOT NULL,
  salt VARCHAR(50) NOT NULL,
  full_name VARCHAR(100),
  email VARCHAR(100),
  uid_number INT UNIQUE,
  gid_number INT,
  home_directory VARCHAR(200),
  appId VARCHAR(100) NULL UNIQUE
);

-- Example users (manual hash for simplicity in init script - password is ann for all users)
INSERT INTO users (username, password, salt, full_name, email, uid_number, gid_number, home_directory)
VALUES
  ('ann', '21c4474515c9869005f9de3f75c083eaf092bd9f8d5461c7c617f88a3fa32253e2abfbeda31a80b34fa38e374e4602d8b04db55f6e52e84c4bcf59fe9a585eb1', '09c3b732633eb3e92fd05b4dadf50254', 'Ann', 'ann@mieweb.com', 1001, 1001, '/home/ann'),
  ('abrol', '21c4474515c9869005f9de3f75c083eaf092bd9f8d5461c7c617f88a3fa32253e2abfbeda31a80b34fa38e374e4602d8b04db55f6e52e84c4bcf59fe9a585eb1', '09c3b732633eb3e92fd05b4dadf50254', 'Abrol', 'abrol@mieweb.com', 1002, 1002, '/home/abrol');
