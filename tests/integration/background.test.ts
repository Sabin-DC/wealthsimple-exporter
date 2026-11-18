/**
 * Integration tests for the background script's install-time cleanup of
 * auth data persisted by earlier versions (issue #3). Token handling is
 * covered by authControls.test.ts.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

type MessageListener = (
  message: { type: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

const cookiesGet = vi.fn();
const storageSet = vi.fn().mockResolvedValue(undefined);
const storageGet = vi.fn().mockResolvedValue({});
const storageRemove = vi.fn().mockResolvedValue(undefined);

let messageListener: MessageListener;
let installedListener: () => void;

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    cookies: { get: cookiesGet },
    storage: {
      local: { set: storageSet, get: storageGet, remove: storageRemove },
    },
    runtime: {
      onMessage: {
        addListener: (fn: MessageListener) => {
          messageListener = fn;
        },
      },
      onInstalled: {
        addListener: (fn: () => void) => {
          installedListener = fn;
        },
      },
    },
    downloads: {
      download: vi.fn(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });

  // Importing registers the listeners captured above
  await import('../../src/background/index');
});

beforeEach(() => {
  cookiesGet.mockReset();
  storageSet.mockClear();
  storageRemove.mockClear();
});

describe('onInstalled storage cleanup', () => {
  it('removes auth data persisted by earlier versions', () => {
    installedListener();

    expect(storageRemove).toHaveBeenCalledWith(['authToken', 'identityId']);
  });
});
