import { hashPassword } from './auth.js';
import { loadDemo } from './demo.js';
import { migrate } from './migrate.js';
import { pool, query } from './db.js';

// Placeholder credentials for LOCAL development only.
const EMAIL = 'demo@finup.local';
const PASSWORD = 'demo-finup-123';

await migrate();
const existing = await query<{ id: string }>('SELECT id FROM users WHERE email=$1', [EMAIL]);
const id =
  existing[0]?.id ??
  (
    await query<{ id: string }>(
      'INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id',
      [EMAIL, await hashPassword(PASSWORD)],
    )
  )[0]!.id;
const n = await loadDemo(id);
console.log(n ? `Seeded ${n} demo transactions.` : 'Demo data already present.');
console.log(`Sign in with ${EMAIL} / ${PASSWORD} (local development only).`);
await pool.end();
