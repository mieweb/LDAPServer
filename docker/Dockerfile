FROM node:18-alpine

WORKDIR /usr/src/app

# Install OpenSSL
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Create ssl directory
RUN mkdir -p ssl

# Copy application code
COPY . .

EXPOSE 1390

CMD ["node", "server.js"]