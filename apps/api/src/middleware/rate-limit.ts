import { createClient } from 'redis';
import {
  ipKeyGenerator,
  rateLimit,
  type Options,
  type RateLimitRequestHandler
} from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { ApiEnvironment } from '../config/environment.js';

export type RateLimitSettings = Pick<ApiEnvironment,
  | 'RATE_LIMIT_API_WINDOW_MS'
  | 'RATE_LIMIT_API_MAX'
  | 'RATE_LIMIT_AUTH_WINDOW_MS'
  | 'RATE_LIMIT_AUTH_MAX'
  | 'RATE_LIMIT_USER_WINDOW_MS'
  | 'RATE_LIMIT_USER_MAX'
  | 'RATE_LIMIT_WRITE_WINDOW_MS'
  | 'RATE_LIMIT_WRITE_MAX'
  | 'RATE_LIMIT_INVITATION_WINDOW_MS'
  | 'RATE_LIMIT_INVITATION_MAX'
  | 'RATE_LIMIT_EXPENSIVE_WINDOW_MS'
  | 'RATE_LIMIT_EXPENSIVE_MAX'
>;

export const defaultRateLimitSettings: RateLimitSettings = {
  RATE_LIMIT_API_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_API_MAX: 300,
  RATE_LIMIT_AUTH_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_AUTH_MAX: 30,
  RATE_LIMIT_USER_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_USER_MAX: 600,
  RATE_LIMIT_WRITE_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_WRITE_MAX: 60,
  RATE_LIMIT_INVITATION_WINDOW_MS: 60 * 60 * 1000,
  RATE_LIMIT_INVITATION_MAX: 5,
  RATE_LIMIT_EXPENSIVE_WINDOW_MS: 60 * 1000,
  RATE_LIMIT_EXPENSIVE_MAX: 10
};

export interface RateLimitMiddlewareSet {
  apiIp: RateLimitRequestHandler;
  authIp: RateLimitRequestHandler;
  apiUser: RateLimitRequestHandler;
  writes: RateLimitRequestHandler;
  invitations: RateLimitRequestHandler;
  expensive: RateLimitRequestHandler;
}

export interface RateLimitRuntime {
  middleware: RateLimitMiddlewareSet;
  close(): Promise<void>;
}

type SendRedisCommand = (...args: string[]) => Promise<RedisReply>;
type KeyGenerator = NonNullable<Options['keyGenerator']>;

export function createRateLimitMiddleware(
  environment: RateLimitSettings,
  sendRedisCommand?: SendRedisCommand
): RateLimitMiddlewareSet {
  const store = (prefix: string) => sendRedisCommand
    ? new RedisStore({ prefix, sendCommand: sendRedisCommand })
    : undefined;

  const limiter = (
    prefix: string,
    limit: number,
    windowMs: number,
    keyGenerator: KeyGenerator
  ) => {
    const selectedStore = store(prefix);
    return rateLimit({
      windowMs,
      limit,
      keyGenerator,
      ...(selectedStore ? { store: selectedStore } : {}),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      passOnStoreError: false,
      handler: (_request, response) => response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.'
        }
      })
    });
  };

  const ipKey: KeyGenerator = (request) =>
    `ip:${ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? '0.0.0.0')}`;
  const accountKey: KeyGenerator = (request) =>
    request.authContext?.profileId
      ? `user:${request.authContext.profileId}`
      : `ip:${ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? '0.0.0.0')}`;

  return {
    apiIp: limiter(
      'accesslens:rate:api-ip:',
      environment.RATE_LIMIT_API_MAX,
      environment.RATE_LIMIT_API_WINDOW_MS,
      ipKey
    ),
    authIp: limiter(
      'accesslens:rate:auth-ip:',
      environment.RATE_LIMIT_AUTH_MAX,
      environment.RATE_LIMIT_AUTH_WINDOW_MS,
      ipKey
    ),
    apiUser: limiter(
      'accesslens:rate:api-user:',
      environment.RATE_LIMIT_USER_MAX,
      environment.RATE_LIMIT_USER_WINDOW_MS,
      accountKey
    ),
    writes: limiter(
      'accesslens:rate:writes:',
      environment.RATE_LIMIT_WRITE_MAX,
      environment.RATE_LIMIT_WRITE_WINDOW_MS,
      accountKey
    ),
    invitations: limiter(
      'accesslens:rate:invitations:',
      environment.RATE_LIMIT_INVITATION_MAX,
      environment.RATE_LIMIT_INVITATION_WINDOW_MS,
      accountKey
    ),
    expensive: limiter(
      'accesslens:rate:expensive:',
      environment.RATE_LIMIT_EXPENSIVE_MAX,
      environment.RATE_LIMIT_EXPENSIVE_WINDOW_MS,
      accountKey
    )
  };
}

export async function createRateLimitRuntime(
  environment: ApiEnvironment
): Promise<RateLimitRuntime> {
  if (!environment.RATE_LIMIT_REDIS_URL) {
    return {
      middleware: createRateLimitMiddleware(environment),
      close: async () => undefined
    };
  }

  const client = createClient({
    url: environment.RATE_LIMIT_REDIS_URL,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: false
    }
  });
  client.on('error', (error: unknown) => {
    console.error('Rate-limit Redis connection error.', {
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  });
  try {
    await client.connect();
  } catch (error) {
    client.destroy();
    throw error;
  }

  const sendCommand: SendRedisCommand = async (...args) => {
    const reply: unknown = await client.sendCommand(args);
    return reply as RedisReply;
  };

  return {
    middleware: createRateLimitMiddleware(environment, sendCommand),
    close: async () => {
      if (client.isOpen) await client.quit();
    }
  };
}
