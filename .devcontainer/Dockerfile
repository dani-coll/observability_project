# Use the official Node.js image as a base
FROM node:18

# Set the working directory
WORKDIR /workspace

# Copy package.json files and install dependencies
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm install --prefix backend && npm install --prefix frontend

# Expose necessary ports
EXPOSE 3000 8080

# Default command
CMD ["npm", "start", "--prefix", "backend"]