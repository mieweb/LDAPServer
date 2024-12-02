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
  home_directory VARCHAR(200)
);

-- Function to generate a random salt
DELIMITER //
CREATE FUNCTION generate_salt() 
RETURNS VARCHAR(50)
BEGIN
  RETURN SUBSTRING(MD5(RAND()), 1, 50);
END //
DELIMITER ;

-- Stored procedure to insert a user with hashed password
DELIMITER //
CREATE PROCEDURE insert_user(
  IN p_username VARCHAR(50),
  IN p_password VARCHAR(50),
  IN p_full_name VARCHAR(100),
  IN p_email VARCHAR(100),
  IN p_uid_number INT,
  IN p_gid_number INT,
  IN p_home_directory VARCHAR(200)
)
BEGIN
  DECLARE v_salt VARCHAR(50);
  DECLARE v_hashed_password VARCHAR(128);
  
  -- Generate salt
  SET v_salt = generate_salt();
  
  -- Hash password with salt using SHA-512
  SET v_hashed_password = CONCAT(
    HEX(
      UNHEX(
        SHA2(
          CONCAT(p_password, v_salt), 
          512
        )
      )
    )
  );
  
  -- Insert user
  INSERT INTO users (
    username, password, salt, full_name, 
    email, uid_number, gid_number, home_directory
  ) VALUES (
    p_username, v_hashed_password, v_salt, p_full_name,
    p_email, p_uid_number, p_gid_number, p_home_directory
  );
END //
DELIMITER ;

-- Insert example users
CALL insert_user(
  'mie', 'mie', 'MIE User', 
  'mie@mieweb.com', 1001, 1001, 
  '/home/mie'
);

CALL insert_user(
  'admin', 'adminpass', 'System Administrator', 
  'admin@mieweb.com', 1000, 0, 
  '/home/admin'
);