/**
 * Wealthsimple Exporter
 * (c) 2026 Nick Salt
 * Released under the MIT License.
 */

import { fetchAccounts, fetchTransactions } from './transactionService';
import { generateExportFile, isExportFormat } from '../utils/exporters';
import { generateCSV } from '../utils/exporters/csv';
import type { NormalizedTransaction } from '../utils/types';
import { isAccesDTransactionUrl } from '../utils/accesdSite';
import type { ExportFormat } from '../utils/exporters';

/**
 * Download text via a blob URL. Firefox rejects data: URLs in downloads.download().
 * The URL is revoked once the download finishes (or fails to start).
 */
async function downloadText(content: string, mimeType: string, filename: string): Promise<number> {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const cleanup = () => URL.revokeObjectURL(blobUrl);
  try {
    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === downloadId &&
          (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
        chrome.downloads.onChanged.removeListener(onChanged);
        cleanup();
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
    return downloadId;
  } catch (error) {
    cleanup();
    throw error;
  }
}

let tokenChanges: Promise<void> = Promise.resolve();

function queueTokenChange<T>(change: () => Promise<T>): Promise<T> {
  const result = tokenChanges.then(change);
  tokenChanges = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * Read the Wealthsimple cookie only after the user requests it.
 */
async function readTokenFromCookie(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({
      url: 'https://my.wealthsimple.com',
      name: '_oauth2_access_v2',
    });

    if (!cookie || !cookie.value) {
      return null;
    }

    // Cookie value is URL-encoded JSON
    const decodedValue = decodeURIComponent(cookie.value);
    const authData = JSON.parse(decodedValue);

    return typeof authData.access_token === 'string' && authData.access_token
      ? authData.access_token
      : null;
  } catch {
    return null;
  }
}

async function getStoredToken(): Promise<string | null> {
  await tokenChanges;
  const { authToken } = await chrome.storage.session.get('authToken');
  return typeof authToken === 'string' && authToken ? authToken : null;
}

async function broadcastTokenStatus(stored: boolean): Promise<void> {
  const message = { type: 'TOKEN_STATUS_CHANGED', stored };
  await Promise.allSettled([
    chrome.runtime.sendMessage(message),
    chrome.tabs.query({ url: 'https://my.wealthsimple.com/*' }).then(tabs =>
      Promise.allSettled(tabs
        .filter(tab => tab.id !== undefined)
        .map(tab => chrome.tabs.sendMessage(tab.id!, message)))
    ),
  ]);
}

/**
 * Calculate date range for last 30 days
 */
function getLast30Days(): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Handle export transactions request from popup
 */
async function handleExportTransactions(
  accountId: string | null,
  startDate: string | null,
  endDate: string | null,
  lastTransactionId: string | null,
  format: ExportFormat,
  sendResponse: (response: {
    success: boolean;
    error?: string;
    message?: string;
    transactionCount?: number;
    lastTransactionId?: string | null;
  }) => void
) {
  try {
    const authToken = await getStoredToken();

    if (!authToken) {
      sendResponse({ success: false, error: 'No token stored. Click Get Token before exporting.' });
      return;
    }

    // Step 2: Fetch accounts
    const accounts = await fetchAccounts(authToken);

    if (!accounts || accounts.length === 0) {
      sendResponse({ success: false, error: 'No accounts found.' });
      return;
    }

    // Step 3: Find the specific account
    let targetAccount;
    if (accountId) {
      // Try to find account by ID
      targetAccount = accounts.find(acc => acc.id === accountId);

      if (!targetAccount) {
        // Sometimes the accountId might be a custodian account ID
        targetAccount = accounts.find(acc =>
          acc.custodianAccounts?.some(ca => ca.id === accountId)
        );
      }

      if (!targetAccount) {
        sendResponse({
          success: false,
          error: `Account not found. Please make sure you're on a valid account page.`
        });
        return;
      }
    } else {
      // Fallback to first account if no ID provided
      targetAccount = accounts[0];
    }

    let dateRange = (startDate && endDate) ? { startDate, endDate } : getLast30Days();
    const useLastTransactionId = !!lastTransactionId;

    // Create account map for clean descriptions
    const accountMap = new Map<string, string>();
    accounts.forEach(acc => {
      // Use nickname if available, otherwise format type
      let name = acc.nickname;
      if (!name) {
        // Format "tfsa" -> "TFSA"
        const type = (acc.unifiedAccountType || acc.type || '').toUpperCase().replace(/_/g, ' ');
        name = type;
      }
      accountMap.set(acc.id, name);

      // Also map custodian accounts
      acc.custodianAccounts.forEach(ca => {
        accountMap.set(ca.id, name!);
      });
    });

    const transactions = await fetchTransactions(
      targetAccount.id,
      authToken,
      accountMap,
      useLastTransactionId ? undefined : dateRange.startDate,
      useLastTransactionId ? undefined : dateRange.endDate,
      targetAccount.unifiedAccountType || targetAccount.type
    );

    let exportTransactions = transactions;
    if (useLastTransactionId) {
      const lastIndex = transactions.findIndex((t) => t.id === lastTransactionId);

      if (lastIndex >= 0) {
        // Transactions are DESC ordered (newest first)
        // If we found it at index 5, indices 0-4 are newer, 6+ are older
        // We want to exclude it and everything older, so take only indices 0 to lastIndex-1
        exportTransactions = transactions.slice(0, lastIndex);
      } else {
        // lastTransactionId not found - user may have exported before we added ID tracking
        // Return all transactions (user will get some duplicates, but this is safer than losing data)
      }

      dateRange = {
        startDate: exportTransactions[exportTransactions.length - 1]?.date ?? new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      };
    }

    if (!exportTransactions || exportTransactions.length === 0) {
      sendResponse({
        success: false,
        error: useLastTransactionId
          ? `No new transactions found for ${targetAccount.nickname || 'this account'} since your last export.`
          : `No transactions found for ${targetAccount.nickname || 'this account'} in the specified date range.`
      });
      return;
    }

    const exportFile = generateExportFile(exportTransactions, format, {
      accountId: targetAccount.id,
      accountType: targetAccount.unifiedAccountType || targetAccount.type,
      currency: targetAccount.currency,
      org: 'WEALTHSIMPLE',
      fid: '1001',
    });

    // Step 6: Download file
    const accountName = targetAccount.nickname || targetAccount.id;
    const safeAccountName = accountName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const filename = `wealthsimple-${safeAccountName}-${dateRange.endDate}.${exportFile.extension}`;

    try {
      await downloadText(exportFile.content, exportFile.mimeType, filename);

      const lastExportedTransactionId =
        exportTransactions[exportTransactions.length - 1]?.id ?? null;

      sendResponse({
        success: true,
        message: `Successfully exported ${exportTransactions.length} transactions from ${accountName}! Check your Downloads folder.`,
        transactionCount: exportTransactions.length,
        lastTransactionId: lastExportedTransactionId,
      });
    } catch (downloadError) {
      sendResponse({
        success: false,
        error: `Download failed: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`
      });
    }
  } catch (error) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

function safeSpreadsheetText(value: string): string {
  // Spreadsheet programs can evaluate formulas from CSV text cells.
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function validatedAccesDTransactions(input: unknown): NormalizedTransaction[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10000) {
    throw new Error('The visible transaction list is empty or too large.');
  }
  return input.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid transaction data.');
    const row = item as Record<string, unknown>;
    if (typeof row.date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(row.date) ||
        typeof row.description !== 'string' || !row.description.trim() || row.description.length > 1000 ||
        typeof row.category !== 'string' || row.category.length > 1000 ||
        typeof row.amount !== 'number' || !Number.isFinite(row.amount) || Math.abs(row.amount) > 1e12) {
      throw new Error(`Invalid transaction at row ${index + 1}.`);
    }
    const [year, month, day] = row.date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw new Error(`Invalid date at row ${index + 1}.`);
    }
    return {
      id: `accesd-${index}`, date: row.date, description: safeSpreadsheetText(row.description),
      amount: row.amount, currency: 'CAD', category: safeSpreadsheetText(row.category), accountId: '',
    };
  });
}

async function exportVisibleAccesD(message: unknown, sender: chrome.runtime.MessageSender): Promise<{ success: boolean; error?: string; transactionCount?: number }> {
  try {
    if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.frameId !== 0 ||
        !isAccesDTransactionUrl(sender.url)) {
      throw new Error('Export request was not sent from the AccèsD page.');
    }
    const transactions = validatedAccesDTransactions((message as { transactions?: unknown }).transactions);
    const content = generateCSV(transactions);
    const filename = `accesd-visible-${new Date().toISOString().slice(0, 10)}.csv`;
    await downloadText('\uFEFF' + content, 'text/csv;charset=utf-8', filename);
    return { success: true, transactionCount: transactions.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'AccèsD export failed.' };
  }
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'EXPORT_ACCESD_VISIBLE') {
    void exportVisibleAccesD(message, sender).then(sendResponse);
    return true;
  }

  if (message?.type === 'EXPORT_TRANSACTIONS') {
    const accountId = message.accountId || null;
    const startDate = message.startDate || null;
    const endDate = message.endDate || null;
    const lastTransactionId = message.lastTransactionId || null;
    const format: ExportFormat = isExportFormat(message.format) ? message.format : 'csv';
    handleExportTransactions(accountId, startDate, endDate, lastTransactionId, format, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_TOKEN_STATUS') {
    getStoredToken()
      .then(token => sendResponse({ stored: !!token }))
      .catch(() => sendResponse({ stored: false, error: 'Could not read token status.' }));
    return true;
  }

  if (message.type === 'GET_TOKENS') {
    queueTokenChange(async () => {
      const token = await readTokenFromCookie();
      if (!token) {
        await chrome.storage.session.remove('authToken');
        await broadcastTokenStatus(false);
        return { success: false, stored: false, error: 'No Wealthsimple session found. Log in and try again.' };
      }
      await chrome.storage.session.set({ authToken: token });
      await broadcastTokenStatus(true);
      return { success: true, stored: true };
    })
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, stored: false, error: 'Could not store the token.' }));
    return true;
  }

  if (message.type === 'FLUSH_TOKEN') {
    queueTokenChange(async () => {
      await chrome.storage.session.remove('authToken');
      await chrome.storage.local.remove(['authToken', 'identityId']);
      await broadcastTokenStatus(false);
      return { success: true, stored: false };
    })
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, error: 'Could not flush the token.' }));
    return true;
  }

  return false;
});

// Remove tokens persisted by earlier versions; current tokens live only for this browser session.
chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.remove(['authToken', 'identityId']);
});
