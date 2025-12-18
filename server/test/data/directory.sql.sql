-- SQL Test Data for Directory Tests
-- This file contains user and group data for SQL backend directory tests

DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
    uid_number INT PRIMARY KEY NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    gid_number INT NOT NULL,
    full_name VARCHAR(255),
    surname VARCHAR(255),
    given_name VARCHAR(255),
    mail VARCHAR(255),
    home_directory VARCHAR(255),
    login_shell VARCHAR(255),
    enabled BOOLEAN DEFAULT TRUE
);

DROP TABLE IF EXISTS groups;
CREATE TABLE IF NOT EXISTS groups (
    gid_number INT PRIMARY KEY NOT NULL,
    cn VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    member_uids JSON
);

-- Insert users
INSERT INTO users (uid_number, username, gid_number, full_name, surname, given_name, mail, home_directory, login_shell, enabled) VALUES
(1001, 'testuser', 1001, 'Test User', 'User', 'Test', 'testuser@example.com', '/home/testuser', '/bin/bash', TRUE),
(1000, 'admin', 1000, 'Administrator', 'Admin', 'Admin', 'admin@example.com', '/home/admin', '/bin/bash', TRUE),
(1002, 'jdoe', 1001, 'John Doe', 'Doe', 'John', 'jdoe@example.com', '/home/jdoe', '/bin/bash', TRUE),
(1003, 'disabled', 1001, 'Disabled User', 'User', 'Disabled', 'disabled@example.com', '/home/disabled', '/bin/bash', FALSE);

-- Insert groups with JSON arrays for member_uids
INSERT INTO groups (gid_number, cn, description, member_uids) VALUES
(1001, 'users', 'Standard users group', JSON_ARRAY('testuser', 'jdoe', 'disabled')),
(1000, 'admins', 'System administrators', JSON_ARRAY('admin')),
(1002, 'developers', 'Development team', JSON_ARRAY('testuser', 'jdoe')),
(1003, 'empty', 'Empty group for testing', JSON_ARRAY());
