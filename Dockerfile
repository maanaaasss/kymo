FROM node:20-bookworm-slim

# Install system dependencies
# - python3: required by yt-dlp
# - ffmpeg: required by yt-dlp for post-processing and media merging
# - curl: to download the latest yt-dlp release binary
# - make, g++, python3: required to compile better-sqlite3 native bindings
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm

# Download and install the latest official yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set the working directory
WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Rebuild native modules (better-sqlite3) for the target platform
RUN pnpm rebuild better-sqlite3

# Copy the rest of the application code
COPY . .

# Build the Next.js production application
RUN pnpm run build

# Expose Next.js port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=3000

# Run Next.js server (instrumentation.ts hook will automatically fork the worker process on startup)
CMD ["pnpm", "run", "start"]
