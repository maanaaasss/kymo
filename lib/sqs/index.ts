/**
 * SQS operations for the download queue.
 *
 * Handles enqueueing jobs, receiving messages, and managing
 * dead-letter queue (DLQ) for failed messages.
 */

import {
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { sqsClient, AWS_RESOURCES } from "../aws/config";

const { DOWNLOAD_QUEUE, DLQ_QUEUE } = AWS_RESOURCES;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QueueMessage {
  /** The job ID to process */
  jobId: string;
  /** Optional: batch ID for batch operations */
  batchId?: string;
  /** Optional: attempt number for retry tracking */
  attempt?: number;
}

export interface ReceivedMessage {
  /** SQS message receipt handle */
  receiptHandle: string;
  /** The parsed message body */
  body: QueueMessage;
  /** Number of times this message has been received */
  receiveCount: number;
}

// ─── Enqueue Operations ─────────────────────────────────────────────────────

/**
 * Enqueue a download job to the main queue.
 * Returns the SQS message ID.
 */
export async function enqueueJob(jobId: string, batchId?: string): Promise<string> {
  const message: QueueMessage = {
    jobId,
    batchId,
    attempt: 1,
  };

  const result = await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: DOWNLOAD_QUEUE,
      MessageBody: JSON.stringify(message),
    })
  );

  return result.MessageId!;
}

/**
 * Enqueue multiple jobs as a batch.
 * Returns array of message IDs.
 */
export async function enqueueJobs(
  jobs: Array<{ jobId: string; batchId?: string }>
): Promise<string[]> {
  const messageIds: string[] = [];

  // SQS supports batch send of up to 10 messages
  const chunks: typeof jobs[] = [];
  for (let i = 0; i < jobs.length; i += 10) {
    chunks.push(jobs.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const promises = chunk.map((job) => enqueueJob(job.jobId, job.batchId));
    const ids = await Promise.all(promises);
    messageIds.push(...ids);
  }

  return messageIds;
}

// ─── Receive Operations ─────────────────────────────────────────────────────

/**
 * Receive a single message from the queue.
 * Uses long polling with a 20-second wait time.
 */
export async function receiveMessage(): Promise<ReceivedMessage | null> {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: DOWNLOAD_QUEUE,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 900, // 15 minutes (must be > Lambda timeout)
      AttributeNames: ["All"],
    })
  );

  if (!result.Messages || result.Messages.length === 0) {
    return null;
  }

  const msg = result.Messages[0];
  return {
    receiptHandle: msg.ReceiptHandle!,
    body: JSON.parse(msg.Body!) as QueueMessage,
    receiveCount: parseInt(msg.Attributes?.ApproximateReceiveCount || "1", 10),
  };
}

/**
 * Receive a batch of messages from the queue.
 * Useful for batch processing scenarios.
 */
export async function receiveMessages(
  maxMessages: number = 10
): Promise<ReceivedMessage[]> {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: DOWNLOAD_QUEUE,
      MaxNumberOfMessages: Math.min(maxMessages, 10),
      WaitTimeSeconds: 20,
      VisibilityTimeout: 900,
      AttributeNames: ["All"],
    })
  );

  if (!result.Messages) {
    return [];
  }

  return result.Messages.map((msg) => ({
    receiptHandle: msg.ReceiptHandle!,
    body: JSON.parse(msg.Body!) as QueueMessage,
    receiveCount: parseInt(msg.Attributes?.ApproximateReceiveCount || "1", 10),
  }));
}

// ─── Delete Operations ──────────────────────────────────────────────────────

/**
 * Delete a message from the queue after successful processing.
 */
export async function deleteMessage(receiptHandle: string): Promise<void> {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: DOWNLOAD_QUEUE,
      ReceiptHandle: receiptHandle,
    })
  );
}

// ─── Visibility Operations ──────────────────────────────────────────────────

/**
 * Change message visibility timeout (e.g., to extend processing time).
 */
export async function changeVisibility(
  receiptHandle: string,
  visibilityTimeoutSeconds: number
): Promise<void> {
  await sqsClient.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: DOWNLOAD_QUEUE,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: visibilityTimeoutSeconds,
    })
  );
}

// ─── DLQ Operations ─────────────────────────────────────────────────────────

/**
 * Send a failed message to the dead-letter queue for manual review.
 */
export async function sendToDlq(jobId: string, error: string, originalMessage?: unknown): Promise<void> {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: DLQ_QUEUE,
      MessageBody: JSON.stringify({
        jobId,
        error,
        originalMessage,
        failedAt: new Date().toISOString(),
      }),
    })
  );
}

// ─── Queue Stats ────────────────────────────────────────────────────────────

export interface QueueStats {
  approximateNumberOfMessages: number;
  approximateNumberOfMessagesNotVisible: number;
  approximateNumberOfMessagesDelayed: number;
}

/**
 * Get queue depth statistics.
 */
export async function getQueueStats(): Promise<QueueStats> {
  const result = await sqsClient.send(
    new GetQueueAttributesCommand({
      QueueUrl: DOWNLOAD_QUEUE,
      AttributeNames: [
        "ApproximateNumberOfMessages",
        "ApproximateNumberOfMessagesNotVisible",
        "ApproximateNumberOfMessagesDelayed",
      ],
    })
  );

  return {
    approximateNumberOfMessages: parseInt(
      result.Attributes?.ApproximateNumberOfMessages || "0",
      10
    ),
    approximateNumberOfMessagesNotVisible: parseInt(
      result.Attributes?.ApproximateNumberOfMessagesNotVisible || "0",
      10
    ),
    approximateNumberOfMessagesDelayed: parseInt(
      result.Attributes?.ApproximateNumberOfMessagesDelayed || "0",
      10
    ),
  };
}
