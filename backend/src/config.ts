import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgres://localhost:5432/finup'),
  TEST_DATABASE_URL: z.string().default('postgres://localhost:5432/finup_test'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  APP_URL: z.string().default('http://localhost:5173'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  BANK_PROVIDER: z.string().optional(),
  BANK_PROVIDER_CLIENT_ID: z.string().optional(),
  BANK_PROVIDER_CLIENT_SECRET: z.string().optional(),
  BANK_PROVIDER_REDIRECT_URI: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const emptyToUndef = (v?: string) => (v && v.trim() ? v.trim() : undefined);

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  databaseUrl: env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL,
  maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
  cookieSecure: env.COOKIE_SECURE === 'true',
  appUrl: env.APP_URL.replace(/\/+$/, ''),
  anthropicApiKey: emptyToUndef(env.ANTHROPIC_API_KEY),
  anthropicModel: env.ANTHROPIC_MODEL,
  bank: {
    provider: emptyToUndef(env.BANK_PROVIDER),
    clientId: emptyToUndef(env.BANK_PROVIDER_CLIENT_ID),
    clientSecret: emptyToUndef(env.BANK_PROVIDER_CLIENT_SECRET),
    redirectUri: emptyToUndef(env.BANK_PROVIDER_REDIRECT_URI),
  },
};
