import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { outbox } from '../src/mailer.js';
import { app, resetDb, signUp } from './helpers.js';

const mutable = config as { loginCodes: boolean };
const codeFrom = (text: string) => /\b(\d{6})\b/.exec(text)![1]!;

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});
afterEach(() => {
  mutable.loginCodes = false;
});

describe('email sign-in codes', () => {
  const login = (email: string, password: string) =>
    request(app).post('/api/auth/login').send({ email, password });

  async function user() {
    await signUp('c@example.com');
    outbox.length = 0;
    mutable.loginCodes = true;
  }

  it('gives no session after the password alone; the emailed code completes sign-in', async () => {
    await user();
    const step1 = await login('c@example.com', 'correct-horse-battery');
    expect(step1.status).toBe(202);
    expect(step1.headers['set-cookie']).toBeUndefined();
    const code = codeFrom(outbox.at(-1)!.text);
    const agent = request.agent(app);
    const ok = await agent
      .post('/api/auth/login/verify')
      .send({ challenge_id: step1.body.challenge_id, code });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('wrong password sends no code; a wrong code fails; a used code cannot be replayed', async () => {
    await user();
    expect((await login('c@example.com', 'wrong-password-123')).status).toBe(401);
    expect(outbox).toHaveLength(0);
    const step1 = await login('c@example.com', 'correct-horse-battery');
    const code = codeFrom(outbox.at(-1)!.text);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await request(app)
      .post('/api/auth/login/verify')
      .send({ challenge_id: step1.body.challenge_id, code: wrong });
    expect(bad.status).toBe(401);
    const good = await request(app)
      .post('/api/auth/login/verify')
      .send({ challenge_id: step1.body.challenge_id, code });
    expect(good.status).toBe(200);
    const replay = await request(app)
      .post('/api/auth/login/verify')
      .send({ challenge_id: step1.body.challenge_id, code });
    expect(replay.status).toBe(401);
  });

  it('locks a challenge after 5 wrong attempts even with the right code', async () => {
    await user();
    const step1 = await login('c@example.com', 'correct-horse-battery');
    const code = codeFrom(outbox.at(-1)!.text);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await request(app)
        .post('/api/auth/login/verify')
        .send({ challenge_id: step1.body.challenge_id, code: wrong });
    const late = await request(app)
      .post('/api/auth/login/verify')
      .send({ challenge_id: step1.body.challenge_id, code });
    expect(late.status).toBe(401);
  });
});

describe('emailed report', () => {
  it('goes only to the signed-in user, and needs data', async () => {
    const { agent } = await signUp('rep@example.com');
    const empty = await agent.post('/api/reports/email').send({});
    expect(empty.status).toBe(409);
    await agent.post('/api/demo').send({});
    outbox.length = 0;
    const ok = await agent.post('/api/reports/email').send({ to: 'attacker@example.com' });
    expect(ok.status).toBe(200);
    expect(outbox.map((m) => m.to)).toEqual(['rep@example.com']);
    expect(outbox[0]!.text).toContain('Top spending categories');
  });
});
