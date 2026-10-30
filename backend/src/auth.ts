import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { query } from './db.js';
import { ApiError } from './errors.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const COOKIE = 'finup_session';
const SESSION_DAYS = 14;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  await query(
    "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)",
    [sha(token), userId, String(SESSION_DAYS)],
  );
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: SESSION_DAYS * 86400_000,
    path: '/',
  });
}

/** Signs out every session of the user except the one making this request. */
export async function revokeOtherSessions(req: Request, userId: string): Promise<void> {
  const token = req.cookies?.[COOKIE] as string | undefined;
  await query('DELETE FROM sessions WHERE user_id=$1 AND token_hash <> $2', [
    userId,
    token ? sha(token) : '',
  ]);
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [sha(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

/** Resolves the session cookie to a user id; every data route must sit behind this. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE] as string | undefined;
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
    const rows = await query<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at > now()',
      [sha(token)],
    );
    if (!rows[0])
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    req.userId = rows[0].user_id;
    next();
  } catch (e) {
    next(e);
  }
}
