-- SQLite initialization script for LDAP Gateway
-- SQLite automatically creates the database file

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- 1. Create groups table first with member_uids as JSON
CREATE TABLE IF NOT EXISTS groups (
  gid_number INTEGER PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(200),
  member_uids TEXT NOT NULL DEFAULT '[]'
);

-- 2. Insert primary groups FIRST
INSERT OR IGNORE INTO groups (gid_number, name, description, member_uids) VALUES
  (1001, 'ann_primary', 'Primary group for Ann', '["ann"]'),
  (1002, 'abrol_primary', 'Primary group for Abrol', '["abrol"]'),
  (1003, 'evan_primary', 'Primary group for Evan', '["evan"]'),
  (1004, 'hrits_primary', 'Primary group for Hrits', '["hrits"]'),
  (1005, 'chris_primary', 'Primary group for Chris', '["chris"]');

-- 3. Create users table with foreign key
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  password VARCHAR(255) NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(100),
  email VARCHAR(100),
  uid_number INTEGER UNIQUE,
  gid_number INTEGER,
  home_directory VARCHAR(200),
  FOREIGN KEY (gid_number) REFERENCES groups(gid_number)
);

-- 4. Now insert users (gid_number matches existing groups)
INSERT OR IGNORE INTO users (username, password, full_name, email, uid_number, gid_number, home_directory) VALUES
  ('ann', 'maya', 'Ann', 'ann@mieweb.com', 1001, 1001, '/home/ann'),
  ('abrol','abrol', 'Abrol', 'abrol@mieweb.com', 1002, 1002, '/home/abrol'),
  ('evan', 'evan', 'Evan Pant', 'evan@mieweb.com', 1003, 1003, '/home/evan'),
  ('hrits', 'maya','Hrits Pant', 'hrits@mieweb.com', 1004, 1004, '/home/hrits'),
  ('chris', 'chris','Chris Evans', 'chris@mieweb.com', 1005, 1005, '/home/chris');

-- 5. Add secondary groups
INSERT OR IGNORE INTO groups (gid_number, name, description, member_uids) VALUES
  (5000, 'developers', 'Development team', '["ann", "evan"]'),
  (5001, 'sysadmins', 'System administrators', '["abrol", "hrits", "chris"]'),
  (5002, 'devops', 'DevOps team', '["ann", "hrits"]');

-- 6. Link users to secondary groups
CREATE TABLE IF NOT EXISTS user_groups (
  user_id INTEGER,
  group_id INTEGER,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(gid_number) ON DELETE CASCADE
);

INSERT OR IGNORE INTO user_groups (user_id, group_id)
VALUES
  ((SELECT id FROM users WHERE username = 'ann'), 5000),
  ((SELECT id FROM users WHERE username = 'ann'), 5002),
  ((SELECT id FROM users WHERE username = 'abrol'), 5001),
  ((SELECT id FROM users WHERE username = 'evan'), 5000),
  ((SELECT id FROM users WHERE username = 'hrits'), 5001),
  ((SELECT id FROM users WHERE username = 'hrits'), 5002),
  ((SELECT id FROM users WHERE username = 'chris'), 5001);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
