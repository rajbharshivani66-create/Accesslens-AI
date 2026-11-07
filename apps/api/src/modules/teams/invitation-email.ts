export interface InvitationEmail {
  recipient: string;
  teamName: string;
  inviteUrl: string;
  expiresAt: Date;
}

export type InvitationEmailSender = (email: InvitationEmail) => Promise<void>;

export function createResendInvitationEmailSender(
  apiKey: string,
  fromEmail: string,
  fetcher: typeof fetch = fetch
): InvitationEmailSender {
  return async ({ recipient, teamName, inviteUrl, expiresAt }) => {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: `Invitation to join ${teamName} on AccessLens AI`,
        text: [
          `You have been invited to join ${teamName} on AccessLens AI.`,
          '',
          `Accept the invitation: ${inviteUrl}`,
          '',
          `This link expires on ${expiresAt.toISOString()} and can only be used once.`
        ].join('\n')
      }),
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Invitation email provider returned HTTP ${response.status}.`);
    }
  };
}
