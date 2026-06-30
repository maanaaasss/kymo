# Kymo AWS Infrastructure

This directory contains the AWS infrastructure setup for deploying Kymo with serverless architecture.

## Architecture

The AWS deployment uses:
- **DynamoDB** for job state, batches, download history, and idempotency
- **S3** for storing download outputs, thumbnails, and metadata
- **SQS** for the download queue with dead-letter queue
- **Lambda** for processing download jobs (replaces the persistent worker)

## Prerequisites

1. AWS CLI installed and configured
2. AWS account with appropriate permissions
3. Node.js 18+ for Lambda deployment

## Quick Start

### 1. Deploy Infrastructure

```bash
# Deploy to dev environment (default)
./deploy.sh dev

# Deploy to staging
./deploy.sh staging

# Deploy to prod
./deploy.sh prod
```

### 2. Configure Environment Variables

After deployment, copy the outputs to your `.env.local`:

```bash
# From CloudFormation outputs
AWS_REGION=us-east-1
USE_DYNAMODB=1
DYNAMODB_BATCHES_TABLE=kymo-batches-dev
DYNAMODB_JOBS_TABLE=kymo-jobs-dev
DYNAMODB_DOWNLOAD_HISTORY_TABLE=kymo-download-history-dev
DYNAMODB_IDEMPOTENCY_TABLE=kymo-idempotency-dev
S3_OUTPUTS_BUCKET=kymo-outputs-dev
SQS_DOWNLOAD_QUEUE=https://sqs.us-east-1.amazonaws.com/123456789012/kymo-downloads-dev
SQS_DLQ_QUEUE=https://sqs.us-east-1.amazonaws.com/123456789012/kymo-downloads-dlq-dev
```

### 3. Deploy Lambda Worker

The Lambda worker processes download jobs. See `lambda/` directory for the handler code.

## Resource Costs

Estimated monthly costs for dev environment (low usage):
- DynamoDB: ~$0 (free tier: 25 GB storage, 25 RCU/WCU)
- S3: ~$0 (free tier: 5 GB storage, 20,000 GET requests)
- SQS: ~$0 (free tier: 1 million requests)
- Lambda: ~$0 (free tier: 1 million requests, 400,000 GB-seconds)

**Total: Near zero for MVP usage**

## Cleanup

To remove all resources:

```bash
aws cloudformation delete-stack \
    --stack-name kymo-infra-dev \
    --region us-east-1
```

## Lambda Worker Deployment

The Lambda worker needs to be deployed separately. See `lambda/` directory for:
- `worker-handler.ts` - Main Lambda handler
- Dockerfile for container deployment (includes yt-dlp and ffmpeg)

### Quick Lambda Deploy (using AWS CLI)

```bash
# Build the Lambda package
cd ..
npm run build

# Zip the Lambda handler
zip -r lambda.zip lambda/ lib/

# Create Lambda function
aws lambda create-function \
    --function-name kymo-worker-dev \
    --runtime nodejs20.x \
    --handler lambda/worker-handler.handler \
    --zip-file fileb://lambda.zip \
    --role <LAMBDA_ROLE_ARN> \
    --timeout 900 \
    --memory-size 1024 \
    --environment Variables="{
        AWS_REGION=us-east-1,
        DYNAMODB_JOBS_TABLE=kymo-jobs-dev,
        DYNAMODB_BATCHES_TABLE=kymo-batches-dev,
        S3_OUTPUTS_BUCKET=kymo-outputs-dev,
        SQS_DOWNLOAD_QUEUE=https://sqs.us-east-1.amazonaws.com/123456789012/kymo-downloads-dev
    }"

# Add SQS trigger
aws lambda create-event-source-mapping \
    --function-name kymo-worker-dev \
    --event-source-arn <SQS_QUEUE_ARN> \
    --batch-size 1
```

## Monitoring

- CloudWatch Logs: Lambda function logs
- CloudWatch Metrics: SQS queue depth, DynamoDB capacity
- AWS Budgets: Set up cost alerts

## Security Notes

- S3 bucket is private (no public access)
- Pre-signed URLs expire after 15 minutes
- IAM role follows least-privilege principle
- No VPC needed (avoids NAT Gateway costs)
