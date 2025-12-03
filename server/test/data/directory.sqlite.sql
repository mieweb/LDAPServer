DROP TABLE IF EXISTS users;
CREATE TABLE users (
    uid_number INTEGER PRIMARY KEY NOT NULL,
    username TEXT UNIQUE NOT NULL,
    gid_number INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    mail TEXT NOT NULL,
    password TEXT NOT NULL
);

DROP TABLE IF EXISTS groups;
CREATE TABLE groups (
    gid_number INTEGER PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL
);

DROP TABLE IF EXISTS user_groups;
CREATE TABLE user_groups (
    uid_number INTEGER NOT NULL,
    gid_number INTEGER NOT NULL,
    FOREIGN KEY (uid_number) REFERENCES users(uid_number),
    FOREIGN KEY (gid_number) REFERENCES groups(gid_number)
);

INSERT INTO groups (gid_number, name) VALUES
(2000, 'sysadmins'),
(2001, 'ldapusers');

INSERT INTO users (uid_number, username, gid_number, full_name, surname, mail, password) VALUES
(2000, 'alice', 2001, 'Alice Smith', 'Smith', 'asmith@example.com', 'alicepass'),
(2001, 'bob', 2001, 'Bob Johnson', 'Johnson', 'bjohnson@example.com', 'bobpass'),
(2002, 'carol', 2001, 'Carol Williams', 'Williams', 'cwilliams@example.com', 'carolpass');

INSERT INTO user_groups (uid_number, gid_number) VALUES
(2000, 2001),
(2001, 2001),
(2002, 2001),
(2000, 2000); -- alice is also a sysadmin