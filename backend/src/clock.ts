/** Today as YYYY-MM-DD (UTC). FINUP_TODAY overrides it for deterministic tests/demos. */
export function todayYmd(): string {
  return process.env.FINUP_TODAY ?? new Date().toISOString().slice(0, 10);
}
