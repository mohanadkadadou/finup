process.env.NODE_ENV = 'test';
const { migrate } = await import('../src/migrate.js');
const { pool } = await import('../src/db.js');

export default async function setup() {
  await migrate();
  return async () => {
    await pool.end();
  };
}
