# Kymo — Production Deployment Guide (AWS & GCP Free Tiers)

This guide compares AWS Lambda vs. AWS EC2 (and GCP Compute Engine) specifically for hosting Kymo. It details how to set up your production environment 100% free of charge.

---

## 1. Architectural Comparison: Serverless vs. Virtual Machines

For a media downloader application like Kymo (which wraps `yt-dlp` and `ffmpeg`), **Virtual Machines (EC2 / GCP Compute Engine) are far superior to Serverless Functions (AWS Lambda / GCP Cloud Functions)**.

Here is the technical breakdown of why:

| Feature / Limit | Serverless (AWS Lambda) | Virtual Machine (AWS EC2 / GCP VM) | Kymo Requirement Analysis |
| :--- | :--- | :--- | :--- |
| **Timeout Limits** | Max 15 minutes. | **Unlimited.** | **Critical:** Downloading and muxing large playlists or high-res videos (1080p/4K) often takes longer than 15 mins. Lambda will abruptly abort. |
| **Disk Space** | 512 MB free. Up to 10 GB paid. | **Up to 30 GB free** (EBS/Persistent Disk). | **Critical:** Merging separate video/audio streams via `ffmpeg` requires matching temporary disk space. 512 MB is easily exceeded by a single HD video. |
| **Binary Dependencies** | Requires compiling `yt-dlp` and `ffmpeg` as static layers or docker packages. | **Native installation** via package managers (`apt`, `pip`). | Installing and updating `ffmpeg` and `yt-dlp` on standard Linux VMs is trivial. |
| **YouTube Rate Limiting** | Lambda shared IP blocks are highly monitored and frequently blocked by YouTube. | Single dedicated IP (can assign Elastic IPs or rotate). | YouTube blocks datacenter/bot IP pools. VM IPs are less aggressively targeted than AWS Lambda pools. |
| **Cost (Free Tier)** | 1M free requests, but extra charges for RAM/storage configurations. | **100% Free** (750 hours/month on AWS; Always Free on GCP e2-micro). | Virtual machines offer a true, predictable zero-cost sandbox if kept within boundaries. |

### Verdict: Go with AWS EC2 (t2.micro) or GCP VM (e2-micro)
Virtual instances provide a standard Linux OS (Ubuntu), persistent free disk space (up to 30 GB), and unlimited timeouts—making them perfect for queue-based downloading and ffmpeg processing.

---

## 2. AWS EC2 (t2.micro) Free Tier Setup

AWS offers **750 hours per month** of a `t2.micro` (or `t3.micro` depending on region) instance for free, which runs one server 24/7.

### Step 1: Launch the Instance
1. Log in to the [AWS Management Console](https://aws.amazon.com/).
2. Navigate to **EC2 Dashboard** and click **Launch Instance**.
3. **Name**: `kymo-backend`.
4. **OS Image**: Select **Ubuntu Server 24.04 LTS** (marked *"Free tier eligible"*).
5. **Instance Type**: Select **`t2.micro`** (1 vCPU, 1 GB RAM).
6. **Key Pair**: Create a new key pair (`kymo-key.pem`), download it, and secure it on your local machine:
   ```bash
   chmod 400 kymo-key.pem
   ```
7. **Network Settings**:
   - Check **Allow SSH traffic** (from your IP or anywhere).
   - Check **Allow HTTPS traffic** and **Allow HTTP traffic**.

### Step 2: Configure Free Storage
1. Scroll down to **Configure Storage**.
2. Change the size of the root volume to **30 GB** (AWS Free Tier allows up to 30 GB of General Purpose SSD gp3 storage).

### Step 3: Connect and Configure SWAP Memory
Since `t2.micro` has only 1 GB of RAM, running Next.js build steps or `ffmpeg` processing might trigger Out-Of-Memory (OOM) crashes. Configuring **Swap Space** (virtual memory on disk) is mandatory.

1. SSH into your instance:
   ```bash
   ssh -i kymo-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
   ```
2. Allocate a 2 GB swap file:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```
3. Make the swap persistent across restarts:
   ```bash
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
4. Verify swap is active:
   ```bash
   free -h
   ```

---

## 3. GCP Compute Engine (e2-micro) "Always Free" Setup

Google Cloud Platform offers a **free VM instance** that is always free (not limited to 12 months) under their Free Tier program.

### Step 1: Launch the Instance
1. Go to the [GCP Console](https://console.cloud.google.com/).
2. Go to **Compute Engine** > **VM Instances** > **Create Instance**.
3. **Region**: You MUST choose one of these US regions to stay on the free tier:
   - `us-east1` (South Carolina)
   - `us-west1` (Oregon)
   - `us-central1` (Iowa)
4. **Machine Configuration**:
   - Machine family: **General-purpose**.
   - Series: **E2**.
   - Machine type: **`e2-micro`** (2 vCPUs, 1 GB RAM).
5. **Boot Disk**:
   - Click **Change**.
   - Operating System: **Ubuntu**.
   - Version: **Ubuntu 24.04 LTS**.
   - Boot disk type: **Standard Persistent Disk** (HDD).
   - Size: **30 GB** (GCP Free Tier allows up to 30 GB of Standard Persistent Disk).
6. **Firewall**:
   - Check **Allow HTTP traffic**.
   - Check **Allow HTTPS traffic**.
7. Click **Create**.

### Step 2: Configure Swap Space
Like EC2, create a swap file to protect the 1 GB instance from memory spikes:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Install System Dependencies & Kymo Code

Once connected to your Ubuntu instance (AWS or GCP), follow these steps to install Kymo's environment.

### Step 1: Install Node.js & Package Managers
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm globally
sudo npm install -g pnpm pm2
```

### Step 2: Install FFmpeg & yt-dlp
`ffmpeg` handles audio-video joining, while `yt-dlp` extracts links. Keep `yt-dlp` updated via `pip` to prevent YouTube extractor breaking errors.
```bash
# Install ffmpeg
sudo apt install -y ffmpeg

# Install python3 and pip
sudo apt install -y python3-pip python3-venv

# Set up a global python environment for yt-dlp to avoid OS conflicts
sudo python3 -m venv /opt/yt-dlp-venv
sudo /opt/yt-dlp-venv/bin/pip install --upgrade pip
sudo /opt/yt-dlp-venv/bin/pip install --upgrade yt-dlp

# Symlink yt-dlp so Kymo can access it anywhere
sudo ln -s /opt/yt-dlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp
```
Verify installations:
```bash
ffmpeg -version
yt-dlp --version
```

### Step 3: Clone and Prepare Kymo
```bash
# Clone the repository
git clone <YOUR-REPOSITORY-URL> kymo
cd kymo

# Install node modules
pnpm install

# Build Next.js project
pnpm run build
```

---

## 5. Running the Backend & Worker Process

Since Next.js serverless functions or API endpoints handle downloads in the background, we need Kymo running persistently.

### Run with PM2 (Process Manager)
PM2 keeps the web app alive in the background and restarts it automatically on system reboots.

1. Start Kymo:
   ```bash
   pm2 start npm --name "kymo" -- start
   ```
2. Set up startup script:
   ```bash
   pm2 startup
   # Copy and run the command printed by the output of the line above
   pm2 save
   ```

### Check Logs & Status
```bash
pm2 status
pm2 logs kymo
```

---

## 6. Accessing the Application
By default, the Next.js server runs on port `3000`. To access Kymo:

1. **Local Proxy Option (Nginx)**: Map port `80` (HTTP) or `443` (HTTPS) to Next.js port `3000`.
   ```bash
   sudo apt install -y nginx
   ```
   Create server block configuration `/etc/nginx/sites-available/default`:
   ```nginx
   server {
       listen 80;
       server_name _;

       location / {
           proxy_pass http://152.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Restart nginx:
   ```bash
   sudo systemctl restart nginx
   ```
2. **Access URL**: Open your browser and navigate to your VM instance's public IP address. Kymo is now live, running 100% free on AWS or GCP!
