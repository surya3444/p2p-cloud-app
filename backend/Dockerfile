# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install app dependencies using npm ci for production
RUN npm ci --omit=dev

# Copy the rest of your application code
COPY . .

# Make your app's port available to the outside world
EXPOSE 8000

# Define the command to run your app using the start script
CMD [ "npm", "start" ]
