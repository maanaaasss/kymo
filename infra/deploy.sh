#!/bin/bash
# Kymo AWS Infrastructure Deployment Script
# This script deploys the required AWS resources using CloudFormation.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="kymo-infra-${ENVIRONMENT}"

echo -e "${YELLOW}Kymo AWS Infrastructure Deployment${NC}"
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${REGION}"
echo "Stack Name: ${STACK_NAME}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed.${NC}"
    echo "Please install it: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials are not configured.${NC}"
    echo "Please run: aws configure"
    exit 1
fi

# Deploy CloudFormation stack
echo -e "${YELLOW}Deploying CloudFormation stack...${NC}"
aws cloudformation deploy \
    --template-file cloudformation.yaml \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --parameter-overrides Environment="${ENVIRONMENT}" \
    --capabilities CAPABILITY_NAMED_IAM

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Stack deployed successfully!${NC}"
    echo ""
    echo "Fetching outputs..."
    aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --region "${REGION}" \
        --query 'Stacks[0].Outputs' \
        --output table
else
    echo -e "${RED}Error: Stack deployment failed.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Copy the output values to your .env.local file"
echo "2. Set USE_DYNAMODB=1 to enable DynamoDB mode"
echo "3. Deploy the Lambda worker (see lambda/ directory)"
