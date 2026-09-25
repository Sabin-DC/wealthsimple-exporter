// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

describe('AccèsD page script initialization', () => {
  it('registers one export listener when the bundled script runs twice', async () => {
    vi.useFakeTimers();
    const addListener = vi.fn();
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener } } });
    const context = globalThis as typeof globalThis & { __accesdExporterInitialized?: boolean };
    delete context.__accesdExporterInitialized;

    vi.resetModules();
    await import('../../src/content/accesd');
    vi.resetModules();
    await import('../../src/content/accesd');

    expect(addListener).toHaveBeenCalledTimes(1);
    vi.clearAllTimers();
    vi.useRealTimers();
    delete context.__accesdExporterInitialized;
  });

  it('passes a masked parser diagnostic to the popup without a download', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <h2>September 2026</h2><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
      <tbody><tr><td>SEP 22</td><td>Private Merchant</td><td>123.45 CAD</td></tr></tbody></table>`;
    const addListener = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { onMessage: { addListener }, sendMessage } });
    const context = globalThis as typeof globalThis & { __accesdExporterInitialized?: boolean };
    delete context.__accesdExporterInitialized;
    vi.resetModules();
    await import('../../src/content/accesd');
    const listener = addListener.mock.calls[0][0] as (
      message: { type: string }, sender: unknown, respond: (value: unknown) => void
    ) => boolean;
    const reply = await new Promise<{ success: boolean; diagnostic: string }>(resolve => {
      expect(listener({ type: 'EXPORT_ACCESD_FROM_POPUP' }, {}, value => resolve(value as { success: boolean; diagnostic: string }))).toBe(true);
    });
    expect(reply.success).toBe(false);
    expect(reply.diagnostic).toContain('reason=amount');
    expect(reply.diagnostic).not.toContain('Private Merchant');
    expect(reply.diagnostic).not.toContain('123.45');
    expect(sendMessage).not.toHaveBeenCalled();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete context.__accesdExporterInitialized;
    document.body.innerHTML = '';
  });
});
