import { isAccesDTransactionUrl } from '../utils/accesdSite';

interface AccesDExportReply {
  success: boolean;
  error?: string;
  transactionCount?: number;
  diagnostic?: string;
}

const request = { type: 'EXPORT_ACCESD_FROM_POPUP' };

export async function exportAccesDFromTab(tabId: number): Promise<AccesDExportReply> {
  const tab = await chrome.tabs.get(tabId);
  if (!isAccesDTransactionUrl(tab.url)) {
    throw new Error('The active tab is no longer on the AccèsD transaction site.');
  }

  try {
    return await chrome.tabs.sendMessage(tabId, request);
  } catch {
    // A tab left open during an extension reload may not have this content script yet.
    const match = `${new URL(tab.url ?? '').origin}/*`;
    const script = chrome.runtime.getManifest().content_scripts?.find(entry => entry.matches?.includes(match));
    if (!script?.js?.length) {
      throw new Error('The AccèsD page script is missing from this extension build.');
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: script.js });
      return await chrome.tabs.sendMessage(tabId, request);
    } catch {
      throw new Error('Could not access this AccèsD tab. Allow this extension on the site, then refresh the tab.');
    }
  }
}
