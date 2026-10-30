import { createHash, randomInt } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  COOKIE,
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  revokeOtherSessions,
  verifyPassword,
} from '../auth.js';
import { config } from '../config.js';
import { sendMail } from '../mailer.js';
import { consumeToken, issueToken } from '../tokens.js';
import { query } from '../db.js';
import { ApiError } from '../errors.js';
import { parse, uid, wrap } from './util.js';

export const authRouter = Router();

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const limiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
const mailLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});
const newPassword = z.string().min(10).max(200);
const tokenBody = z.object({ token: z.string().min(20).max(200) });

async function sendVerification(userId: string, email: string): Promise<string> {
  const link = `${config.appUrl}/verify?token=${await issueToken(userId, 'email_verify', 24 * 60)}`;
  await sendMail({
    to: email,
    subject: 'Confirm your FinUp email / أكّد بريدك في FinUp',
    text: `Confirm your email for FinUp (valid for 24 hours):\n${link}\n\nأكّد بريدك الإلكتروني في FinUp (صالح 24 ساعة):\n${link}\n\nIf you did not create this account, ignore this message.`,
  });
  return link;
}

const creds = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(200),
});

authRouter.post(
  '/register',
  limiter,
  wrap(async (req, res) => {
    const { email, password } = parse(creds, req.body);
    const existing = await query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (existing.length)
      throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    const rows = await query<{ id: string }>(
      'INSERT INTO users(email, password_hash) VALUES ($1,$2) RETURNING id',
      [email, await hashPassword(password)],
    );
    await createSession(res, rows[0]!.id);
    // Best effort: a mail failure must never block sign-up.
    await sendVerification(rows[0]!.id, email).catch((e: unknown) => console.error(e));
    res.status(201).json({ user: { id: rows[0]!.id, email } });
  }),
);

authRouter.post(
  '/login',
  limiter,
  wrap(async (req, res) => {
    const { email, password } = parse(creds, req.body);
    const rows = await query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email=$1',
      [email],
    );
    const ok = rows[0] ? await verifyPassword(password, rows[0].password_hash) : false;
    if (!rows[0] || !ok)
      throw new ApiError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect.');
    if (config.loginCodes) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await query('DELETE FROM login_challenges WHERE user_id=$1', [rows[0].id]);
      const ch = await query<{ id: string }>(
        "INSERT INTO login_challenges(user_id, code_hash, expires_at) VALUES ($1,$2, now() + interval '10 minutes') RETURNING id",
        [rows[0].id, sha(code)],
      );
      const sent = await sendMail({
        to: email,
        subject: `FinUp sign-in code ${code} / رمز الدخول ${code}`,
        text: `Your FinUp sign-in code is ${code}. It is valid for 10 minutes. Never share it.\n\nرمز الدخول إلى FinUp: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.\n\nIf this was not you, change your password.`,
      });
      if (!sent)
        throw new ApiError(503, 'MAIL_FAILED', 'Could not send the sign-in code. Try again later.');
      res.status(202).json({ step: 'code', challenge_id: ch[0]!.id });
      return;
    }
    await createSession(res, rows[0].id);
    res.json({ user: { id: rows[0].id, email } });
  }),
);

authRouter.post(
  '/login/verify',
  limiter,
  wrap(async (req, res) => {
    const { challenge_id, code } = parse(
      z.object({ challenge_id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }),
      req.body,
    );
    const bad = new ApiError(401, 'BAD_CODE', 'The code is wrong or expired.');
    const rows = await query<{ user_id: string; code_hash: string; email: string }>(
      `UPDATE login_challenges c SET attempts = attempts + 1
       FROM users u
       WHERE c.id=$1 AND u.id=c.user_id AND c.used_at IS NULL AND c.expires_at > now() AND c.attempts < 5
       RETURNING c.user_id, c.code_hash, u.email`,
      [challenge_id],
    );
    if (!rows[0] || rows[0].code_hash !== sha(code)) throw bad;
    await query('UPDATE login_challenges SET used_at=now() WHERE id=$1', [challenge_id]);
    await createSession(res, rows[0].user_id);
    res.json({ user: { id: rows[0].user_id, email: rows[0].email } });
  }),
);

authRouter.post(
  '/logout',
  wrap(async (req, res) => {
    await destroySession(req, res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const rows = await query<{ id: string; email: string; email_verified: boolean }>(
      'SELECT id, email, (email_verified_at IS NOT NULL) AS email_verified FROM users WHERE id=$1',
      [uid(req)],
    );
    if (!rows[0]) {
      res.clearCookie(COOKIE);
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
    }
    const demo = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND is_demo',
      [uid(req)],
    );
    res.json({ user: rows[0], has_demo_data: (demo[0]?.n ?? 0) > 0 });
  }),
);

// Always answers the same way so the endpoint cannot be used to discover which emails have accounts.
// Development only: also returns the link, because no email provider is connected yet.
authRouter.post(
  '/forgot',
  mailLimiter,
  wrap(async (req, res) => {
    const { email } = parse(z.object({ email: creds.shape.email }), req.body);
    const rows = await query<{ id: string }>('SELECT id FROM users WHERE email=$1', [email]);
    let devLink: string | undefined;
    if (rows[0]) {
      const link = `${config.appUrl}/reset?token=${await issueToken(rows[0].id, 'password_reset', 60)}`;
      await sendMail({
        to: email,
        subject: 'Reset your FinUp password / إعادة تعيين كلمة سر FinUp',
        text: `Reset your FinUp password (valid for 1 hour):\n${link}\n\nأعد تعيين كلمة سر FinUp (صالح ساعة واحدة):\n${link}\n\nIf you did not ask for this, ignore this message; your password is unchanged.`,
      }).catch((e: unknown) => console.error(e));
      if (config.nodeEnv === 'development' && !config.resendApiKey) devLink = link;
    }
    res.status(202).json({ ok: true, ...(devLink ? { dev_link: devLink } : {}) });
  }),
);

authRouter.post(
  '/reset',
  mailLimiter,
  wrap(async (req, res) => {
    const b = parse(tokenBody.extend({ password: newPassword }), req.body);
    const userId = await consumeToken(b.token, 'password_reset');
    if (!userId)
      throw new ApiError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired.');
    await query(
      // Receiving the link proves control of the mailbox, so the email counts as verified too.
      'UPDATE users SET password_hash=$2, email_verified_at=COALESCE(email_verified_at, now()) WHERE id=$1',
      [userId, await hashPassword(b.password)],
    );
    await query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    res.status(204).end();
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  limiter,
  wrap(async (req, res) => {
    const b = parse(
      z.object({ current: z.string().min(1).max(200), password: newPassword }),
      req.body,
    );
    const rows = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id=$1',
      [uid(req)],
    );
    if (!rows[0] || !(await verifyPassword(b.current, rows[0].password_hash)))
      throw new ApiError(400, 'WRONG_PASSWORD', 'Your current password is incorrect.');
    await query('UPDATE users SET password_hash=$2 WHERE id=$1', [
      uid(req),
      await hashPassword(b.password),
    ]);
    await revokeOtherSessions(req, uid(req));
    res.status(204).end();
  }),
);

authRouter.post(
  '/verify/request',
  requireAuth,
  mailLimiter,
  wrap(async (req, res) => {
    const rows = await query<{ email: string; verified: boolean }>(
      'SELECT email, (email_verified_at IS NOT NULL) AS verified FROM users WHERE id=$1',
      [uid(req)],
    );
    if (!rows[0]) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
    if (rows[0].verified) {
      res.json({ already_verified: true });
      return;
    }
    const link = await sendVerification(uid(req), rows[0].email);
    res.json({
      sent: true,
      ...(config.nodeEnv === 'development' && !config.resendApiKey ? { dev_link: link } : {}),
    });
  }),
);

authRouter.post(
  '/verify',
  mailLimiter,
  wrap(async (req, res) => {
    const b = parse(tokenBody, req.body);
    const userId = await consumeToken(b.token, 'email_verify');
    if (!userId)
      throw new ApiError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired.');
    await query(
      'UPDATE users SET email_verified_at=COALESCE(email_verified_at, now()) WHERE id=$1',
      [userId],
    );
    res.status(204).end();
  }),
);
