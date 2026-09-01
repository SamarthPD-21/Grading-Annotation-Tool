import { executeGrading } from '@/services/grading.service';

export interface GradingDispatcher {
  enqueue(submissionId: string): Promise<void>;
}

export class LocalGradingDispatcher implements GradingDispatcher {
  async enqueue(submissionId: string): Promise<void> {
    // Process asynchronously without blocking response
    setImmediate(async () => {
      try {
        await executeGrading(submissionId);
      } catch (err) {
        console.error(`[LocalDispatcher] Failed to grade submission ${submissionId}:`, err);
      }
    });
  }
}

export class BullMQGradingDispatcher implements GradingDispatcher {
  async enqueue(submissionId: string): Promise<void> {
    const { Queue } = await import('bullmq');
    const { createRedisConnection } = await import('./connection');

    const connection = createRedisConnection();
    const queue = new Queue('grading', { connection });

    await queue.add(
      'grade-submission',
      { submissionId },
      {
        jobId: `grading:${submissionId}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    await queue.close();
  }
}

export function getGradingDispatcher(): GradingDispatcher {
  if (process.env.USE_BULLMQ === 'true') {
    return new BullMQGradingDispatcher();
  }
  return new LocalGradingDispatcher();
}
