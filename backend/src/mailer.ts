import { config } from './config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Messages captured under NODE_ENV=test so tests can read the links. Never filled elsewhere. */
export const outbox: Mail[] = [];

/**
 * No real email provider is wired in yet. In development the message (including its link) is printed to the
 * server console. In production nothing is sent and the caller is told so; links are never written to logs there.
 * Returns true only when a message was actually handed to a transport.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.nodeEnv === 'test') {
    outbox.push(mail);
    return true;
  }
  if (config.nodeEnv === 'development') {
    console.log(`\n[mail:console] to=${mail.to}\nsubject: ${mail.subject}\n${mail.text}\n`);
    return true;
  }
  console.warn(`[mail] no email transport is configured; message to a user was not sent.`);
  return false;
}
