FROM node:18-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose the application port
EXPOSE 3000

# Start the application using PM2 (installed globally) or just node
CMD ["node", "server.js"]
