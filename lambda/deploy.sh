#!/bin/bash
# Deploy Lambda worker using Docker

set -e

FUNCTION_NAME="${1:-kymo-worker-dev}"
REGION="${AWS_REGION:-ap-south-2}"
ECR_REPO="kymo-worker"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

# Get project root (parent of lambda directory)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Deploying Lambda worker: ${FUNCTION_NAME}"
echo "Region: ${REGION}"
echo "ECR URI: ${ECR_URI}"
echo "Project root: ${PROJECT_ROOT}"

# Step 1: Create ECR repository (if it doesn't exist)
echo "Checking ECR repository..."
aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${REGION} 2>/dev/null || \
  aws ecr create-repository --repository-name ${ECR_REPO} --region ${REGION}

# Step 2: Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Step 3: Build Docker image for amd64 (Lambda default architecture)
echo "Building Docker image for amd64..."
cd "${PROJECT_ROOT}"
docker buildx build --platform linux/amd64 -t ${ECR_REPO} -f lambda/Dockerfile --load .

# Step 4: Tag image
echo "Tagging image..."
docker tag ${ECR_REPO}:latest ${ECR_URI}:latest

# Step 5: Push to ECR
echo "Pushing to ECR..."
docker push ${ECR_URI}:latest

# Step 6: Create or update Lambda function
echo "Deploying Lambda function..."
aws lambda get-function --function-name ${FUNCTION_NAME} --region ${REGION} 2>/dev/null && \
  UPDATE=true || UPDATE=false

if [ "$UPDATE" = true ]; then
  echo "Updating existing function..."
  aws lambda update-function-code \
    --function-name ${FUNCTION_NAME} \
    --image-uri ${ECR_URI}:latest \
    --region ${REGION}
else
  echo "Creating new function..."
  aws lambda create-function \
    --function-name ${FUNCTION_NAME} \
    --package-type Image \
    --code ImageUri=${ECR_URI}:latest \
    --role arn:aws:iam::${ACCOUNT_ID}:role/kymo-lambda-role-dev \
    --timeout 900 \
    --memory-size 1024 \
    --architectures x86_64 \
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

# Step 7: Add SQS trigger
echo "Adding SQS trigger..."
SQS_ARN=$(aws sqs get-queue-attributes \
  --queue-url https://sqs.${REGION}.amazonaws.com/${ACCOUNT_ID}/kymo-downloads-dev \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

aws lambda create-event-source-mapping \
  --function-name ${FUNCTION_NAME} \
  --event-source-arn ${SQS_ARN} \
  --batch-size 1 \
  --region ${REGION} 2>/dev/null || echo "Event source mapping already exists"

echo ""
echo "Deployment complete!"
echo "Function: ${FUNCTION_NAME}"
echo "ECR Image: ${ECR_URI}:latest"
