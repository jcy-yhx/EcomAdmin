import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.module';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Set a key with TTL (seconds) */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  /** Get a key value */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /** Delete a key */
  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  /** Check if a key exists */
  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }
}
