FROM node:20-slim

WORKDIR /var/task

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    curl \
    ca-certificates \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp standalone binary
RUN curl -L -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

# Install ffmpeg static binary
RUN curl -L -o /tmp/ffmpeg.tar.xz "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" && \
    cd /tmp && tar xf ffmpeg.tar.xz && \
    cp ffmpeg-*-static/ffmpeg /usr/local/bin/ && \
    cp ffmpeg-*-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Install Lambda Runtime Interface Client
RUN npm install @aws-lambda-powertools/logger aws-lambda

# Copy source
COPY lambda/worker-handler.ts ${LAMBDA_TASK_ROOT}/lambda/
COPY lib/worker/ ${LAMBDA_TASK_ROOT}/lib/worker/
COPY lib/aws/ ${LAMBDA_TASK_ROOT}/lib/aws/
COPY lib/s3/ ${LAMBDA_TASK_ROOT}/lib/s3/
COPY lib/sqs/ ${LAMBDA_TASK_ROOT}/lib/sqs/
COPY lib/db/dynamodb.ts ${LAMBDA_TASK_ROOT}/lib/db/dynamodb.ts
COPY lib/db/repository.ts ${LAMBDA_TASK_ROOT}/lib/db/repository.ts
COPY package.json ${LAMBDA_TASK_ROOT}/

# Install production dependencies
RUN npm install --omit=dev

# Lambda runtime
ENTRYPOINT ["/lambda-entrypoint.sh"]
CMD ["lambda/worker-handler.handler"]
