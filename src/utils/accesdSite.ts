export const ACCESD_TRANSACTION_ORIGINS = [
  'https://accesdc.mouv.desjardins.com',
  'https://accesd.mouv.desjardins.com',
] as const;

export function isAccesDTransactionUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const origin = new URL(value).origin;
    return ACCESD_TRANSACTION_ORIGINS.some(allowed => allowed === origin);
  } catch {
    return false;
  }
}
