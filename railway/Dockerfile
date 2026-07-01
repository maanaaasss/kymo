FROM python:3.11-slim

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl xz-utils && \
    rm -rf /var/lib/apt/lists/*

# Install ffmpeg static binary
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then FFMPEG_ARCH="amd64"; elif [ "$ARCH" = "aarch64" ]; then FFMPEG_ARCH="arm64"; fi && \
    curl -L "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${FFMPEG_ARCH}-static.tar.xz" -o /tmp/ffmpeg.tar.xz && \
    tar -xf /tmp/ffmpeg.tar.xz -C /tmp && \
    cp /tmp/ffmpeg-*-static/ffmpeg /usr/local/bin/ffmpeg && \
    cp /tmp/ffmpeg-*-static/ffprobe /usr/local/bin/ffprobe && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf /tmp/ffmpeg*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . /app
WORKDIR /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
