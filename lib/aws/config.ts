/**
 * AWS configuration and client initialization.
 *
 * Reads from environment variables and provides configured clients
 * for DynamoDB, S3, and SQS.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SQSClient } from "@aws-sdk/client-sqs";

const AWS_REGION = process.env.AWS_REGION || process.env.KYMO_REGION || "us-east-1";

/**
 * DynamoDB client for job state, batches, and metadata.
 */
export const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

/**
 * S3 client for file storage.
 */
export const s3Client = new S3Client({ region: AWS_REGION });

/**
 * SQS client for download queue.
 */
export const sqsClient = new SQSClient({ region: AWS_REGION });

/**
 * AWS resource names from environment variables.
 */
export const AWS_RESOURCES = {
  /** DynamoDB table for download batches */
  BATCHES_TABLE: process.env.DYNAMODB_BATCHES_TABLE || "kymo-batches",
  /** DynamoDB table for individual download jobs */
  JOBS_TABLE: process.env.DYNAMODB_JOBS_TABLE || "kymo-jobs",
  /** DynamoDB table for download history (dedup) */
  DOWNLOAD_HISTORY_TABLE: process.env.DYNAMODB_DOWNLOAD_HISTORY_TABLE || "kymo-download-history",
  /** DynamoDB table for idempotency keys */
  IDEMPOTENCY_TABLE: process.env.DYNAMODB_IDEMPOTENCY_TABLE || "kymo-idempotency",
  /** S3 bucket for download outputs */
  OUTPUTS_BUCKET: process.env.S3_OUTPUTS_BUCKET || "kymo-outputs",
  /** SQS queue for download jobs */
  DOWNLOAD_QUEUE: process.env.SQS_DOWNLOAD_QUEUE || "kymo-downloads",
  /** SQS dead-letter queue */
  DLQ_QUEUE: process.env.SQS_DLQ_QUEUE || "kymo-downloads-dlq",
} as const;

/**
 * Check if AWS is configured (all required env vars present).
 * Returns false if running in local-only mode.
 */
export function isAwsConfigured(): boolean {
  return !!(
    (process.env.AWS_REGION || process.env.KYMO_REGION) &&
    process.env.DYNAMODB_JOBS_TABLE &&
    process.env.S3_OUTPUTS_BUCKET
  );
}
