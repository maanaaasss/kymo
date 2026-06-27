FROM node:20-bookworm-slim

# Install system dependencies
# - python3: required by yt-dlp
# - ffmpeg: required by yt-dlp for post-processing and media merging
# - curl: to download the latest yt-dlp release binary
# - make, g++, python3: required to compile better-sqlite3 native bindings during npm ci
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Download and install the latest official yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set the working directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies (this compiles better-sqlite3 native bindings for Linux x64/arm64)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Next.js production application
RUN npm run build

# Expose Next.js port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=3000

# Run Next.js server (instrumentation.ts hook will automatically fork the worker process on startup)
CMD ["npm", "run", "start"]
