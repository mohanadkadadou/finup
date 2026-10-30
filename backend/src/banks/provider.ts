import { config } from '../config.js';

export interface NormalizedBankTx {
  externalId: string;
  bookedOn: string;
  description: string;
  amountMinor: number;
  currency: string;
}

/**
 * Contract every Open Banking / financial-data provider adapter must satisfy.
 * Tokens stay server-side. No adapter is implemented yet (see README, "Bank connections").
 */
export interface BankProvider {
  id: string;
  displayName: string;
  supportedCountries: string[];
  startConsent(userId: string, institutionId: string): Promise<{ redirectUrl: string }>;
  handleCallback(userId: string, params: Record<string, string>): Promise<{ connectionId: string }>;
  sync(connectionId: string): Promise<NormalizedBankTx[]>;
  revoke(connectionId: string): Promise<void>;
}

const registry = new Map<string, BankProvider>(); // intentionally empty: no verified adapter exists

export function getConfiguredProvider(): BankProvider | null {
  const id = config.bank.provider;
  if (!id) return null;
  const p = registry.get(id);
  return p && config.bank.clientId && config.bank.clientSecret && config.bank.redirectUri
    ? p
    : null;
}

export function bankStatus(): {
  configured: boolean;
  provider: string | null;
  reason: string;
  alternatives: string[];
} {
  const id = config.bank.provider ?? null;
  const p = getConfiguredProvider();
  if (p)
    return { configured: true, provider: p.id, reason: 'Provider configured.', alternatives: [] };
  return {
    configured: false,
    provider: id,
    reason: !id
      ? 'No bank data provider is configured. Live bank sync needs an approved Open Banking provider that covers your country and bank, plus credentials.'
      : `BANK_PROVIDER is set to "${id}" but no adapter for it is implemented in this build.`,
    alternatives: ['Upload a PDF, CSV or XLSX statement on the Import page.'],
  };
}
