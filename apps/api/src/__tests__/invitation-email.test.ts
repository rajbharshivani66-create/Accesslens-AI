import { describe, expect, it } from 'vitest';
import { createResendInvitationEmailSender } from '../modules/teams/invitation-email.js';

describe('Resend invitation email sender', () => {
  it('sends an invitation link using server-side authorization', async () => {
    const requests: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 202 });
    };
    const send = createResendInvitationEmailSender(
      'test-provider-secret',
      'team@example.test',
      fetcher
    );
    const inviteUrl = 'https://app.example.test/team#invite=one-time-token';

    await send({
      recipient: 'member@example.test',
      teamName: 'Example team',
      inviteUrl,
      expiresAt: new Date('2026-11-13T00:00:00.000Z')
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.resend.com/emails');
    expect(new Headers(requests[0].init?.headers).get('Authorization'))
      .toBe('Bearer test-provider-secret');
    const body = JSON.parse(String(requests[0].init?.body)) as {
      to: string[];
      text: string;
    };
    expect(body.to).toEqual(['member@example.test']);
    expect(body.text).toContain(inviteUrl);
  });

  it('rejects provider failures without exposing provider response details', async () => {
    const fetcher: typeof fetch = async () =>
      new Response('private provider response details', { status: 503 });
    const send = createResendInvitationEmailSender(
      'test-provider-secret',
      'team@example.test',
      fetcher
    );

    await expect(send({
      recipient: 'member@example.test',
      teamName: 'Example team',
      inviteUrl: 'https://app.example.test/team#invite=token',
      expiresAt: new Date('2026-11-13T00:00:00.000Z')
    })).rejects.toThrow('Invitation email provider returned HTTP 503.');
  });
});
