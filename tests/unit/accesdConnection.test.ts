import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAccesDFromTab } from '../../src/popup/accesdConnection';

const scriptPath = 'assets/accesd.ts-built.js';
const alternateScriptPath = 'assets/accesd-alternate.ts-built.js';
const siteUrl = 'https://accesdc.mouv.desjardins.com/accounts';
let getTab: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getTab = vi.fn().mockResolvedValue({ id: 4, url: siteUrl });
  sendMessage = vi.fn();
  executeScript = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('chrome', {
    tabs: { get: getTab, sendMessage },
    scripting: { executeScript },
    runtime: { getManifest: () => ({ content_scripts: [
      { matches: ['https://accesdc.mouv.desjardins.com/*'], js: [scriptPath] },
      { matches: ['https://accesd.mouv.desjardins.com/*'], js: [alternateScriptPath] },
    ] }) },
  });
});

describe('AccèsD popup connection', () => {
  it('uses an existing page listener without injecting again', async () => {
    sendMessage.mockResolvedValue({ success: true, transactionCount: 2 });
    expect(await exportAccesDFromTab(4)).toEqual({ success: true, transactionCount: 2 });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('loads the bundled page script and retries when the listener is missing', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce({ success: true, transactionCount: 2 });
    expect(await exportAccesDFromTab(4)).toEqual({ success: true, transactionCount: 2 });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 4 }, files: [scriptPath] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('loads the bundled page script on accesd.mouv.desjardins.com', async () => {
    getTab.mockResolvedValue({ id: 4, url: 'https://accesd.mouv.desjardins.com/accounts' });
    sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce({ success: true, transactionCount: 2 });
    expect(await exportAccesDFromTab(4)).toEqual({ success: true, transactionCount: 2 });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 4 }, files: [alternateScriptPath] });
  });

  it('refuses to inject after the tab navigates away from AccèsD', async () => {
    getTab.mockResolvedValue({ id: 4, url: 'https://example.com/' });
    await expect(exportAccesDFromTab(4)).rejects.toThrow('no longer on the AccèsD transaction site');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('gives a useful site-access error if injection is denied', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    executeScript.mockRejectedValue(new Error('Cannot access contents of url'));
    await expect(exportAccesDFromTab(4)).rejects.toThrow('Allow this extension on the site');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
