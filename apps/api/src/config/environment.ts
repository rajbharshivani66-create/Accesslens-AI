import { z } from 'zod';
import { isIP } from 'node:net';

const optionalValue = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalEmail = z.preprocess(optionalValue, z.string().email().optional());
const optionalSecret = z.preprocess(optionalValue, z.string().min(1).optional());
const optionalJiraEncryptionKey = z.preprocess(optionalValue, z.string().regex(/^[a-fA-F0-9]{64}$/, 'must be a 64-character hex key').optional());
const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().min(1).max(maximum).default(fallback);

function isIpCidr(value: string): boolean {
  const [address, prefix, ...extra] = value.split('/');
  const family = isIP(address ?? '');
  if (family === 0 || extra.length > 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits >= 1 && bits <= (family === 4 ? 32 : 128);
}

const trustedProxyCidrs = z.preprocess(
  optionalValue,
  z.string()
    .transform((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean))
    .refine((values) => values.length > 0 && values.every(isIpCidr), {
      message: 'must be a comma-separated list of valid IP addresses or CIDRs'
    })
    .optional()
);

const optionalRedisUrl = z.preprocess(
  optionalValue,
  z.string().url().refine((value) => {
    try {
      const parsed = new URL(value);
      return ['redis:', 'rediss:'].includes(parsed.protocol) && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }, 'must be a redis:// or rediss:// URL').optional()
);

const apiEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//i, 'must be a PostgreSQL connection URL'),
    DIRECT_URL: z.string().regex(/^postgres(?:ql)?:\/\//i, 'must be a PostgreSQL connection URL'),
    SUPABASE_URL: z.string().url().refine(
      (value) => ['http:', 'https:'].includes(new URL(value).protocol),
      'must use HTTP or HTTPS'
    ),
    SUPABASE_ANON_KEY: z.string().min(1),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    FRONTEND_URL: z
      .string()
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
        message: 'must use HTTP or HTTPS'
      })
      .default('http://localhost:3000'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    RESEND_API_KEY: optionalSecret,
    INVITATION_FROM_EMAIL: optionalEmail,
    GEMINI_API_KEY: optionalSecret,
    GEMINI_MODEL: z.string().trim().min(1).max(100).default('gemini-3.8-flash'),
    JIRA_CLIENT_ID: optionalSecret,
    JIRA_CLIENT_SECRET: optionalSecret,
    JIRA_REDIRECT_URI: z.preprocess(optionalValue, z.string().url().refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
    }, 'must be an HTTP(S) callback URL without credentials, query, or fragment').optional()),
    JIRA_TOKEN_ENCRYPTION_KEY: optionalJiraEncryptionKey,
    RATE_LIMIT_REDIS_URL: optionalRedisUrl,
    TRUSTED_PROXY_CIDRS: trustedProxyCidrs,
    RATE_LIMIT_API_WINDOW_MS: positiveInteger(15 * 60 * 1000, 2_147_483_647),
    RATE_LIMIT_API_MAX: positiveInteger(300, 1_000_000),
    RATE_LIMIT_AUTH_WINDOW_MS: positiveInteger(15 * 60 * 1000, 2_147_483_647),
    RATE_LIMIT_AUTH_MAX: positiveInteger(30, 1_000_000),
    RATE_LIMIT_USER_WINDOW_MS: positiveInteger(15 * 60 * 1000, 2_147_483_647),
    RATE_LIMIT_USER_MAX: positiveInteger(600, 1_000_000),
    RATE_LIMIT_WRITE_WINDOW_MS: positiveInteger(15 * 60 * 1000, 2_147_483_647),
    RATE_LIMIT_WRITE_MAX: positiveInteger(60, 1_000_000),
    RATE_LIMIT_INVITATION_WINDOW_MS: positiveInteger(60 * 60 * 1000, 2_147_483_647),
    RATE_LIMIT_INVITATION_MAX: positiveInteger(5, 1_000_000),
    RATE_LIMIT_EXPENSIVE_WINDOW_MS: positiveInteger(60 * 1000, 2_147_483_647),
    RATE_LIMIT_EXPENSIVE_MAX: positiveInteger(10, 1_000_000),
    SCAN_MAX_PAGES: positiveInteger(5, 25),
    SCAN_PAGE_TIMEOUT_MS: positiveInteger(15_000, 30_000),
    SCAN_MAX_REQUESTS_PER_PAGE: positiveInteger(100, 500),
    SCAN_MAX_BYTES_PER_SCAN: positiveInteger(25_000_000, 200_000_000),
    SCAN_MAX_CONCURRENT: positiveInteger(1, 4)
  })
  .superRefine((environment, context) => {
    if (Boolean(environment.RESEND_API_KEY) !== Boolean(environment.INVITATION_FROM_EMAIL)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY and INVITATION_FROM_EMAIL must be configured together'
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.RATE_LIMIT_REDIS_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATE_LIMIT_REDIS_URL'],
        message: 'is required in production for shared rate-limit storage'
      });
    }
    const jiraConfiguration = [environment.JIRA_CLIENT_ID, environment.JIRA_CLIENT_SECRET, environment.JIRA_REDIRECT_URI, environment.JIRA_TOKEN_ENCRYPTION_KEY];
    if (jiraConfiguration.some(Boolean) && !jiraConfiguration.every(Boolean)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JIRA_CLIENT_ID'],
        message: 'JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, JIRA_REDIRECT_URI, and JIRA_TOKEN_ENCRYPTION_KEY must be configured together'
      });
    }
    if (environment.NODE_ENV === 'production' && environment.JIRA_REDIRECT_URI && !environment.JIRA_REDIRECT_URI.startsWith('https://')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['JIRA_REDIRECT_URI'], message: 'must use HTTPS in production' });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function parseApiEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  const parsed = apiEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API environment configuration: ${errors}`);
  }
  return parsed.data;
}
