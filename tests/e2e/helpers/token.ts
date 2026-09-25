import { expect, Page } from '@playwright/test';

/** Load the token through the same button a user must click before exporting. */
export async function ensureTokenLoaded(page: Page): Promise<void> {
    const status = page.locator('#ws-token-status');
    await expect(status).not.toContainText('Checking...');
    if (!(await status.textContent())?.includes('Stored for this browser session')) {
        await page.locator('#ws-get-token').click();
    }
    await expect(status).toContainText('Stored for this browser session');
    await expect(page.locator('#ws-export-btn')).toBeEnabled();
}
