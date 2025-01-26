# Use an official Node.js runtime as a parent image
FROM node:16-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Install system dependencies
RUN apk add --no-cache openssl

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the LDAP port
EXPOSE 389

# Command to run the application
CMD ["node", "server.js"]