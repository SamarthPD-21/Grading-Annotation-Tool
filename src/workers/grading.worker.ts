import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/queue/connection';
import { executeGrading } from '../services/grading.service';

if (process.env.USE_BULLMQ !== 'true') {
  console.log('[Worker] USE_BULLMQ is not enabled. (Local in-process dispatcher active). Worker standing by.');
  process.exit(0);
}

console.log('[Worker] Starting GradeSense BullMQ Worker...');
const connection = createRedisConnection();

const worker = new Worker(
  'grading',
  async (job) => {
    const { submissionId } = job.data;
    console.log(`[Worker] Processing job ${job.id} for submission ${submissionId}...`);
    await executeGrading(submissionId);
    console.log(`[Worker] Successfully completed job ${job.id}`);
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
});

const shutdown = async () => {
  console.log('[Worker] Shutting down worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
