CREATE TABLE IF NOT EXISTS user_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    sn VARCHAR(255),
    uid INT,
    gid INT,
    home_directory VARCHAR(255),
    shell VARCHAR(255)
);

INSERT INTO user_details (user_name, password, sn, uid, gid, home_directory, shell)
VALUES 
('testuser', 'password123', 'Test User', 1000, 1000, '/home/testuser', '/bin/bash');