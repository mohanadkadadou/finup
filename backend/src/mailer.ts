import { config } from './config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Messages captured under NODE_ENV=test so tests can read the links. Never filled elsewhere. */
export const outbox: Mail[] = [];

/**
 * Sends through Resend when RESEND_API_KEY is set. Without a key, development prints the message to the server
 * console and production sends nothing (links/codes are never logged there).
 * Returns true only when a message was actually handed to a transport.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.nodeEnv === 'test') {
    outbox.push(mail);
    return true;
  }
  if (config.resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: config.mailFrom,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) console.error(`[mail] Resend rejected the message: HTTP ${res.status}`);
      return res.ok;
    } catch (e) {
      console.error('[mail] Resend request failed:', e instanceof Error ? e.message : e);
      return false;
    }
  }
  if (config.nodeEnv === 'development') {
    console.log(`\n[mail:console] to=${mail.to}\nsubject: ${mail.subject}\n${mail.text}\n`);
    return true;
  }
  console.warn(`[mail] no email transport is configured; message to a user was not sent.`);
  return false;
}
