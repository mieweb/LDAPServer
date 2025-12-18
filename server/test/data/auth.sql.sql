-- SQL Test Data for Authentication Tests
-- This file contains user data with password hashes for SQL backend auth tests

DROP TABLE IF EXISTS users;
CREATE TABLE IF NOT EXISTS users (
    uid_number INT PRIMARY KEY NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    gid_number INT NOT NULL,
    full_name VARCHAR(255),
    surname VARCHAR(255),
    given_name VARCHAR(255),
    mail VARCHAR(255),
    home_directory VARCHAR(255),
    login_shell VARCHAR(255),
    enabled BOOLEAN DEFAULT TRUE
);

-- Test users with bcrypt hashed passwords
-- Note: These passwords should match common.users.json plain text passwords
INSERT INTO users (uid_number, username, password, gid_number, full_name, surname, given_name, mail, home_directory, login_shell, enabled) VALUES
(1001, 'testuser', '$2b$10$KIXxPqH3ql0d.ZJh4S4KkOqEbzJ5z3N3y9F4QqYZJxQlqVVZ5Z5Zy', 1001, 'Test User', 'User', 'Test', 'testuser@example.com', '/home/testuser', '/bin/bash', TRUE),
(1000, 'admin', '$2b$10$RXzVT5K3xPdKqH3ql0d.ZJh4S4KkOqEbzJ5z3N3y9F4QqYZJxQlqV', 1000, 'Administrator', 'Admin', 'Admin', 'admin@example.com', '/home/admin', '/bin/bash', TRUE),
(1002, 'jdoe', '$2b$10$TKIXxPqH3ql0d.ZJh4S4KkOqEbzJ5z3N3y9F4QqYZJxQlqVVZ5Z5', 1001, 'John Doe', 'Doe', 'John', 'jdoe@example.com', '/home/jdoe', '/bin/bash', TRUE),
(1003, 'disabled', '$2b$10$DKIXxPqH3ql0d.ZJh4S4KkOqEbzJ5z3N3y9F4QqYZJxQlqVVZ5Z5', 1001, 'Disabled User', 'User', 'Disabled', 'disabled@example.com', '/home/disabled', '/bin/bash', FALSE);
