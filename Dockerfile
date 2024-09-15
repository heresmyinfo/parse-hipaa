FROM node:14

WORKDIR /parse-server

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose the port
EXPOSE 1337

# Set environment variables
ENV NODE_ENV=production

# Start the Parse server
CMD ["node", "index.js"]