import { AccesDParseError, parseVisibleAccesDTransactions } from '../utils/accesdVisible';

const PANEL_ID = 'accesd-local-exporter';

async function exportVisible(): Promise<{ success: boolean; error?: string; transactionCount?: number; diagnostic?: string }> {
  try {
    const transactions = parseVisibleAccesDTransactions();
    return await chrome.runtime.sendMessage({ type: 'EXPORT_ACCESD_VISIBLE', transactions });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not export transactions.',
      diagnostic: error instanceof AccesDParseError ? error.diagnostic : undefined };
  }
}


function injectButton(): void {
  if (document.getElementById(PANEL_ID) || !document.body) return;
  const pageText = document.body.textContent || '';
  if (!/\bDate\b/i.test(pageText) || !/\bDescription\b/i.test(pageText) || !/\b(Amount|Montant)\b/i.test(pageText)) return;

  const host = document.createElement('div');
  host.id = PANEL_ID;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; font: 14px Arial, sans-serif; }
    button { background: #135f4b; color: #fff; border: 0; border-radius: 7px; padding: 10px 14px; cursor: pointer; box-shadow: 0 2px 8px #0004; }
    button:disabled { opacity: .6; cursor: wait; }
    p { max-width: 260px; margin: 6px 0 0; padding: 7px; border-radius: 5px; background: #fff; color: #222; box-shadow: 0 2px 8px #0004; }
  `;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Export visible AccèsD CSV';
  button.setAttribute('aria-label', 'Export visible AccèsD transactions to CSV');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.hidden = true;
  shadow.append(style, button, status);
  document.body.append(host);

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.hidden = false;
    status.textContent = 'Reading visible transactions…';
    try {
      const response = await exportVisible();
      if (!response?.success) throw new Error(response?.error || 'Download failed.');
      status.textContent = `Saved ${response.transactionCount} transactions to Downloads.`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not export transactions.';
    } finally {
      button.disabled = false;
    }
  });
}

let timer: number | undefined;
function scheduleInjection(): void {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    injectButton();
  }, 200);
}

const context = globalThis as typeof globalThis & { __accesdExporterInitialized?: boolean };
if (!context.__accesdExporterInitialized) {
  context.__accesdExporterInitialized = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'EXPORT_ACCESD_FROM_POPUP') return false;
    void exportVisible().then(sendResponse);
    return true;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleInjection, { once: true });
  else scheduleInjection();
  new MutationObserver(scheduleInjection).observe(document.documentElement, { childList: true, subtree: true });
}
