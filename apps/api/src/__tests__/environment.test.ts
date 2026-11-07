import { describe, expect, it } from 'vitest';
import { parseApiEnvironment } from '../config/environment.js';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://accesslens:example@localhost:5432/accesslens',
  DIRECT_URL: 'postgresql://accesslens:example@localhost:5432/accesslens',
  SUPABASE_URL: 'https://project.example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key'
};

describe('API environment validation', () => {
  it('accepts required Supabase and database settings without optional email delivery', () => {
    const environment = parseApiEnvironment(requiredEnvironment);

    expect(environment.PORT).toBe(4000);
    expect(environment.FRONTEND_URL).toBe('http://localhost:3000');
    expect(environment.RESEND_API_KEY).toBeUndefined();
    expect(environment.INVITATION_FROM_EMAIL).toBeUndefined();
    expect(environment.GEMINI_API_KEY).toBeUndefined();
    expect(environment.GEMINI_MODEL).toBe('gemini-3.8-flash');
  });

  it('requires both email provider settings and never includes values in validation errors', () => {
    expect(() =>
      parseApiEnvironment({
        ...requiredEnvironment,
        RESEND_API_KEY: 'private-test-secret'
      })
    ).toThrow(/RESEND_API_KEY and INVITATION_FROM_EMAIL must be configured together/);
    expect(() =>
      parseApiEnvironment({
        ...requiredEnvironment,
        RESEND_API_KEY: 'private-test-secret'
      })
    ).not.toThrow(/private-test-secret/);
  });

  it('accepts a complete server-side email provider configuration', () => {
    const environment = parseApiEnvironment({
      ...requiredEnvironment,
      RESEND_API_KEY: 'private-test-secret',
      INVITATION_FROM_EMAIL: 'team@example.test'
    });

    expect(environment.INVITATION_FROM_EMAIL).toBe('team@example.test');
  });

  it('keeps Jira OAuth optional but requires the full secure configuration when enabled', () => {
    const noJira = parseApiEnvironment(requiredEnvironment);
    expect(noJira.JIRA_CLIENT_ID).toBeUndefined();
    expect(() => parseApiEnvironment({ ...requiredEnvironment, JIRA_CLIENT_ID: 'client-id' })).toThrow(/must be configured together/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment, JIRA_CLIENT_ID: 'client', JIRA_CLIENT_SECRET: 'secret',
      JIRA_REDIRECT_URI: 'https://api.example/jira/callback', JIRA_TOKEN_ENCRYPTION_KEY: 'invalid'
    })).toThrow(/JIRA_TOKEN_ENCRYPTION_KEY/);
    const complete = parseApiEnvironment({
      ...requiredEnvironment, JIRA_CLIENT_ID: 'client', JIRA_CLIENT_SECRET: 'secret',
      JIRA_REDIRECT_URI: 'https://api.example/jira/callback', JIRA_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64)
    });
    expect(complete.JIRA_CLIENT_ID).toBe('client');
  });

  it('provides rate-limit defaults without trusting forwarded IP headers', () => {
    const environment = parseApiEnvironment(requiredEnvironment);

    expect(environment.RATE_LIMIT_API_MAX).toBe(300);
    expect(environment.RATE_LIMIT_AUTH_MAX).toBe(30);
    expect(environment.RATE_LIMIT_WRITE_MAX).toBe(60);
    expect(environment.RATE_LIMIT_INVITATION_MAX).toBe(5);
    expect(environment.RATE_LIMIT_EXPENSIVE_MAX).toBe(10);
    expect(environment.SCAN_MAX_PAGES).toBe(5);
    expect(environment.SCAN_PAGE_TIMEOUT_MS).toBe(15_000);
    expect(environment.SCAN_MAX_REQUESTS_PER_PAGE).toBe(100);
    expect(environment.SCAN_MAX_BYTES_PER_SCAN).toBe(25_000_000);
    expect(environment.SCAN_MAX_CONCURRENT).toBe(1);
    expect(environment.RATE_LIMIT_REDIS_URL).toBeUndefined();
    expect(environment.TRUSTED_PROXY_CIDRS).toBeUndefined();
  });

  it('requires shared Redis storage in production and validates explicit proxy CIDRs', () => {
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      NODE_ENV: 'production'
    })).toThrow(/RATE_LIMIT_REDIS_URL: is required in production/);

    const environment = parseApiEnvironment({
      ...requiredEnvironment,
      NODE_ENV: 'production',
      RATE_LIMIT_REDIS_URL: 'rediss://rate-limiter.example.test:6380/0',
      FRONTEND_URL: 'https://accesslens.example.test',
      TRUSTED_PROXY_CIDRS: '10.24.0.0/16, 2001:db8::/32'
    });
    expect(environment.TRUSTED_PROXY_CIDRS).toEqual(['10.24.0.0/16', '2001:db8::/32']);

    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      TRUSTED_PROXY_CIDRS: '0.0.0.0/99'
    })).toThrow(/valid IP addresses or CIDRs/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      TRUSTED_PROXY_CIDRS: '0.0.0.0/0'
    })).toThrow(/valid IP addresses or CIDRs/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      RATE_LIMIT_REDIS_URL: 'https://rate-limiter.example.test'
    })).toThrow(/redis:\/\/ or rediss:\/\/ URL/);
  });

  it('requires an explicit public HTTPS frontend origin in production', () => {
    const production = {
      ...requiredEnvironment,
      NODE_ENV: 'production',
      RATE_LIMIT_REDIS_URL: 'rediss://rate-limiter.example.test:6380/0'
    };

    expect(() => parseApiEnvironment(production)).toThrow(/FRONTEND_URL: must be HTTPS and must not target localhost in production/);
    expect(() => parseApiEnvironment({ ...production, FRONTEND_URL: 'http://accesslens.example.test' }))
      .toThrow(/FRONTEND_URL: must be HTTPS and must not target localhost in production/);
    expect(parseApiEnvironment({ ...production, FRONTEND_URL: 'https://accesslens.example.test' }).FRONTEND_URL)
      .toBe('https://accesslens.example.test');
  });

  it('caps scanner resource limits', () => {
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      SCAN_MAX_PAGES: '26'
    })).toThrow(/SCAN_MAX_PAGES/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      SCAN_PAGE_TIMEOUT_MS: '30001'
    })).toThrow(/SCAN_PAGE_TIMEOUT_MS/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      SCAN_MAX_REQUESTS_PER_PAGE: '501'
    })).toThrow(/SCAN_MAX_REQUESTS_PER_PAGE/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      SCAN_MAX_CONCURRENT: '5'
    })).toThrow(/SCAN_MAX_CONCURRENT/);
    expect(() => parseApiEnvironment({
      ...requiredEnvironment,
      SCAN_MAX_BYTES_PER_SCAN: '200000001'
    })).toThrow(/SCAN_MAX_BYTES_PER_SCAN/);
  });
});
