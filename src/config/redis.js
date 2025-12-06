import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis Client Connected');
});

export default redisClient;


// import Redis from 'ioredis';

// const redisUrl =
//   process.env.REDIS_URL ||
//   "rediss://default:AVXXAAIncDI3YTdiYjYzZDA3NDM0MjcxYTk2MzA2NDY3M2E2YzU0MXAyMjE5NzU@romantic-goshawk-21975.upstash.io:6379";

// const redisClient = new Redis(redisUrl, {
//   tls: {}, // required for rediss:// (SSL)
//   retryStrategy: (times) => {
//     const delay = Math.min(times * 50, 2000);
//     return delay;
//   }
// });

// redisClient.on("error", (err) => {
//   console.error("Redis Client Error:", err);
// });

// redisClient.on("connect", () => {
//   console.log("Redis Client Connected");
// });

// export default redisClient;
