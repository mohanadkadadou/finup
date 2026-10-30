import { createHash, randomBytes } from 'node:crypto';
import { query } from './db.js';

export type TokenPurpose = 'password_reset' | 'email_verify';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Creates a new token and invalidates any earlier unused ones of the same purpose for that user. */
export async function issueToken(
  userId: string,
  purpose: TokenPurpose,
  ttlMinutes: number,
): Promise<string> {
  await query('DELETE FROM user_tokens WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL', [
    userId,
    purpose,
  ]);
  const token = randomBytes(32).toString('base64url');
  await query(
    "INSERT INTO user_tokens(token_hash, user_id, purpose, expires_at) VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)",
    [sha(token), userId, purpose, String(ttlMinutes)],
  );
  return token;
}

/** Atomically marks a valid, unused, unexpired token as used. Returns its user id, or null. */
export async function consumeToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    'UPDATE user_tokens SET used_at=now() WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > now() RETURNING user_id',
    [sha(token), purpose],
  );
  return rows[0]?.user_id ?? null;
}
