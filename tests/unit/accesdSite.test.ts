import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCESD_TRANSACTION_ORIGINS, isAccesDTransactionUrl } from '../../src/utils/accesdSite';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as {
  content_scripts: Array<{ matches: string[] }>;
  host_permissions: string[];
};

describe('AccèsD transaction page recognition', () => {
  it('recognizes both exact AccèsD transaction hosts and their paths', () => {
    expect(isAccesDTransactionUrl('https://accesdc.mouv.desjardins.com/')).toBe(true);
    expect(isAccesDTransactionUrl('https://accesdc.mouv.desjardins.com/accounts/checking')).toBe(true);
    expect(isAccesDTransactionUrl('https://accesd.mouv.desjardins.com/')).toBe(true);
    expect(isAccesDTransactionUrl('https://accesd.mouv.desjardins.com/accounts/checking')).toBe(true);
    expect(isAccesDTransactionUrl('https://accweb.mouv.desjardins.com/')).toBe(false);
    expect(isAccesDTransactionUrl('https://accesdc.mouv.desjardins.com.evil.test/')).toBe(false);
    expect(isAccesDTransactionUrl('https://accesd.mouv.desjardins.com.evil.test/')).toBe(false);
    expect(isAccesDTransactionUrl('http://accesdc.mouv.desjardins.com/')).toBe(false);
    expect(isAccesDTransactionUrl('http://accesd.mouv.desjardins.com/')).toBe(false);
  });

  it('injects only on the two transaction hosts, without persistent AccèsD host permissions', () => {
    for (const origin of ACCESD_TRANSACTION_ORIGINS) {
      const match = `${origin}/*`;
      expect(manifest.content_scripts.some(script => script.matches.includes(match))).toBe(true);
      expect(manifest.host_permissions).not.toContain(match);
    }
  });
});
