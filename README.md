# LDAP-MySQL Authentication

This project implements an LDAP gateway server using `ldapjs` that connects to a MySQL database to manage and authenticate users. It is designed to support applications that require LDAP authentication but can store extended user information in MySQL, making it compatible with legacy systems.

---

## **Technologies Used**

- **Node.js**: The main runtime environment for the application.
- **ldapjs**: A library for creating and managing LDAP servers in Node.js.
- **MySQL**: A relational database used to store extended user details.
- **dotenv**: Manages environment variables securely.

---

## **Getting Started**

### **Prerequisites**

Ensure you have the following installed:

- **Node.js**: [Download Node.js](https://nodejs.org)
- **MySQL**: [Download MySQL](https://dev.mysql.com/downloads/)
- **Docker**: [Download Docker](https://www.docker.com/) for setting up the LDAP server in a containerized environment.

---

### **Installation**

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/anishapant21/LDAP-SQL-Auth.git
   cd LDAP-SQL-Auth/docker
   ```

2. **Install Dependencies**:
   Navigate to the `server` directory and run:
   ```bash
   npm install
   ```

---

## **Usage**

1. **Starting the LDAP Server (Docker)**:

   - To build and start the Docker containers, run:
     ```bash
     docker-compose up --build
     ```

2. **Access the Client Bash**:

   - Enter the client container:
     ```bash
     docker exec -it ldap_client bash
     ```

3. **Perform an LDAP Search**:

   - Query the LDAP server using:
     ```bash
     ldapsearch -x -H ldaps://app:1390 -b "dc=mieweb,dc=com" "(cn=testuser)"
     ```

4. **Authentication**:

   ```bash
   ssh testuser@localhost -p 2222
   ```

   **Note**: The functionality for login to the Linux system using LDAP users is currently under development.

---

## **Project Structure**

```plaintext
docker/
├── client/
│   ├── Dockerfile         # Dockerfile for the Linux client setup
│   ├── enable-tls.ldif    # LDIF file for enabling TLS on LDAP
│   ├── ldap_env.sh        # Environment variables for LDAP
│   ├── setup.ldif         # LDIF file for initial LDAP setup
│   ├── sssd.conf          # SSSD configuration for client
│   └── users.ldif         # LDIF file for adding test users
├── server/
│   ├── Dockerfile         # Dockerfile for Node.js application
│   ├── ssl/
│   │   ├── ldap-cert.pem  # TLS certificate for LDAP
│   │   └── ldap-key.pem   # Private key for LDAP
│   ├── package.json       # Dependencies for Node.js
│   ├── package-lock.json  # Lock file for Node.js dependencies
│   └── server.js          # Main Node.js application
├── docker-compose.yml     # Docker Compose configuration
├── init.sql               # MySQL initialization script
└── README.md              # Documentation (this file)
```

---

## **Notes**

- **Certificates**: TLS certificates for the server and client are generated dynamically (WIP) and shared via Docker volumes.
- **Login Work in Progress**: Integrating full Linux login for LDAP users is ongoing.
