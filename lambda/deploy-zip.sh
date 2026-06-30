#!/bin/bash
# Deploy Lambda worker using zip packaging with Lambda layers via S3

set -e

FUNCTION_NAME="${1:-kymo-worker-dev}"
REGION="${AWS_REGION:-ap-south-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
S3_DEPLOY_BUCKET="kymo-deploy-${ACCOUNT_ID}"

# Get project root (parent of lambda directory)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/lambda/.build"
ZIP_FILE="${PROJECT_ROOT}/lambda/worker.zip"
LAYERS_DIR="${PROJECT_ROOT}/lambda/.layers"

echo "Deploying Lambda worker: ${FUNCTION_NAME}"
echo "Region: ${REGION}"
echo "Project root: ${PROJECT_ROOT}"

# Clean
rm -rf "${BUILD_DIR}" "${ZIP_FILE}" "${LAYERS_DIR}"
mkdir -p "${BUILD_DIR}" "${LAYERS_DIR}"

# Ensure S3 deploy bucket exists
echo "Checking S3 deploy bucket..."
aws s3api head-bucket --bucket "${S3_DEPLOY_BUCKET}" 2>/dev/null || \
  aws s3api create-bucket --bucket "${S3_DEPLOY_BUCKET}" --region "${REGION}" --create-bucket-configuration LocationConstraint="${REGION}"

# Step 1: Create binaries layer
echo "Creating binaries layer (yt-dlp + ffmpeg)..."
BIN_DIR="${LAYERS_DIR}/bin"
mkdir -p "${BIN_DIR}"

# Download yt-dlp
curl -sL -o "${BIN_DIR}/yt-dlp" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod +x "${BIN_DIR}/yt-dlp"

# Download ffmpeg
curl -sL -o /tmp/ffmpeg.tar.xz "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
cd /tmp && tar xf ffmpeg.tar.xz
cp ffmpeg-*-static/ffmpeg "${BIN_DIR}/"
cp ffmpeg-*-static/ffprobe "${BIN_DIR}/"
rm -rf /tmp/ffmpeg*
chmod +x "${BIN_DIR}/ffmpeg" "${BIN_DIR}/ffprobe"

# Create binaries layer zip
cd "${LAYERS_DIR}"
LAYER_KEY="layers/binaries-layer-$(date +%s).zip"
zip -r "${PROJECT_ROOT}/lambda/binaries-layer.zip" bin/
echo "Binaries layer size: $(du -h "${PROJECT_ROOT}/lambda/binaries-layer.zip" | cut -f1)"

# Upload to S3
echo "Uploading layer to S3..."
aws s3 cp "${PROJECT_ROOT}/lambda/binaries-layer.zip" "s3://${S3_DEPLOY_BUCKET}/${LAYER_KEY}"

# Publish layer from S3
echo "Publishing binaries layer from S3..."
LAYER_ARN=$(aws lambda publish-layer-version \
  --layer-name kymo-binaries \
  --content "S3Bucket=${S3_DEPLOY_BUCKET},S3Key=${LAYER_KEY}" \
  --compatible-runtimes nodejs20.x \
  --region ${REGION} \
  --query 'LayerVersionArn' \
  --output text)
echo "Layer ARN: ${LAYER_ARN}"

# Step 2: Build the Lambda function code using esbuild
echo "Building function code with esbuild..."
cd "${PROJECT_ROOT}"

# Create a simple package.json for Lambda
cat > "${BUILD_DIR}/package.json" << 'EOF'
{
  "name": "kymo-worker",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.1075.0",
    "@aws-sdk/lib-dynamodb": "^3.1075.0",
    "@aws-sdk/client-s3": "^3.1075.0",
    "@aws-sdk/s3-request-presigner": "^3.1075.0",
    "@aws-sdk/client-sqs": "^3.1075.0"
  }
}
EOF

cd "${BUILD_DIR}"
npm install --omit=dev

# Bundle with esbuild (compiles TS and bundles dependencies)
ESBUILD="${PROJECT_ROOT}/node_modules/.bin/esbuild"
${ESBUILD} "${PROJECT_ROOT}/lambda/worker-handler.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile="${BUILD_DIR}/handler.mjs" \
  --external:@aws-sdk/*

# Create function zip with bundled handler
cd "${BUILD_DIR}"
zip -r "${ZIP_FILE}" handler.mjs package.json node_modules/
echo "Function zip size: $(du -h "${ZIP_FILE}" | cut -f1)"

# Step 3: Deploy Lambda function
echo "Deploying Lambda function..."
aws lambda get-function --function-name ${FUNCTION_NAME} --region ${REGION} 2>/dev/null && \
  UPDATE=true || UPDATE=false

HANDLER="handler.handler"

if [ "$UPDATE" = true ]; then
  echo "Updating existing function..."
  aws lambda update-function-code \
    --function-name ${FUNCTION_NAME} \
    --zip-file "fileb://${ZIP_FILE}" \
    --region ${REGION}
  
  # Wait for function to be updated before updating config
  echo "Waiting for function update..."
  aws lambda wait function-updated --function-name ${FUNCTION_NAME} --region ${REGION}
  
  aws lambda update-function-configuration \
    --function-name ${FUNCTION_NAME} \
    --layers "${LAYER_ARN}" \
    --region ${REGION}
else
  echo "Creating new function..."
  aws lambda create-function \
    --function-name ${FUNCTION_NAME} \
    --runtime nodejs20.x \
    --handler "${HANDLER}" \
    --zip-file "fileb://${ZIP_FILE}" \
    --layers "${LAYER_ARN}" \
    --role "arn:aws:iam::${ACCOUNT_ID}:role/kymo-lambda-role-dev" \
    --timeout 900 \
    --memory-size 1024 \
    --region ${REGION} \
    --environment "Variables={
      KYMO_REGION=${REGION},
      DYNAMODB_JOBS_TABLE=kymo-jobs-dev,
      DYNAMODB_BATCHES_TABLE=kymo-batches-dev,
      DYNAMODB_DOWNLOAD_HISTORY_TABLE=kymo-download-history-dev,
      S3_OUTPUTS_BUCKET=kymo-outputs-dev-${ACCOUNT_ID},
      SQS_DOWNLOAD_QUEUE=https://sqs.${REGION}.amazonaws.com/${ACCOUNT_ID}/kymo-downloads-dev
    }"
fi

# Step 4: Add SQS trigger
echo "Adding SQS trigger..."
SQS_ARN=$(aws sqs get-queue-attributes \
  --queue-url "https://sqs.${REGION}.amazonaws.com/${ACCOUNT_ID}/kymo-downloads-dev" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

aws lambda create-event-source-mapping \
  --function-name ${FUNCTION_NAME} \
  --event-source-arn ${SQS_ARN} \
  --batch-size 1 \
  --region ${REGION} 2>/dev/null || echo "Event source mapping already exists"

# Cleanup local files
rm -rf "${BUILD_DIR}" "${ZIP_FILE}" "${LAYERS_DIR}" "${PROJECT_ROOT}/lambda/binaries-layer.zip" "${PROJECT_ROOT}/lambda/handler.mjs"

# Cleanup S3 layer zip
aws s3 rm "s3://${S3_DEPLOY_BUCKET}/${LAYER_KEY}" 2>/dev/null || true

echo ""
echo "Deployment complete!"
echo "Function: ${FUNCTION_NAME}"
echo "Layer: ${LAYER_ARN}"
