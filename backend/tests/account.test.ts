import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { outbox } from '../src/mailer.js';
import { app, resetDb, signUp } from './helpers.js';

const tokenFrom = (mailText: string): string => /token=([\w-]+)/.exec(mailText)![1]!;
const lastMailFor = (to: string) => [...outbox].reverse().find((m) => m.to === to)!;

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});

describe('password reset', () => {
  it('answers identically for known and unknown emails and only mails the real one', async () => {
    await signUp('real@example.com');
    outbox.length = 0;
    const known = await request(app).post('/api/auth/forgot').send({ email: 'real@example.com' });
    const unknown = await request(app)
      .post('/api/auth/forgot')
      .send({ email: 'nobody@example.com' });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(outbox.map((m) => m.to)).toEqual(['real@example.com']);
  });

  it('resets the password once, signs out every session and marks the email verified', async () => {
    const { agent } = await signUp('r@example.com');
    await request(app).post('/api/auth/forgot').send({ email: 'r@example.com' });
    const token = tokenFrom(lastMailFor('r@example.com').text);

    const bad = await request(app).post('/api/auth/reset').send({ token, password: 'short' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/reset')
      .send({ token, password: 'a-brand-new-password' });
    expect(ok.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const reuse = await request(app)
      .post('/api/auth/reset')
      .send({ token, password: 'another-new-password' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'r@example.com', password: 'correct-horse-battery' });
    expect(oldLogin.status).toBe(401);
    const newLogin = request.agent(app);
    expect(
      (
        await newLogin
          .post('/api/auth/login')
          .send({ email: 'r@example.com', password: 'a-brand-new-password' })
      ).status,
    ).toBe(200);
    expect((await newLogin.get('/api/auth/me')).body.user.email_verified).toBe(true);
  });

  it('rejects expired and made-up tokens, and a newer request voids the older link', async () => {
    await signUp('e@example.com');
    await request(app).post('/api/auth/forgot').send({ email: 'e@example.com' });
    const first = tokenFrom(lastMailFor('e@example.com').text);
    await request(app).post('/api/auth/forgot').send({ email: 'e@example.com' });
    const second = tokenFrom(lastMailFor('e@example.com').text);

    const old = await request(app)
      .post('/api/auth/reset')
      .send({ token: first, password: 'a-brand-new-password' });
    expect(old.status).toBe(400);

    await pool.query("UPDATE user_tokens SET expires_at = now() - interval '1 minute'");
    const expired = await request(app)
      .post('/api/auth/reset')
      .send({ token: second, password: 'a-brand-new-password' });
    expect(expired.status).toBe(400);

    const fake = await request(app)
      .post('/api/auth/reset')
      .send({ token: 'x'.repeat(43), password: 'a-brand-new-password' });
    expect(fake.status).toBe(400);
  });

  it('does not store the raw token', async () => {
    await signUp('h@example.com');
    await request(app).post('/api/auth/forgot').send({ email: 'h@example.com' });
    const token = tokenFrom(lastMailFor('h@example.com').text);
    const { rows } = await pool.query('SELECT token_hash FROM user_tokens WHERE purpose=$1', [
      'password_reset',
    ]);
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].token_hash).toHaveLength(64);
  });
});

describe('change password', () => {
  it('needs the current password, keeps this session and drops the others', async () => {
    const { agent } = await signUp('c@example.com');
    const other = request.agent(app);
    await other
      .post('/api/auth/login')
      .send({ email: 'c@example.com', password: 'correct-horse-battery' });

    const wrong = await agent
      .post('/api/auth/change-password')
      .send({ current: 'nope-nope-nope', password: 'a-brand-new-password' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');

    const ok = await agent
      .post('/api/auth/change-password')
      .send({ current: 'correct-horse-battery', password: 'a-brand-new-password' });
    expect(ok.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
  });

  it('requires a session', async () => {
    const r = await request(app)
      .post('/api/auth/change-password')
      .send({ current: 'x', password: 'a-brand-new-password' });
    expect(r.status).toBe(401);
  });
});

describe('email verification', () => {
  it('sends a link at sign-up, verifies once, and reports status', async () => {
    const { agent } = await signUp('v@example.com');
    expect((await agent.get('/api/auth/me')).body.user.email_verified).toBe(false);
    const token = tokenFrom(lastMailFor('v@example.com').text);

    expect((await request(app).post('/api/auth/verify').send({ token })).status).toBe(204);
    expect((await agent.get('/api/auth/me')).body.user.email_verified).toBe(true);
    expect((await request(app).post('/api/auth/verify').send({ token })).status).toBe(400);
    expect((await agent.post('/api/auth/verify/request')).body).toEqual({ already_verified: true });
  });

  it('can resend while unverified', async () => {
    const { agent } = await signUp('s@example.com');
    outbox.length = 0;
    const r = await agent.post('/api/auth/verify/request');
    expect(r.body.sent).toBe(true);
    expect(outbox).toHaveLength(1);
  });
});
