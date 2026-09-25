import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Reply {
  success?: boolean;
  stored?: boolean;
  error?: string;
}

describe('manual token controls', () => {
  let handleMessage: (
    message: { type: string; [key: string]: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (reply: Reply) => void
  ) => boolean | void;
  let handleInstalled: () => void;
  let cookieGet: ReturnType<typeof vi.fn>;
  let localRemove: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let sessionData: Record<string, unknown>;

  async function send(type: string, fields: Record<string, unknown> = {}): Promise<Reply> {
    return new Promise((resolve) => {
      const result = handleMessage({ type, ...fields }, {} as chrome.runtime.MessageSender, resolve);
      expect(result).toBe(true);
    });
  }

  beforeEach(async () => {
    vi.resetModules();
    sessionData = {};
    cookieGet = vi.fn();
    localRemove = vi.fn().mockResolvedValue(undefined);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
      cookies: { get: cookieGet },
      storage: {
        session: {
          get: vi.fn(async () => ({ ...sessionData })),
          set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(sessionData, values); }),
          remove: vi.fn(async (key: string) => { delete sessionData[key]; }),
        },
        local: { remove: localRemove },
      },
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onMessage: { addListener: vi.fn((listener) => { handleMessage = listener; }) },
        onInstalled: { addListener: vi.fn((listener) => { handleInstalled = listener; }) },
      },
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    });
    await import('../../src/background/index');
  });

  it('does not read the cookie on startup, status checks, or export without consent', async () => {
    expect(cookieGet).not.toHaveBeenCalled();
    expect(await send('GET_TOKEN_STATUS')).toEqual({ stored: false });
    expect(cookieGet).not.toHaveBeenCalled();

    const exportResult = await send('EXPORT_TRANSACTIONS', { accountId: 'account-1', format: 'csv' });
    expect(exportResult).toMatchObject({ success: false, error: expect.stringContaining('Get Token') });
    expect(cookieGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads only on request, reports status, and flushes the token', async () => {
    cookieGet.mockResolvedValue({ value: encodeURIComponent(JSON.stringify({ access_token: 'secret-token' })) });

    expect(await send('GET_TOKENS')).toEqual({ success: true, stored: true });
    expect(cookieGet).toHaveBeenCalledTimes(1);
    expect(sessionData).toEqual({ authToken: 'secret-token' });
    expect(await send('GET_TOKEN_STATUS')).toEqual({ stored: true });
    expect(await send('FLUSH_TOKEN')).toEqual({ success: true, stored: false });
    expect(sessionData).toEqual({});
    expect(localRemove).toHaveBeenCalledWith(['authToken', 'identityId']);
    expect(await send('GET_TOKEN_STATUS')).toEqual({ stored: false });
    expect(cookieGet).toHaveBeenCalledTimes(1);
  });

  it('clears a prior token if the current Wealthsimple cookie is missing', async () => {
    sessionData.authToken = 'old-token';
    cookieGet.mockResolvedValue(null);

    expect(await send('GET_TOKENS')).toMatchObject({ success: false, stored: false });
    expect(sessionData).toEqual({});
  });

  it('keeps a flush requested during a cookie read as the final state', async () => {
    let finishCookieRead!: (value: { value: string }) => void;
    cookieGet.mockReturnValue(new Promise((resolve) => { finishCookieRead = resolve; }));

    const getReply = send('GET_TOKENS');
    const flushReply = send('FLUSH_TOKEN');
    finishCookieRead({ value: encodeURIComponent(JSON.stringify({ access_token: 'secret-token' })) });

    expect(await getReply).toEqual({ success: true, stored: true });
    expect(await flushReply).toEqual({ success: true, stored: false });
    expect(sessionData).toEqual({});
  });

  it('deletes tokens persisted by earlier versions on install or update', () => {
    handleInstalled();
    expect(localRemove).toHaveBeenCalledWith(['authToken', 'identityId']);
    expect(cookieGet).not.toHaveBeenCalled();
  });
});
