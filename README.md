# LDAP-MySQL Authentication

This project implements an LDAP gateway server using `ldapjs` that connects to a MySQL database to manage and authenticate users. It is designed to support applications that require LDAP authentication but can store extended user information in MySQL, making it compatible with legacy systems. Additionally, the project includes configurations for user input handling and environment variables.

## Project Features

- **LDAP Server with MySQL Backend**: Handles user authentication and stores user data in both LDAP and MySQL.
- **Environment Variable Configuration**: Manages sensitive data and configurations via environment variables for enhanced security.
- **User Data Management**: Allows interactive command-line input to add new users to both LDAP and MySQL.
- **Project Modularity**: Organized code structure with separate files for configuration and utilities.

## Technologies Used

- **Node.js**: The main runtime environment for the application.
- **ldapjs**: A library for creating and managing LDAP servers in Node.js.
- **ldap-authentication**: A library that authenticates a User Against an LDAP/AD Server.
- **MySQL**: A relational database used to store extended user details.
- **dotenv**: Manages environment variables securely.
- **readline**: Handles interactive user input from the command line.

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js**: [Download Node.js](https://nodejs.org)
- **MySQL**: [Download MySQL](https://dev.mysql.com/downloads/)
- **Docker**: For setting up the LDAP server in a containerized environment.

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/anishapant21/LDAP-SQL-Auth.git
   cd LDAP-SQL-Auth
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   - Create a `.env` file in the project root based on the `.env.example` file:
     ```dotenv
     LDAP_URL=ldap://localhost:1389
     LDAP_BASE_DN=dc=mieweb,dc=com
     LDAP_ADMIN_DN=cn=admin,dc=mieweb,dc=com
     LDAP_ADMIN_PASSWORD=secret
     MYSQL_TABLE=user_details
     ```

4. **Database Setup**:
   - Create the `user_details` table in your MySQL database with the following SQL schema:
     ```sql
     CREATE TABLE user_details (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_name VARCHAR(255) UNIQUE,
       department VARCHAR(255),
       age INT,
       salary DECIMAL(10, 2)
     );
     ```

## Usage

1. **Starting the LDAP Server (Docker)**:
   
   - Download this repo https://github.com/anishapant21/ldap-docker 
   - To start the LDAP server in Docker, make sure it’s running on port `1389` (or map it to this port) and accessible to your Node.js application.
   - Docker command:
     ```bash
     docker run -it -d -p 1389:389 --name ldap-server myldap-sssd
     ```

2. **Running the Application**:
   - Start the Node.js application:
     ```bash
     node addUser.js
     node auth.js
     ```

3. **Adding a New User**:
   - The application will prompt you to enter user details (username, surname, password, department, salary).
   - After entering the details, the application will:
     - Add the user to the LDAP server.
     - Store additional user details in the MySQL database.

4. **Authentication**:
   - The application uses the stored data to authenticate users against LDAP and fetches additional details from MySQL as needed.

## Project Structure

- **`config.js`**: Contains environment variable-based configurations for LDAP and MySQL.
- **`db.js`**: Manages MySQL connections.
- **`utils.js`**: Includes helper functions like `askQuestion` for command-line prompts.
