import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';

const ran = await migrate();
if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);
createApp().listen(config.port, () => {
  console.log(`Finup API listening on http://localhost:${config.port}`);
  console.log(
    `AI: ${config.anthropicApiKey ? 'API key present (unverified)' : 'no key, deterministic fallback'} | Bank provider: ${config.bank.provider ?? 'none'}`,
  );
});
