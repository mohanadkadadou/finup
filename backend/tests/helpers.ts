import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

export const app = createApp();

export async function resetDb() {
  await pool.query('TRUNCATE users CASCADE');
}

export async function signUp(email = 'a@example.com') {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: 'correct-horse-battery' });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, id: res.body.user.id as string };
}

export const csv = (lines: string[]) => Buffer.from(lines.join('\n'), 'utf8');
