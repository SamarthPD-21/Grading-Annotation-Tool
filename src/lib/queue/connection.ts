import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisInstance: Redis | null = null;

export function createRedisConnection(): Redis {
  if (redisInstance) {
    return redisInstance;
  }

  redisInstance = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      // Exponential backoff capped at 10 seconds
      return Math.min(times * 1000, 10000);
    },
  });

  redisInstance.on('error', (err: any) => {
    if (err?.code === 'ECONNREFUSED') {
      // Handled silently to avoid stdout spam when Redis is not running
      return;
    }
    console.error('[Redis Error]', err?.message || err);
  });

  return redisInstance;
}
